"""Sync, import and logo routes (CR-0009). All under /api/v1 and all for a signed-in person of a business."""

import re
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from karyahub import sender
from karyahub.accounts import service as accounts
from karyahub.accounts.deps import BusinessPrincipalDep, DbDep, require
from karyahub.data import bill_render, bills, business_setup, inventory_import, logo, service
from karyahub.errors import AppError

router = APIRouter(prefix="/api/v1")


class SyncRequest(BaseModel):
    since: int = Field(0, ge=0)
    ops: list[dict[str, Any]] = Field(default_factory=list, max_length=service.MAX_OPS)


class ImportRequest(BaseModel):
    device_id: str = Field(max_length=64)
    customer: list[dict[str, Any]] = Field(default_factory=list)
    job: list[dict[str, Any]] = Field(default_factory=list)
    document: list[dict[str, Any]] = Field(default_factory=list)
    message: list[dict[str, Any]] = Field(default_factory=list)


class InventoryImportRequest(BaseModel):
    text: str = Field(max_length=1_200_000)
    name: str = Field("", max_length=120)
    check: bool = True  # look at the file first; nothing is saved unless this is false


class LogoRequest(BaseModel):
    data_url: str = Field(max_length=2_000_000)


class SignatureRequest(BaseModel):
    data_url: str = Field(max_length=2_000_000)


class SetupRequest(BaseModel):
    business_type: str | None = Field(None, max_length=12)
    gst_registration: str | None = Field(None, max_length=14)
    state_code: str | None = Field(None, max_length=2)
    packs: list[str] | None = Field(None, max_length=5)


@router.post("/sync")
async def sync(req: SyncRequest, p: BusinessPrincipalDep, db: DbDep) -> dict[str, Any]:
    return await service.sync(db, p, since=req.since, ops=req.ops)


@router.post("/import")
async def import_device(req: ImportRequest, p: BusinessPrincipalDep, db: DbDep) -> dict[str, Any]:
    data = {k: getattr(req, k) for k in service.IMPORT_KINDS}
    return await service.import_from_device(db, p, device_id=req.device_id, data=data)


@router.post("/inventory/import")
async def import_inventory(req: InventoryImportRequest, p: BusinessPrincipalDep, db: DbDep) -> dict[str, Any]:
    return await inventory_import.import_csv(db, p, text=req.text, name=req.name, check=req.check)


ManageSettings = Annotated[accounts.Principal, Depends(require("manage_settings"))]


@router.put("/business/logo")
async def put_logo(req: LogoRequest, p: ManageSettings, db: DbDep) -> dict:
    return await logo.set_logo(db, p, req.data_url)


@router.delete("/business/logo")
async def delete_logo(p: ManageSettings, db: DbDep) -> dict:
    return await logo.clear_logo(db, p)


@router.get("/business/logo")
async def get_logo(p: BusinessPrincipalDep, db: DbDep) -> Response:
    mime, raw = await logo.get_logo(db, p)
    headers = {"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"}
    return Response(content=raw, media_type=mime, headers=headers)


# ---------- business type, packs and bill look (CR-0012) ----------
@router.get("/business/setup")
async def get_setup(p: BusinessPrincipalDep) -> dict[str, Any]:
    return business_setup.setup_dict(accounts._require_business(p))


@router.put("/business/setup")
async def put_setup(req: SetupRequest, p: ManageSettings, db: DbDep) -> dict[str, Any]:
    return await business_setup.put_setup(db, p, req.model_dump())


@router.get("/business/bill-look")
async def get_look(p: BusinessPrincipalDep) -> dict[str, Any]:
    return business_setup.look_of(accounts._require_business(p))


@router.put("/business/bill-look")
async def put_look(req: dict[str, Any], p: ManageSettings, db: DbDep) -> dict[str, Any]:
    return await business_setup.put_look(db, p, req)


@router.put("/business/signature")
async def put_signature(req: SignatureRequest, p: ManageSettings, db: DbDep) -> dict:
    return await business_setup.set_signature(db, p, req.data_url)


@router.delete("/business/signature")
async def delete_signature(p: ManageSettings, db: DbDep) -> dict:
    return await business_setup.clear_signature(db, p)


