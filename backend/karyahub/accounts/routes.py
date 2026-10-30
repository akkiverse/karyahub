"""Sign-in, team and business routes (CR-0005). All under /api/v1."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from karyahub.accounts import demo, service
from karyahub.accounts.deps import (
    COOKIE,
    BusinessPrincipalDep,
    DbDep,
    OptionalPrincipal,
    SettingsDep,
    SignedInDep,
    clear_session_cookie,
    require,
    set_session_cookie,
)
from karyahub.adapters import get_adapters
from karyahub.errors import AppError

router = APIRouter(prefix="/api/v1")


def me_payload(p: service.Principal | None) -> dict:
    if p is None:
        return {"signed_in": False}
    return {
        "signed_in": True,
        "user": {
            "id": p.user.id,
            "name": p.user.name,
            "phone": p.user.phone,
            "role": p.user.role,
            "must_change_pin": p.user.must_change_pin,
        },
        "business": service.business_dict(p.business) if p.business else None,
        "permissions": sorted(p.permissions),
    }


class SignInRequest(BaseModel):
    phone: str = Field(max_length=20)
    pin: str = Field(max_length=12)


class BootstrapRequest(BaseModel):
    token: str = Field(max_length=200)
    name: str = Field(max_length=60)
    phone: str = Field(max_length=20)
    pin: str = Field(max_length=12)


class ChangePinRequest(BaseModel):
    current_pin: str = Field(max_length=12)
    new_pin: str = Field(max_length=12)


class ForgotRequest(BaseModel):
    phone: str = Field(max_length=20)


class ResetPinRequest(BaseModel):
    phone: str = Field(max_length=20)
    code: str = Field(max_length=10)
    new_pin: str = Field(max_length=12)


# ---------- sign-in ----------
@router.get("/auth/state")
async def auth_state(db: DbDep) -> dict:
    return {
        "needs_setup": not await service.has_platform_admin(db),
        "demo_accounts": await demo.demo_accounts(db),
    }


@router.get("/auth/me")
async def me(p: OptionalPrincipal) -> dict:
    return me_payload(p)


@router.post("/auth/sign-in")
async def sign_in(
    req: SignInRequest, request: Request, response: Response, db: DbDep, settings: SettingsDep
) -> dict:
    principal, token = await service.sign_in(db, settings, req.phone, req.pin)
    set_session_cookie(request, response, token, settings)
    return me_payload(principal)


@router.post("/auth/sign-out")
async def sign_out(request: Request, response: Response, db: DbDep) -> dict:
    await service.sign_out(db, request.cookies.get(COOKIE))
    clear_session_cookie(request, response)
    return {"signed_in": False}


@router.post("/auth/bootstrap")
async def bootstrap(req: BootstrapRequest, db: DbDep, settings: SettingsDep) -> dict:
    user = await service.bootstrap(db, settings, req.token, req.name, req.phone, req.pin)
    return {"created": True, "name": user.name}


@router.post("/auth/change-pin")
async def change_pin(req: ChangePinRequest, p: SignedInDep, db: DbDep, settings: SettingsDep) -> dict:
    await service.change_pin(db, settings, p, req.current_pin, req.new_pin)
    return {"changed": True}


@router.post("/auth/forgot")
async def forgot(req: ForgotRequest, db: DbDep, settings: SettingsDep) -> dict:
    issue = await service.issue_otp(db, settings, req.phone)
    if not issue.deliverable:
        raise AppError(
            "otp_unavailable",
            "Text-message codes aren't switched on yet. Ask your business owner to reset your PIN in Admin.",
            503,
        )
    body = {"sent": True, "message": "If that number has an active account, a 6-digit code is on its way."}
    if issue.user and issue.code:
        text = f"Your KaryaHub code is {issue.code}. It works for 10 minutes. Don't share it with anyone."
        if issue.demo:
            body["demo_code"] = issue.code  # the demo business only: nothing is really sent
        else:
            await get_adapters(settings).whatsapp.send(issue.user.phone, "template", text)
    return body


@router.post("/auth/reset-pin")
async def reset_pin(req: ResetPinRequest, db: DbDep, settings: SettingsDep) -> dict:
    await service.reset_pin_with_otp(db, settings, req.phone, req.code, req.new_pin)
    return {"reset": True}


# ---------- team (business owners and anyone given "manage team") ----------
class MemberRequest(BaseModel):
    name: str = Field(max_length=60)
    phone: str = Field(max_length=20)
    role: Literal["owner", "coordinator", "technician"]
    pin: str | None = Field(None, max_length=12)
    must_change_pin: bool = True


class ImportRequest(BaseModel):
    csv: str = Field(max_length=200_000)


class MemberPatch(BaseModel):
    name: str | None = Field(None, max_length=60)
    role: Literal["owner", "coordinator", "technician"] | None = None
    active: bool | None = None


class PinRequest(BaseModel):
    pin: str | None = Field(None, max_length=12)


class OverridesRequest(BaseModel):
    overrides: dict[str, Literal["allow", "deny", "default"]]


class RolePermissionsRequest(BaseModel):
    permissions: dict[str, bool]


class ProfileRequest(BaseModel):
    name: str | None = Field(None, max_length=80)
    address: str | None = Field(None, max_length=200)
    gstin: str | None = Field(None, max_length=15)
    state_code: str | None = Field(None, max_length=2)


ManageTeam = Annotated[service.Principal, Depends(require("manage_team"))]


@router.get("/team")
async def team(p: ManageTeam, db: DbDep) -> dict:
    return await service.list_team(db, p)


@router.post("/team", status_code=201)
async def add_member(req: MemberRequest, p: ManageTeam, db: DbDep, settings: SettingsDep) -> dict:
    user, pin = await service.add_member(
        db, settings, p, req.name, req.phone, req.role, req.pin, req.must_change_pin
    )
    return {"member": service._member(user, {}), "pin": pin}


@router.post("/team/import")
async def import_members(req: ImportRequest, p: ManageTeam, db: DbDep, settings: SettingsDep) -> dict:
    return await service.import_members(db, settings, p, req.csv)


@router.patch("/team/{user_id}")
async def update_member(user_id: str, req: MemberPatch, p: ManageTeam, db: DbDep) -> dict:
    return await service.update_member(db, p, user_id, req.role, req.active, req.name)


@router.post("/team/{user_id}/reset-pin")
async def reset_member_pin(
    user_id: str, req: PinRequest, p: ManageTeam, db: DbDep, settings: SettingsDep
) -> dict:
    user, pin = await service.reset_member_pin(db, settings, p, user_id, req.pin)
    return {"name": user.name, "pin": pin}


@router.put("/team/{user_id}/permissions")
async def member_permissions(user_id: str, req: OverridesRequest, p: ManageTeam, db: DbDep) -> dict:
    return await service.set_member_overrides(db, p, user_id, req.overrides)


@router.put("/team/roles/{role}/permissions")
async def role_permissions(role: str, req: RolePermissionsRequest, p: ManageTeam, db: DbDep) -> dict:
    await service.set_role_permissions(db, p, role, req.permissions)
    return await service.list_team(db, p)


@router.get("/team/audit")
async def audit_log(p: ManageTeam, db: DbDep, limit: int = 50) -> dict:
    return {"entries": await service.list_audit(db, p, limit)}


@router.put("/business/profile")
async def business_profile(
    req: ProfileRequest, p: Annotated[service.Principal, Depends(require("manage_settings"))], db: DbDep
) -> dict:
    return await service.update_business_profile(db, p, req.model_dump())


# ---------- the platform admin ----------
class NewBusinessRequest(BaseModel):
    name: str = Field(max_length=80)
    address: str = Field("", max_length=200)
    gstin: str = Field("", max_length=15)
    state_code: str = Field("27", max_length=2)
    owner_name: str = Field(max_length=60)
    owner_phone: str = Field(max_length=20)
    owner_pin: str | None = Field(None, max_length=12)


class ActiveRequest(BaseModel):
    active: bool


PlatformAdmin = Annotated[service.Principal, Depends(require("manage_businesses"))]


@router.get("/platform/businesses")
async def businesses(_: PlatformAdmin, db: DbDep) -> dict:
    return {"businesses": await service.list_businesses(db)}


@router.post("/platform/businesses", status_code=201)
async def new_business(req: NewBusinessRequest, p: PlatformAdmin, db: DbDep, settings: SettingsDep) -> dict:
    fields = {
        "name": req.name,
        "address": req.address,
        "gstin": req.gstin.strip().upper(),
        "state_code": req.state_code,
    }
    business, owner, pin = await service.create_business(
        db, settings, p, fields, req.owner_name, req.owner_phone, req.owner_pin
    )
    return {
        "business": service.business_dict(business),
        "owner": {"id": owner.id, "name": owner.name, "phone": owner.phone},
        "pin": pin,
    }


@router.patch("/platform/businesses/{business_id}")
async def business_active(business_id: str, req: ActiveRequest, p: PlatformAdmin, db: DbDep) -> dict:
    return await service.set_business_active(db, p, business_id, req.active)


@router.post("/platform/owners/{user_id}/reset-pin")
async def owner_reset(
    user_id: str, req: PinRequest, p: PlatformAdmin, db: DbDep, settings: SettingsDep
) -> dict:
    user, pin = await service.reset_owner_pin(db, settings, p, user_id, req.pin)
    return {"name": user.name, "pin": pin}


__all__ = ["BusinessPrincipalDep", "router"]
