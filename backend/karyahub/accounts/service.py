"""Sign-in, sessions, teams, permissions and businesses (CR-0005). Every function takes a database session.

Rules worth knowing:
- A phone number belongs to one person in one business (or is the platform admin).
- Wrong PINs are counted per phone number, whether or not it has an account, so lock-outs look the same.
- Owners can't be locked out of managing their team or settings, and a business always keeps one active owner.
- The demo business is read-only for team changes: its PINs are public on purpose.
"""

import csv
import hashlib
import hmac
import io
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from karyahub import access
from karyahub.accounts import security
from karyahub.db.models import (
    AuditLog,
    Business,
    OtpChallenge,
    RolePermission,
    Session,
    SignInThrottle,
    User,
    UserPermission,
)
from karyahub.errors import AppError
from karyahub.settings import Settings

SIGN_IN_FAILED = "That mobile number and PIN don't match an active account. Check them, or use Forgot PIN."
BUSINESS_ROLES = ["owner", "coordinator", "technician"]
ROLE_WORDS = {
    "owner": "owner",
    "admin": "owner",
    "coordinator": "coordinator",
    "office coordinator": "coordinator",
    "technician": "technician",
    "tech": "technician",
}
GSTIN = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$")
MAX_IMPORT_ROWS = 200


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


@dataclass
class Principal:
    user: User
    business: Business | None
    permissions: frozenset[str]

    def can(self, permission: str) -> bool:
        return permission in self.permissions


# ---------- permissions ----------
async def _overrides(db: AsyncSession, user: User) -> tuple[dict[str, bool], dict[str, bool]]:
    role_rows = []
    if user.business_id:
        role_rows = (
            await db.execute(
                select(RolePermission).where(
                    RolePermission.business_id == user.business_id, RolePermission.role == user.role
                )
            )
        ).scalars()
    user_rows = (await db.execute(select(UserPermission).where(UserPermission.user_id == user.id))).scalars()
    return {r.permission: r.allowed for r in role_rows}, {r.permission: r.allowed for r in user_rows}


async def permissions_for(db: AsyncSession, user: User) -> frozenset[str]:
    role_over, user_over = await _overrides(db, user)
    return access.effective_permissions(user.role, role_over, user_over)


async def _principal(db: AsyncSession, user: User) -> Principal:
    business = await db.get(Business, user.business_id) if user.business_id else None
    return Principal(user, business, await permissions_for(db, user))


async def audit(db: AsyncSession, business_id: str | None, actor: str, action: str, detail: str = "") -> None:
    db.add(AuditLog(business_id=business_id, actor_name=actor, action=action, detail=detail, at=utcnow()))


# ---------- sessions ----------
async def principal_for_token(db: AsyncSession, token: str | None) -> Principal | None:
    if not token:
        return None
    sess = await db.get(Session, security.token_hash(token))
    if not sess or sess.expires_at <= utcnow():
        return None
    user = await db.get(User, sess.user_id)
    if not user or not user.active:
        return None
    business = await db.get(Business, user.business_id) if user.business_id else None
    if business is not None and not business.active:
        return None
    return Principal(user, business, await permissions_for(db, user))


async def _start_session(db: AsyncSession, settings: Settings, user: User) -> str:
    token, hashed = security.new_token()
    now = utcnow()
    await db.execute(delete(Session).where(Session.user_id == user.id, Session.expires_at <= now))
    db.add(
        Session(
            id=hashed,
            user_id=user.id,
            created_at=now,
            expires_at=now + timedelta(hours=settings.session_hours),
        )
    )
    return token


async def end_sessions(db: AsyncSession, user_id: str) -> None:
    await db.execute(delete(Session).where(Session.user_id == user_id))


async def sign_out(db: AsyncSession, token: str | None) -> None:
    if token:
        await db.execute(delete(Session).where(Session.id == security.token_hash(token)))
        await db.commit()


