"""Request helpers for sign-in (CR-0005): the session cookie, the signed-in person and permission checks."""

from collections.abc import AsyncIterator, Callable
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from karyahub.accounts import service
from karyahub.db.engine import db_session
from karyahub.errors import AppError
from karyahub.settings import Settings, get_settings
from karyahub.tenancy import Tenant

COOKIE = "kh_session"
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "karyahub"
SettingsDep = Annotated[Settings, Depends(get_settings)]


async def get_db(settings: SettingsDep) -> AsyncIterator[AsyncSession]:
    async for db in db_session(settings):
        yield db


DbDep = Annotated[AsyncSession, Depends(get_db)]


def _secure(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"


def set_session_cookie(request: Request, response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        COOKIE,
        token,
        max_age=settings.session_hours * 3600,
        httponly=True,
        samesite="lax",
        secure=_secure(request),
        path="/",
    )


def clear_session_cookie(request: Request, response: Response) -> None:
    response.delete_cookie(COOKIE, path="/", httponly=True, samesite="lax", secure=_secure(request))


async def optional_principal(request: Request, db: DbDep) -> service.Principal | None:
    token = request.cookies.get(COOKIE)
    if (
        token
        and request.method not in {"GET", "HEAD", "OPTIONS"}
        and request.headers.get(CSRF_HEADER) != CSRF_VALUE
    ):
        raise AppError(
            "csrf", "This request didn't come from the KaryaHub app. Reload the page and try again.", 403
        )
    return await service.principal_for_token(db, token)


OptionalPrincipal = Annotated[service.Principal | None, Depends(optional_principal)]


async def signed_in_principal(p: OptionalPrincipal) -> service.Principal:
    if p is None:
        raise AppError("signin_required", "Sign in to use KaryaHub.", 401)
    return p


async def require_principal(
    p: Annotated[service.Principal, Depends(signed_in_principal)],
) -> service.Principal:
    """Signed in and not on a temporary PIN. (Choosing a new PIN uses SignedInDep, which skips this.)"""
    if p.user.must_change_pin:
        raise AppError("pin_change_required", "Choose your own PIN before you continue.", 403)
    return p


SignedInDep = Annotated[service.Principal, Depends(signed_in_principal)]
PrincipalDep = Annotated[service.Principal, Depends(require_principal)]


def require(*permissions: str) -> Callable[..., service.Principal]:
    """Dependency: signed in, with at least one of these permissions."""

    async def check(p: PrincipalDep) -> service.Principal:
        if not any(perm in p.permissions for perm in permissions):
            raise AppError("forbidden", "Your access doesn't include this. Ask your business owner.", 403)
        return p

    return check


async def require_business(p: PrincipalDep) -> service.Principal:
    if p.business is None:
        raise AppError("forbidden", "This needs a business account.", 403)
    return p


BusinessPrincipalDep = Annotated[service.Principal, Depends(require_business)]


def tenant_for(p: service.Principal) -> Tenant:
    b = service._require_business(p)
    return Tenant(
        id=b.id,
        business_name=b.name,
        address=b.address,
        gstin=b.gstin,
        state_code=b.state_code,
        vertical=b.vertical,
        language=b.language,
        amc_visit_every_days=b.amc_visit_every_days,
        amc_lead_days=b.amc_lead_days,
        is_demo=b.is_demo,
    )


async def tenant_dep(p: BusinessPrincipalDep) -> Tenant:
    return tenant_for(p)


TenantDep = Annotated[Tenant, Depends(tenant_dep)]
