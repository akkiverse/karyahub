"""Sync, import and logo routes (CR-0009). All under /api/v1 and all for a signed-in person of a business."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from karyahub.accounts import service as accounts
from karyahub.accounts.deps import BusinessPrincipalDep, DbDep, require
from karyahub.data import inventory_import, logo, service

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
    data_url: str = Field(max_length=300_000)


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
