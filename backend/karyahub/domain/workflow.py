"""Job workflow: a small state machine with guards and an append-only event log.

Borrowed from the reference platform's design (append-only field events, client op ids for
idempotency, guards that must pass before a state change, and "proof of work" before close),
scaled down for KaryaHub. The engine is pure: it receives the job's current state and the op
ids already applied, and returns the new state and the event to append. Storage stays with the
caller (browser storage today, a database table later) so the engine needs no change then.
"""

import hashlib
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from karyahub.errors import AppError

State = Literal["NEW", "ASSIGNED", "IN_PROGRESS", "WORK_DONE", "VERIFIED", "CLOSED", "CANCELLED"]
STATES: tuple[str, ...] = ("NEW", "ASSIGNED", "IN_PROGRESS", "WORK_DONE", "VERIFIED", "CLOSED", "CANCELLED")
STATE_LABELS = {
    "NEW": "New",
    "ASSIGNED": "Assigned",
    "IN_PROGRESS": "In progress",
    "WORK_DONE": "Work done, waiting for customer check",
    "VERIFIED": "Verified by customer",
    "CLOSED": "Closed",
    "CANCELLED": "Cancelled",
}
Channel = Literal["whatsapp", "web", "system"]


@dataclass(frozen=True)
class Action:
    name: str
    label: str
    from_states: tuple[str, ...]
    to_state: str | None  # None: no state change (for example, sending a code)
    guards: tuple[str, ...] = ()


ACTIONS: dict[str, Action] = {
    a.name: a
    for a in [
        Action("assign", "Assign technician", ("NEW",), "ASSIGNED", ("technician_named",)),
        Action("start", "Start work", ("ASSIGNED",), "IN_PROGRESS"),
        Action("report_done", "Mark work done", ("IN_PROGRESS",), "WORK_DONE", ("work_described",)),
        Action("request_otp", "Send code to customer", ("WORK_DONE",), None),
        Action("verify_otp", "Enter customer's code", ("WORK_DONE",), "VERIFIED", ("otp_valid",)),
        Action("supervisor_verify", "Verify without code", ("WORK_DONE",), "VERIFIED", ("reason_given",)),
        Action("close", "Close job", ("VERIFIED",), "CLOSED"),
        Action("cancel", "Cancel job", ("NEW", "ASSIGNED"), "CANCELLED", ("reason_given",)),
        Action("reopen", "Reopen job", ("CLOSED",), "ASSIGNED", ("reason_given",)),
    ]
}


class TransitionRequest(BaseModel):
    state: str
    action: str
    client_op_id: str = Field(min_length=6, max_length=80)
    applied_op_ids: list[str] = []
    payload: dict[str, Any] = {}
    actor: str = "Owner"
    channel: Channel = "web"
    captured_at: str | None = None
    work_done: str = ""


class JobEvent(BaseModel):
    id: str
    kind: Literal["transition", "note"]
    action: str
    from_state: str
    to_state: str
    client_op_id: str
    actor: str
    channel: str
    captured_at: str | None
    received_at: str
    detail: str
    payload: dict[str, Any] = {}


class TransitionResult(BaseModel):
    job_id: str
    tenant_id: str
    state: str
    state_label: str
    duplicate: bool
    event: JobEvent | None
    next_actions: list[dict[str, str]]
    otp: dict[str, Any] | None = None


def event_id(tenant_id: str, job_id: str, client_op_id: str) -> str:
    """Same op, same id: a retried request can never create a second event."""
    return "ev-" + hashlib.sha256(f"{tenant_id}|{job_id}|{client_op_id}".encode()).hexdigest()[:16]


def next_actions(state: str) -> list[dict[str, str]]:
    return [{"action": a.name, "label": a.label} for a in ACTIONS.values() if state in a.from_states]


GuardFn = Callable[[TransitionRequest, dict[str, Any]], str | None]


def _technician_named(req: TransitionRequest, _: dict[str, Any]) -> str | None:
    return None if str(req.payload.get("technician", "")).strip() else "Name the technician for this job."


def _work_described(req: TransitionRequest, _: dict[str, Any]) -> str | None:
    text = str(req.payload.get("work_done") or req.work_done).strip()
    return None if text else "Describe the work done before marking it done."


def _reason_given(req: TransitionRequest, _: dict[str, Any]) -> str | None:
    return None if len(str(req.payload.get("reason", "")).strip()) >= 3 else "Give a short reason."


def _otp_valid(_: TransitionRequest, ctx: dict[str, Any]) -> str | None:
    check = ctx.get("otp_check")
    return (
        None if check is not None and check() else "That code doesn't match or has expired. Send a new code."
    )


GUARDS: dict[str, GuardFn] = {
    "technician_named": _technician_named,
    "work_described": _work_described,
    "reason_given": _reason_given,
    "otp_valid": _otp_valid,
}


def transition(
    job_id: str,
    tenant_id: str,
    req: TransitionRequest,
    ctx: dict[str, Any] | None = None,
    now: datetime | None = None,
) -> TransitionResult:
    ctx = ctx or {}
    if req.state not in STATES:
        raise AppError("unknown_state", f"The job is in an unknown state: {req.state}.", 422)
    action = ACTIONS.get(req.action)
    if action is None:
        raise AppError("unknown_action", f"There is no action called {req.action}.", 422)
    if req.client_op_id in req.applied_op_ids:
        return TransitionResult(
            job_id=job_id,
            tenant_id=tenant_id,
            state=req.state,
            state_label=STATE_LABELS[req.state],
            duplicate=True,
            event=None,
            next_actions=next_actions(req.state),
        )
    if req.state not in action.from_states:
        raise AppError(
            "invalid_transition",
            f"You can't {action.label.lower()} while the job is {STATE_LABELS[req.state].lower()}.",
            409,
        )
    for g in action.guards:
        problem = GUARDS[g](req, ctx)
        if problem:
            raise AppError("guard_failed", problem, 422)
    to_state = action.to_state or req.state
    safe_payload = {k: v for k, v in req.payload.items() if k not in {"code", "challenge"}}
    detail = {
        "assign": f"Assigned to {req.payload.get('technician', '')}".strip(),
        "verify_otp": "Customer confirmed with the code",
        "supervisor_verify": f"Verified without code: {req.payload.get('reason', '')}",
        "cancel": f"Cancelled: {req.payload.get('reason', '')}",
        "reopen": f"Reopened: {req.payload.get('reason', '')}",
        "request_otp": "Code sent to the customer",
    }.get(action.name, action.label)
    event = JobEvent(
        id=event_id(tenant_id, job_id, req.client_op_id),
        kind="transition" if action.to_state else "note",
        action=action.name,
        from_state=req.state,
        to_state=to_state,
        client_op_id=req.client_op_id,
        actor=req.actor,
        channel=req.channel,
        captured_at=req.captured_at,
        received_at=(now or datetime.now(UTC)).isoformat(timespec="seconds"),
        detail=detail,
        payload=safe_payload,
    )
    return TransitionResult(
        job_id=job_id,
        tenant_id=tenant_id,
        state=to_state,
        state_label=STATE_LABELS[to_state],
        duplicate=False,
        event=event,
        next_actions=next_actions(to_state),
    )