# ---------- sign-in ----------
async def _locked_minutes(db: AsyncSession, phone: str) -> int:
    row = await db.get(SignInThrottle, phone)
    if row and row.locked_until and row.locked_until > utcnow():
        return max(1, int((row.locked_until - utcnow()).total_seconds() // 60) + 1)
    return 0


async def _register_failure(db: AsyncSession, settings: Settings, phone: str) -> None:
    row = await db.get(SignInThrottle, phone)
    if row is None:
        row = SignInThrottle(phone=phone, failures=0)
        db.add(row)
    row.failures = (row.failures or 0) + 1
    if row.failures >= settings.lockout_failures:
        row.failures = 0
        row.locked_until = utcnow() + timedelta(minutes=settings.lockout_minutes)
    await db.commit()


async def sign_in(db: AsyncSession, settings: Settings, phone_raw: str, pin: str) -> tuple[Principal, str]:
    phone = security.normalise_phone(phone_raw)
    if not security.valid_phone(phone) or not re.fullmatch(r"\d{4,6}", pin or ""):
        raise AppError("sign_in_failed", SIGN_IN_FAILED, 401)
    wait = await _locked_minutes(db, phone)
    if wait:
        raise AppError(
            "locked",
            f"Too many wrong tries. Wait about {wait} minutes, or use Forgot PIN to set a new one.",
            429,
        )
    user = (await db.execute(select(User).where(User.phone == phone))).scalar_one_or_none()
    ok = security.verify_pin(pin, user.pin_hash if user else None, settings.pepper())
    business = await db.get(Business, user.business_id) if user and user.business_id else None
    usable = bool(user and user.active and (business is None or business.active))
    if not (ok and usable):
        await _register_failure(db, settings, phone)
        raise AppError("sign_in_failed", SIGN_IN_FAILED, 401)
    assert user is not None
    throttle = await db.get(SignInThrottle, phone)
    if throttle:
        await db.delete(throttle)
    token = await _start_session(db, settings, user)
    user.last_sign_in = utcnow()
    await audit(db, user.business_id, user.name, "sign_in", f"Signed in as {user.role}")
    await db.commit()
    return await _principal(db, user), token


# ---------- the platform admin ----------
async def has_platform_admin(db: AsyncSession) -> bool:
    return bool(
        (
            await db.execute(select(func.count()).select_from(User).where(User.role == access.PLATFORM_ROLE))
        ).scalar()
    )


async def bootstrap(
    db: AsyncSession, settings: Settings, token: str, name: str, phone_raw: str, pin: str
) -> User:
    """Create the platform admin, or reset their PIN, with the setup token the founder put in Vercel."""
    expected = settings.bootstrap_token
    if not expected:
        raise AppError("not_configured", "Not configured: add KARYAHUB_BOOTSTRAP_TOKEN", 503)
    if not hmac.compare_digest(token.encode(), expected.encode()):
        raise AppError("forbidden", "That setup token isn't right.", 403)
    phone = security.normalise_phone(phone_raw)
    _check_person(name, phone, pin)
    existing = (await db.execute(select(User).where(User.role == access.PLATFORM_ROLE))).scalars().first()
    pin_hash = security.hash_pin(pin, settings.pepper())
    if existing:
        if existing.phone != phone:
            raise AppError(
                "forbidden",
                "A platform admin already exists. Use their mobile number to recover access.",
                403,
            )
        existing.pin_hash, existing.must_change_pin, existing.active = pin_hash, False, True
        await end_sessions(db, existing.id)
        await db.execute(delete(SignInThrottle).where(SignInThrottle.phone == phone))
        await audit(db, None, existing.name, "platform_admin_recovered", "PIN reset with the setup token")
        await db.commit()
        return existing
    user = User(
        id=security.new_id("u"),
        business_id=None,
        name=name.strip(),
        phone=phone,
        role=access.PLATFORM_ROLE,
        active=True,
        pin_hash=pin_hash,
        must_change_pin=False,
        created_at=utcnow(),
    )
    db.add(user)
    await _commit_unique(db)
    await audit(db, None, user.name, "platform_admin_created", "")
    await db.commit()
    return user


# ---------- changing and forgetting PINs ----------
async def change_pin(db: AsyncSession, settings: Settings, p: Principal, current: str, new: str) -> None:
    if not security.verify_pin(current, p.user.pin_hash, settings.pepper()):
        raise AppError("wrong_pin", "Your current PIN isn't right.", 400)
    problem = security.pin_problem(new)
    if problem:
        raise AppError("weak_pin", problem, 422)
    if new == current:
        raise AppError("weak_pin", "Choose a PIN you haven't used just now.", 422)
    p.user.pin_hash = security.hash_pin(new, settings.pepper())
    p.user.must_change_pin = False
    await audit(db, p.user.business_id, p.user.name, "pin_changed", "Changed their own PIN")
    await db.commit()


@dataclass
class OtpIssue:
    user: User | None
    code: str | None
    deliverable: bool
    demo: bool


def _otp_hash(code: str, challenge_id: str, settings: Settings) -> str:
    return hmac.new(settings.pepper().encode(), f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()


async def issue_otp(db: AsyncSession, settings: Settings, phone_raw: str) -> OtpIssue:
    """Create a reset code for a known, active person. The caller delivers it (WhatsApp) when deliverable."""
    phone = security.normalise_phone(phone_raw)
    if not security.valid_phone(phone):
        raise AppError("validation_error", "Enter a 10-digit mobile number.", 422)
    recent = (
        await db.execute(
            select(func.count())
            .select_from(OtpChallenge)
            .where(OtpChallenge.phone == phone, OtpChallenge.created_at > utcnow() - timedelta(minutes=15))
        )
    ).scalar() or 0
    if recent >= 3:
        raise AppError(
            "too_many_codes", "You've asked for several codes. Wait 15 minutes and try again.", 429
        )
    user = (await db.execute(select(User).where(User.phone == phone))).scalar_one_or_none()
    business = await db.get(Business, user.business_id) if user and user.business_id else None
    usable = bool(user and user.active and (business is None or business.active))
    demo = bool(business and business.is_demo)
    # Codes go out over WhatsApp, which is simulated until live; only demo accounts see a simulated code.
    deliverable = settings.mode == "live" or demo
    cid = security.new_id("otp")
    code = f"{secrets.randbelow(900000) + 100000}"
    db.add(
        OtpChallenge(
            id=cid,
            phone=phone,
            code_hash=_otp_hash(code, cid, settings),
            created_at=utcnow(),
            expires_at=utcnow() + timedelta(seconds=settings.otp_ttl_seconds),
        )
    )
    await db.commit()
    return OtpIssue(user if usable else None, code if usable and deliverable else None, deliverable, demo)


async def reset_pin_with_otp(
    db: AsyncSession, settings: Settings, phone_raw: str, code: str, new_pin: str
) -> None:
    phone = security.normalise_phone(phone_raw)
    bad = AppError("bad_code", "That code isn't right or has expired. Ask for a new one.", 400)
    problem = security.pin_problem(new_pin)
    if problem:
        raise AppError("weak_pin", problem, 422)
    row = (
        (
            await db.execute(
                select(OtpChallenge)
                .where(
                    OtpChallenge.phone == phone,
                    OtpChallenge.used.is_(False),
                    OtpChallenge.expires_at > utcnow(),
                )
                .order_by(OtpChallenge.created_at.desc())
            )
        )
        .scalars()
        .first()
    )
    if row is None or row.attempts >= 5:
        raise bad
    row.attempts += 1
    if not hmac.compare_digest(row.code_hash, _otp_hash(str(code).strip(), row.id, settings)):
        await db.commit()
        raise bad
    user = (await db.execute(select(User).where(User.phone == phone))).scalar_one_or_none()
    if not user or not user.active:
        raise bad
    row.used = True
    user.pin_hash = security.hash_pin(new_pin, settings.pepper())
    user.must_change_pin = False
    await end_sessions(db, user.id)
    await db.execute(delete(SignInThrottle).where(SignInThrottle.phone == phone))
    await audit(db, user.business_id, user.name, "pin_reset_otp", "Reset their own PIN with a code")
    await db.commit()


# ---------- helpers ----------
def _check_person(name: str, phone: str, pin: str | None, *, need_pin: bool = True) -> None:
    n = (name or "").strip()
    if not 2 <= len(n) <= 60:
        raise AppError("validation_error", "Enter the person's name (2 to 60 letters).", 422)
    if not security.valid_phone(phone):
        raise AppError("validation_error", "Use a 10-digit mobile number.", 422)
    if need_pin or pin:
        problem = security.pin_problem(pin)
        if problem:
            raise AppError("validation_error", problem, 422)


async def _commit_unique(db: AsyncSession) -> None:
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise AppError(
            "phone_in_use",
            "That mobile number already has a KaryaHub account (in this or another business).",
            409,
        ) from exc


def _require_business(p: Principal) -> Business:
    if p.business is None:
        raise AppError("forbidden", "This needs a business account.", 403)
    return p.business


def assert_editable(business: Business) -> None:
    if business.is_demo:
        raise AppError(
            "demo_readonly",
            "This is the demo business, so its team can't be changed. Ask for your own business.",
            403,
        )


def _member(u: User, overrides: dict[str, bool]) -> dict:
    return {
        "id": u.id,
        "name": u.name,
        "phone": u.phone,
        "role": u.role,
        "active": u.active,
        "must_change_pin": u.must_change_pin,
        "last_sign_in": u.last_sign_in.isoformat(timespec="seconds") if u.last_sign_in else None,
        "overrides": {k: ("allow" if v else "deny") for k, v in overrides.items()},
    }


async def _get_member(db: AsyncSession, p: Principal, user_id: str) -> User:
    business = _require_business(p)
    u = await db.get(User, user_id)
    if not u or u.business_id != business.id:
        raise AppError("not_found", "That person isn't on your team.", 404)
    return u


def _only_owner_touches_owner(p: Principal, target_role: str) -> None:
    if (target_role == "owner") and p.user.role != "owner":
        raise AppError("forbidden", "Only an owner can add or change owners.", 403)


# ---------- team ----------
async def list_team(db: AsyncSession, p: Principal) -> dict:
    business = _require_business(p)
    users = (
        (
            await db.execute(
                select(User).where(User.business_id == business.id).order_by(User.created_at, User.name)
            )
        )
        .scalars()
        .all()
    )
    over = (
        (await db.execute(select(UserPermission).where(UserPermission.user_id.in_([u.id for u in users]))))
        .scalars()
        .all()
    )
    by_user: dict[str, dict[str, bool]] = {}
    for o in over:
        by_user.setdefault(o.user_id, {})[o.permission] = o.allowed
    role_rows = (
        (await db.execute(select(RolePermission).where(RolePermission.business_id == business.id)))
        .scalars()
        .all()
    )
    role_over: dict[str, dict[str, bool]] = {}
    for r in role_rows:
        role_over.setdefault(r.role, {})[r.permission] = r.allowed
    matrix = {
        role: {
            pid: pid in access.effective_permissions(role, role_over.get(role))
            for pid in access.BUSINESS_PERMISSION_IDS
        }
        for role in BUSINESS_ROLES
    }
    return {
        "members": [_member(u, by_user.get(u.id, {})) for u in users],
        "roles": [r.model_dump() for r in access.ROLES],
        "permissions": [
            {"id": x.id, "label": x.label, "locked_for_owner": x.id in access.OWNER_LOCKED}
            for x in access.PERMISSIONS
        ],
        "role_permissions": matrix,
        "editable": not business.is_demo,
    }


async def add_member(
    db: AsyncSession,
    settings: Settings,
    p: Principal,
    name: str,
    phone_raw: str,
    role: str,
    pin: str | None,
    must_change: bool = True,
) -> tuple[User, str]:
    business = _require_business(p)
    assert_editable(business)
    if role not in BUSINESS_ROLES:
        raise AppError("validation_error", "Pick a role: owner, coordinator or technician.", 422)
    _only_owner_touches_owner(p, role)
    phone = security.normalise_phone(phone_raw)
    chosen = pin or security.generate_pin()
    _check_person(name, phone, chosen)
    user = User(
        id=security.new_id("u"),
        business_id=business.id,
        name=name.strip(),
        phone=phone,
        role=role,
        active=True,
        pin_hash=security.hash_pin(chosen, settings.pepper()),
        must_change_pin=must_change,
        created_at=utcnow(),
    )
    db.add(user)
    await _commit_unique(db)
    await audit(db, business.id, p.user.name, "member_added", f"Added {user.name} as {role}")
    await db.commit()
    return user, chosen


def _parse_role(raw: str) -> str | None:
    return ROLE_WORDS.get((raw or "").strip().lower())


async def import_members(db: AsyncSession, settings: Settings, p: Principal, text: str) -> dict:
    """CSV with a header: name, phone, role, pin (pin optional). Good rows are added; bad rows are listed."""
    business = _require_business(p)
    assert_editable(business)
    rows = list(csv.DictReader(io.StringIO((text or "").lstrip("﻿").strip())))
    if not rows:
        raise AppError(
            "validation_error", "The file has no rows. It needs a header: name, phone, role, pin.", 422
        )
    header = {(h or "").strip().lower() for h in rows[0]}
    missing = {"name", "phone", "role"} - header
    if missing:
        raise AppError(
            "validation_error", f"The file is missing the column(s): {', '.join(sorted(missing))}.", 422
        )
    if len(rows) > MAX_IMPORT_ROWS:
        raise AppError("validation_error", f"Import at most {MAX_IMPORT_ROWS} people at a time.", 422)
    taken = set((await db.execute(select(User.phone))).scalars())
    created, errors = [], []
    for i, raw in enumerate(rows, start=2):  # row 1 is the header
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        phone = security.normalise_phone(row.get("phone"))
        role = _parse_role(row.get("role", ""))
        pin = row.get("pin") or security.generate_pin()
        try:
            if role is None:
                raise AppError("v", "Role must be owner, coordinator or technician.")
            _only_owner_touches_owner(p, role)
            _check_person(row.get("name", ""), phone, pin)
            if phone in taken:
                raise AppError("v", "That mobile number already has a KaryaHub account.")
        except AppError as e:
            errors.append({"row": i, "message": e.message})
            continue
        taken.add(phone)
        db.add(
            User(
                id=security.new_id("u"),
                business_id=business.id,
                name=row["name"],
                phone=phone,
                role=role,
                active=True,
                pin_hash=security.hash_pin(pin, settings.pepper()),
                must_change_pin=True,
                created_at=utcnow(),
            )
        )
        created.append({"name": row["name"], "phone": phone, "role": role, "pin": pin})
    if created:
        await _commit_unique(db)
        await audit(
            db,
            business.id,
            p.user.name,
            "members_imported",
            f"Imported {len(created)} {'person' if len(created) == 1 else 'people'} from a file",
        )
        await db.commit()
    return {"created": created, "errors": errors}


async def _active_owner_count(db: AsyncSession, business_id: str) -> int:
    return (
        await db.execute(
            select(func.count())
            .select_from(User)
            .where(User.business_id == business_id, User.role == "owner", User.active.is_(True))
        )
    ).scalar() or 0


async def update_member(
    db: AsyncSession, p: Principal, user_id: str, role: str | None, active: bool | None, name: str | None
) -> dict:
    business = _require_business(p)
    assert_editable(business)
    u = await _get_member(db, p, user_id)
    _only_owner_touches_owner(p, u.role)
    if u.id == p.user.id and ((role and role != u.role) or active is False):
        raise AppError(
            "forbidden", "You can't change your own role or turn off your own access. Ask another owner.", 403
        )
    if role is not None and role not in BUSINESS_ROLES:
        raise AppError("validation_error", "Pick a role: owner, coordinator or technician.", 422)
    if role:
        _only_owner_touches_owner(p, role)
    loses_owner = u.role == "owner" and u.active and ((role and role != "owner") or active is False)
    if loses_owner and await _active_owner_count(db, business.id) <= 1:
        raise AppError(
            "last_owner", "A business needs at least one active owner. Make someone else an owner first.", 409
        )
    changes = []
    if name is not None and name.strip() != u.name:
        if not 2 <= len(name.strip()) <= 60:
            raise AppError("validation_error", "Enter the person's name (2 to 60 letters).", 422)
        changes.append(f"renamed {u.name} to {name.strip()}")
        u.name = name.strip()
    if role and role != u.role:
        changes.append(f"changed {u.name}'s role from {u.role} to {role}")
        u.role = role
    if active is not None and active != u.active:
        changes.append(f"{'turned on' if active else 'turned off'} access for {u.name}")
        u.active = active
        if not active:
            await end_sessions(db, u.id)
    if changes:
        await audit(db, business.id, p.user.name, "member_updated", "; ".join(changes).capitalize())
        await db.commit()
    return _member(u, await _user_overrides(db, u.id))


async def _user_overrides(db: AsyncSession, user_id: str) -> dict[str, bool]:
    rows = (await db.execute(select(UserPermission).where(UserPermission.user_id == user_id))).scalars()
    return {r.permission: r.allowed for r in rows}


async def reset_member_pin(
    db: AsyncSession, settings: Settings, p: Principal, user_id: str, pin: str | None
) -> tuple[User, str]:
    business = _require_business(p)
    assert_editable(business)
    u = await _get_member(db, p, user_id)
    _only_owner_touches_owner(p, u.role)
    chosen = pin or security.generate_pin()
    problem = security.pin_problem(chosen)
    if problem:
        raise AppError("validation_error", problem, 422)
    u.pin_hash = security.hash_pin(chosen, settings.pepper())
    u.must_change_pin = u.id != p.user.id
    if u.id != p.user.id:
        await end_sessions(db, u.id)
    await db.execute(delete(SignInThrottle).where(SignInThrottle.phone == u.phone))
    await audit(db, business.id, p.user.name, "pin_reset", f"Reset the PIN for {u.name}")
    await db.commit()
    return u, chosen


async def set_member_overrides(
    db: AsyncSession, p: Principal, user_id: str, overrides: dict[str, str]
) -> dict:
    business = _require_business(p)
    assert_editable(business)
    u = await _get_member(db, p, user_id)
    _only_owner_touches_owner(p, u.role)
    for perm, choice in overrides.items():
        if perm not in access.BUSINESS_PERMISSION_IDS or choice not in {"allow", "deny", "default"}:
            raise AppError("validation_error", f"'{perm}: {choice}' isn't a valid access setting.", 422)
        if u.role == "owner" and perm in access.OWNER_LOCKED:
            raise AppError("forbidden", "An owner always keeps access to the team and settings.", 403)
    if u.id == p.user.id and overrides.get("manage_team") == "deny":
        raise AppError("forbidden", "You can't take away your own access to the team.", 403)
    await db.execute(
        delete(UserPermission).where(
            UserPermission.user_id == u.id, UserPermission.permission.in_(list(overrides))
        )
    )
    for perm, choice in overrides.items():
        if choice != "default":
            db.add(UserPermission(user_id=u.id, permission=perm, allowed=choice == "allow"))
    await audit(db, business.id, p.user.name, "access_changed", f"Changed access for {u.name}")
    await db.commit()
    return _member(u, await _user_overrides(db, u.id))


async def set_role_permissions(
    db: AsyncSession, p: Principal, role: str, permissions: dict[str, bool]
) -> None:
    business = _require_business(p)
    assert_editable(business)
    if role not in access.EDITABLE_ROLES:
        raise AppError(
            "forbidden",
            "Owners always have full access. Only coordinator and technician can be changed.",
            403,
        )
    for perm in permissions:
        if perm not in access.BUSINESS_PERMISSION_IDS:
            raise AppError("validation_error", f"'{perm}' isn't something access can be set for.", 422)
    defaults = {x.id for x in access.PERMISSIONS if role in x.roles}
    await db.execute(
        delete(RolePermission).where(
            RolePermission.business_id == business.id,
            RolePermission.role == role,
            RolePermission.permission.in_(list(permissions)),
        )
    )
    for perm, allowed in permissions.items():
        if allowed != (perm in defaults):  # store only what differs from the starting table
            db.add(RolePermission(business_id=business.id, role=role, permission=perm, allowed=allowed))
    await audit(db, business.id, p.user.name, "role_access_changed", f"Changed what the {role} role can do")
    await db.commit()


async def list_audit(db: AsyncSession, p: Principal, limit: int = 50) -> list[dict]:
    business = _require_business(p)
    rows = (
        await db.execute(
            select(AuditLog)
            .where(AuditLog.business_id == business.id)
            .order_by(AuditLog.id.desc())
            .limit(min(limit, 200))
        )
    ).scalars()
    return [
        {
            "id": r.id,
            "who": r.actor_name,
            "action": r.action,
            "text": r.detail,
            "at": r.at.isoformat(timespec="seconds"),
        }
        for r in rows
    ]


def business_dict(b: Business) -> dict:
    return {
        "id": b.id,
        "name": b.name,
        "address": b.address,
        "gstin": b.gstin,
        "state_code": b.state_code,
        "vertical": b.vertical,
        "language": b.language,
        "amc_visit_every_days": b.amc_visit_every_days,
        "amc_lead_days": b.amc_lead_days,
        "is_demo": b.is_demo,
        "active": b.active,
    }


def _check_profile(name: str, address: str, gstin: str, state_code: str) -> None:
    if not 2 <= len((name or "").strip()) <= 80:
        raise AppError("validation_error", "Enter the business name (2 to 80 characters).", 422)
    if len(address or "") > 200:
        raise AppError("validation_error", "Keep the address under 200 characters.", 422)
    if gstin and not GSTIN.match(gstin):
        raise AppError(
            "validation_error",
            "That GSTIN doesn't look right. It has 15 letters and digits, like 27AAAAA0000A1Z5.",
            422,
        )
    if not re.fullmatch(r"\d{2}", state_code or ""):
        raise AppError("validation_error", "State code is two digits, like 27 for Maharashtra.", 422)


async def update_business_profile(db: AsyncSession, p: Principal, fields: dict) -> dict:
    business = _require_business(p)
    assert_editable(business)
    merged = {**business_dict(business), **{k: v for k, v in fields.items() if v is not None}}
    _check_profile(merged["name"], merged["address"], merged["gstin"], merged["state_code"])
    for key in ("name", "address", "gstin", "state_code"):
        setattr(business, key, merged[key].strip() if isinstance(merged[key], str) else merged[key])
    await audit(db, business.id, p.user.name, "business_updated", "Changed the business details")
    await db.commit()
    return business_dict(business)


# ---------- the platform admin: businesses ----------
async def list_businesses(db: AsyncSession) -> list[dict]:
    businesses = (await db.execute(select(Business).order_by(Business.created_at))).scalars().all()
    counts = dict(
        (
            await db.execute(
                select(User.business_id, func.count())
                .where(User.business_id.is_not(None))
                .group_by(User.business_id)
            )
        ).all()
    )
    owners = (
        (await db.execute(select(User).where(User.role == "owner").order_by(User.created_at))).scalars().all()
    )
    out = []
    for b in businesses:
        out.append(
            {
                **business_dict(b),
                "people": counts.get(b.id, 0),
                "owners": [
                    {"id": o.id, "name": o.name, "phone": o.phone, "active": o.active}
                    for o in owners
                    if o.business_id == b.id
                ],
            }
        )
    return out


async def create_business(
    db: AsyncSession,
    settings: Settings,
    p: Principal,
    fields: dict,
    owner_name: str,
    owner_phone: str,
    owner_pin: str | None,
) -> tuple[Business, User, str]:
    _check_profile(
        fields["name"], fields.get("address", ""), fields.get("gstin", ""), fields.get("state_code", "27")
    )
    phone = security.normalise_phone(owner_phone)
    pin = owner_pin or security.generate_pin()
    _check_person(owner_name, phone, pin)
    business = Business(
        id=security.new_id("b"),
        name=fields["name"].strip(),
        address=(fields.get("address") or "").strip(),
        gstin=fields.get("gstin", ""),
        state_code=fields.get("state_code", "27"),
        vertical="ac_service",
        language="en",
        amc_visit_every_days=90,
        amc_lead_days=7,
        is_demo=False,
        active=True,
        created_at=utcnow(),
    )
    db.add(business)
    await db.flush()
    owner = User(
        id=security.new_id("u"),
        business_id=business.id,
        name=owner_name.strip(),
        phone=phone,
        role="owner",
        active=True,
        pin_hash=security.hash_pin(pin, settings.pepper()),
        must_change_pin=True,
        created_at=utcnow(),
    )
    db.add(owner)
    await _commit_unique(db)
    await audit(
        db, business.id, p.user.name, "business_created", f"Created {business.name} with owner {owner.name}"
    )
    await db.commit()
    return business, owner, pin


async def set_business_active(db: AsyncSession, p: Principal, business_id: str, active: bool) -> dict:
    business = await db.get(Business, business_id)
    if not business:
        raise AppError("not_found", "That business doesn't exist.", 404)
    if business.is_demo:
        raise AppError("demo_readonly", "The demo business always stays on.", 403)
    business.active = active
    if not active:
        ids = (await db.execute(select(User.id).where(User.business_id == business.id))).scalars().all()
        for uid in ids:
            await end_sessions(db, uid)
    await audit(
        db,
        business.id,
        p.user.name,
        "business_active",
        f"{'Turned on' if active else 'Turned off'} {business.name}",
    )
    await db.commit()
    return business_dict(business)


async def reset_owner_pin(
    db: AsyncSession, settings: Settings, p: Principal, user_id: str, pin: str | None
) -> tuple[User, str]:
    u = await db.get(User, user_id)
    if not u or u.role != "owner":
        raise AppError("not_found", "That owner doesn't exist.", 404)
    business = await db.get(Business, u.business_id)
    if business and business.is_demo:
        raise AppError("demo_readonly", "The demo accounts' PINs can't be changed.", 403)
    chosen = pin or security.generate_pin()
    problem = security.pin_problem(chosen)
    if problem:
        raise AppError("validation_error", problem, 422)
    u.pin_hash, u.must_change_pin = security.hash_pin(chosen, settings.pepper()), True
    await end_sessions(db, u.id)
    await db.execute(delete(SignInThrottle).where(SignInThrottle.phone == u.phone))
    await audit(db, u.business_id, p.user.name, "owner_pin_reset", f"Reset the PIN for owner {u.name}")
    await db.commit()
    return u, chosen