# ---------- estimates and bills (CR-0012) ----------
MakeBills = Annotated[accounts.Principal, Depends(require("create_documents"))]


class DocActionRequest(BaseModel):
    action: str = Field(max_length=20)
    how: str = Field("", max_length=12)
    reason: str = Field("", max_length=200)
    paid_on: str = Field("", max_length=10)


class LinkRequest(BaseModel):
    on: bool


class MakeBillRequest(BaseModel):
    bill_id: str = Field(max_length=64)


@router.post("/documents/{doc_id}/actions")
async def document_action(doc_id: str, req: DocActionRequest, p: MakeBills, db: DbDep) -> dict[str, Any]:
    return await bills.act(db, p, doc_id, req.model_dump())


@router.put("/documents/{doc_id}/link")
async def document_link(doc_id: str, req: LinkRequest, p: MakeBills, db: DbDep) -> dict[str, Any]:
    return await bills.set_link(db, p, doc_id, req.on)


@router.post("/documents/{doc_id}/send")
async def document_send(doc_id: str, request: Request, p: MakeBills, db: DbDep) -> dict[str, Any]:
    business = accounts._require_business(p)
    return await bills.send(db, p, doc_id, str(request.base_url), sender.sender_for(business))


@router.post("/documents/{doc_id}/make-bill")
async def document_make_bill(doc_id: str, req: MakeBillRequest, p: MakeBills, db: DbDep) -> dict[str, Any]:
    return await bills.make_bill(db, p, doc_id, req.bill_id)


@router.get("/business/signature")
async def get_signature(p: BusinessPrincipalDep, db: DbDep) -> Response:
    found = await business_setup.signature_bytes(db, accounts._require_business(p).id)
    if found is None:
        raise AppError("not_found", "This business has no signature yet.", 404)
    headers = {"Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff"}
    return Response(content=found[1], media_type=found[0], headers=headers)


# ---------- the public bill link: no sign-in (AC-30.3) ----------
public = APIRouter()
PUBLIC_HEADERS = {
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
}
NOT_VALID = "This bill link isn't valid."


async def _public_bill(db: AsyncSession, token: str) -> tuple[Any, Any, dict[str, Any]] | Response:
    found = await bills.by_token(db, token)
    if found is None:
        return HTMLResponse(bill_render.notice_page(NOT_VALID), status_code=404, headers=PUBLIC_HEADERS)
    business, rec = found
    if not rec.body.get("link_on", True):
        text = f"This bill link has been turned off by {business.name}."
        return HTMLResponse(bill_render.notice_page(text), status_code=410, headers=PUBLIC_HEADERS)
    look = business_setup.look_of(business)
    return business, rec, bill_render.model(rec.body, business.name, look)


@public.get("/b/{token}", response_class=HTMLResponse)
async def public_page(token: str, db: DbDep) -> Response:
    got = await _public_bill(db, token)
    if isinstance(got, Response):
        return got
    business, _, m = got
    logo_img = await business_setup.logo_bytes(db, business.id)
    signature = await business_setup.signature_bytes(db, business.id)
    html = bill_render.page_html(m, f"/b/{token}/pdf", logo_img, signature)
    return HTMLResponse(html, headers=PUBLIC_HEADERS)


@public.get("/b/{token}/pdf")
async def public_pdf(token: str, db: DbDep) -> Response:
    got = await _public_bill(db, token)
    if isinstance(got, Response):
        return got
    business, rec, m = got
    logo_img = await business_setup.logo_bytes(db, business.id)
    signature = await business_setup.signature_bytes(db, business.id)
    try:
        data = bill_render.pdf_bytes(m, logo_img, signature)
    except Exception as exc:  # never a blank 500 for a customer
        raise AppError("pdf_failed", "Couldn't make the PDF. Try again.", 500) from exc
    name = re.sub(r"[^A-Za-z0-9-]+", "-", rec.number or "bill").strip("-")
    headers = {**PUBLIC_HEADERS, "Content-Disposition": f'attachment; filename="{name}.pdf"'}
    return Response(content=data, media_type="application/pdf", headers=headers)
