"""Staff roles and what each may do (CR-0003, extended by CR-0005).

The role table here is the starting point. Since CR-0005 a business owner can switch single
permissions on or off for a role, or for one person, and the server works out each person's
effective permissions from the database (``effective_permissions``). The web app keeps the same
starting table in src/domain/access.js; a test keeps them identical.
"""

from pydantic import BaseModel

from karyahub.errors import AppError


class Role(BaseModel):
    id: str
    name: str
    short: str
    summary: str


class Permission(BaseModel):
    id: str
    label: str
    roles: list[str]


ROLES: list[Role] = [
    Role(
        id="owner",
        name="Owner (admin)",
        short="Owner",
        summary="Everything, including Admin (team and access) and Settings.",
    ),
    Role(
        id="coordinator",
        name="Office coordinator",
        short="Coordinator",
        summary=(
            "Runs the day: chat, jobs, quotes and invoices, renewals and closing jobs. No Admin or Settings."
        ),
    ),
    Role(
        id="technician",
        name="Technician",
        short="Technician",
        summary="Sends job reports and confirms finished work with the customer. "
        "No money totals, paperwork, renewals or settings.",
    ),
]

_ALL = ["owner", "coordinator", "technician"]
_OFFICE = ["owner", "coordinator"]
PERMISSIONS: list[Permission] = [
    Permission(id="view_dashboard", label="See the overview and money at stake", roles=_OFFICE),
    Permission(id="use_chat", label="Send and review job reports in Chat", roles=_ALL),
    Permission(id="view_jobs", label="See jobs", roles=_ALL),
    Permission(id="verify_work", label="Send the customer code and verify work", roles=_ALL),
    Permission(id="close_jobs", label="Close jobs", roles=_OFFICE),
    Permission(id="create_documents", label="Create quotes and invoices", roles=_OFFICE),
    Permission(id="manage_renewals", label="See renewals and send reminders", roles=_OFFICE),
    Permission(id="manage_settings", label="Change settings and business details", roles=["owner"]),
    Permission(id="manage_team", label="Add staff, change roles and PINs (Admin)", roles=["owner"]),
]

PLATFORM_ROLE = "platform_admin"
PLATFORM_PERMISSION = "manage_businesses"
BUSINESS_PERMISSION_IDS = [p.id for p in PERMISSIONS]
# The owner always keeps these two, so a business can never lock its own owner out.
OWNER_LOCKED = ["manage_team", "manage_settings"]
EDITABLE_ROLES = ["coordinator", "technician"]


def effective_permissions(
    role: str, role_overrides: dict[str, bool] | None = None, user_overrides: dict[str, bool] | None = None
) -> frozenset[str]:
    """Role default, then the business's switches for that role, then the person's own override."""
    if role == PLATFORM_ROLE:
        return frozenset({PLATFORM_PERMISSION})
    if role == "owner":
        granted = set(BUSINESS_PERMISSION_IDS)
        for perm, allowed in (user_overrides or {}).items():
            if perm in BUSINESS_PERMISSION_IDS and perm not in OWNER_LOCKED:
                granted.add(perm) if allowed else granted.discard(perm)
        return frozenset(granted)
    granted = {p.id for p in PERMISSIONS if role in p.roles}
    for source in (role_overrides, user_overrides):
        for perm, allowed in (source or {}).items():
            if perm in BUSINESS_PERMISSION_IDS:
                granted.add(perm) if allowed else granted.discard(perm)
    return frozenset(granted)


# Job workflow action -> permission needed.
ACTION_PERMISSION: dict[str, str] = {
    "assign": "close_jobs",
    "start": "verify_work",
    "report_done": "verify_work",
    "request_otp": "verify_work",
    "verify_otp": "verify_work",
    "supervisor_verify": "close_jobs",
    "close": "close_jobs",
    "cancel": "close_jobs",
    "reopen": "close_jobs",
}

_ACTION_WORDS = {
    "close_jobs": "close or manage jobs",
    "verify_work": "update proof of work",
}

_BY_ID = {p.id: p for p in PERMISSIONS}


def can(role: str, permission: str) -> bool:
    p = _BY_ID.get(permission)
    return bool(p and role in p.roles)


def check_action(permissions: frozenset[str] | None, action: str) -> None:
    """Refuse a job action the signed-in person's permissions don't cover. None means a system call."""
    if permissions is None:
        return
    needed = ACTION_PERMISSION.get(action)
    if needed and needed not in permissions:
        raise AppError(
            "forbidden",
            f"Your access doesn't include permission to {_ACTION_WORDS.get(needed, 'do this')}. "
            "Ask your business owner.",
            403,
        )
