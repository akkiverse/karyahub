"""Staff roles and what each may do (CR-0003). The web app keeps the same table in
src/domain/access.js; a test keeps them identical.

The demo has no user database, so the role arrives with each request (``actor_role``) and is
checked here; it is not yet proof of identity. Real sign-in (server sessions backed by a
database) is the next step before real staff use KaryaHub (ADR-0010, RISKS.md R-15).
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
    Permission(id="manage_settings", label="Change settings and reset the demo", roles=["owner"]),
    Permission(id="manage_team", label="Add staff, change roles and PINs (Admin)", roles=["owner"]),
]

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
_ROLE_NAMES = {r.id: r.name for r in ROLES}


def can(role: str, permission: str) -> bool:
    p = _BY_ID.get(permission)
    return bool(p and role in p.roles)


def check_action(role: str | None, action: str) -> None:
    """Refuse a job action the given role may not take. No role means a system call (WhatsApp)."""
    if role is None:
        return
    if role not in _ROLE_NAMES:
        raise AppError("unknown_role", "That staff role isn't known. Sign out and sign in again.", 403)
    needed = ACTION_PERMISSION.get(action)
    if needed and not can(role, needed):
        raise AppError(
            "forbidden",
            f"Your role ({_ROLE_NAMES[role]}) can't {_ACTION_WORDS.get(needed, 'do this')}. "
            "Ask the owner or the office coordinator.",
            403,
        )
