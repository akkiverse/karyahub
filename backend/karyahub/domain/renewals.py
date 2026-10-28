"""Renewal windows and reminder text (same rules as the browser demo in CR-0001)."""

from datetime import date

from pydantic import BaseModel

MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


class Customer(BaseModel):
    id: str
    name: str
    phone: str = ""
    equipment: str = ""
    amc_expiry: str = ""
    amc_value: float = 0


def _days(a: str, b: str) -> int:
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


def due_within(customers: list[Customer], today: str, days: int) -> list[Customer]:
    due = [c for c in customers if c.amc_expiry and 0 <= _days(today, c.amc_expiry) <= days]
    return sorted(due, key=lambda c: c.amc_expiry)


def lapsed(customers: list[Customer], today: str) -> list[Customer]:
    gone = [c for c in customers if c.amc_expiry and _days(today, c.amc_expiry) < 0]
    return sorted(gone, key=lambda c: c.amc_expiry, reverse=True)


def money_at_stake(customers: list[Customer]) -> float:
    return sum(c.amc_value for c in customers)


def _inr(n: float) -> str:
    s = str(round(n))
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    if head:
        groups.insert(0, head)
    return ",".join([*groups, tail])


def reminder_text(c: Customer, business: str, today: str) -> str:
    first = c.name.split(" ")[0]
    d = date.fromisoformat(c.amc_expiry)
    when = f"{d.day} {MONTH_NAMES[d.month - 1]} {d.year}"
    value = f"₹{_inr(c.amc_value)}"
    if _days(today, c.amc_expiry) < 0:
        return (
            f"Namaste {first} ji, your AC maintenance contract (AMC) with {business} ended on {when}. "
            f"Reply YES to renew it for {value} and we will book your next service visit. - {business}"
        )
    return (
        f"Namaste {first} ji, your AC maintenance contract (AMC) with {business} ends on {when}. "
        f"Reply YES to renew it for {value} and keep your {c.equipment} serviced on time. - {business}"
    )
