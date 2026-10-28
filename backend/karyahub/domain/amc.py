"""AMC visit planning: which service visits a contract owes, and when to create each job.

From the reference design: visits every N days across the contract period, a job is created
`lead_days` before the visit is due, each visit has a stable key (`visit:<customer>:<date>`) so a
job is never created twice, and overdue visits escalate (coordinator first, owner after 2 days).
"""

from datetime import date, timedelta
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from karyahub.errors import AppError


class Contract(BaseModel):
    customer_id: str
    ends_on: date
    starts_on: date | None = None
    every_days: int = Field(90, ge=7, le=366)
    lead_days: int = Field(7, ge=0, le=60)

    @model_validator(mode="after")
    def _default_start(self) -> "Contract":
        if self.starts_on is None:
            self.starts_on = self.ends_on - timedelta(days=365)
        return self


class Visit(BaseModel):
    key: str
    number: int
    due_on: date
    create_job_on: date
    status: Literal["past", "upcoming", "create_job_now", "overdue", "job_created"]
    escalate_to: Literal["", "coordinator", "owner"] = ""


class Plan(BaseModel):
    customer_id: str
    starts_on: date
    ends_on: date
    every_days: int
    lead_days: int
    visits: list[Visit]
    next_visit: Visit | None
    jobs_to_create: list[str]


def plan(
    contract: Contract, today: date, existing_keys: list[str] | None = None, *, past_done: bool = True
) -> Plan:
    start = contract.starts_on
    assert start is not None
    if contract.ends_on <= start:
        raise AppError("invalid_contract", "The contract must end after it starts.", 422)
    existing = set(existing_keys or [])
    visits: list[Visit] = []
    k = 1
    while (due := start + timedelta(days=contract.every_days * k)) <= contract.ends_on:
        key = f"visit:{contract.customer_id}:{due.isoformat()}"
        create_on = due - timedelta(days=contract.lead_days)
        escalate: Literal["", "coordinator", "owner"] = ""
        if key in existing:
            status: str = "job_created"
        elif due < today:
            overdue_days = (today - due).days
            if past_done and overdue_days > 30:
                status = "past"
            else:
                status = "overdue"
                escalate = "owner" if overdue_days > 2 else "coordinator"
        elif create_on <= today:
            status = "create_job_now"
        else:
            status = "upcoming"
        visits.append(
            Visit(key=key, number=k, due_on=due, create_job_on=create_on, status=status, escalate_to=escalate)  # type: ignore[arg-type]
        )
        k += 1
    nxt = next((v for v in visits if v.status in {"create_job_now", "upcoming", "overdue"}), None)
    return Plan(
        customer_id=contract.customer_id,
        starts_on=start,
        ends_on=contract.ends_on,
        every_days=contract.every_days,
        lead_days=contract.lead_days,
        visits=visits,
        next_visit=nxt,
        jobs_to_create=[v.key for v in visits if v.status in {"create_job_now", "overdue"}],
    )
