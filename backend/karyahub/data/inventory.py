"""Inventory of a business: items and stock moves (CR-0011, ADR-0015).

Items and stock moves are rows of the ``records`` table (kinds ``item`` and ``stock_move``), so they sit
behind the same business wall, the same row-level security and the same sync call as everything else. What is
new here is that **the server owns the quantity**: a phone sends moves ("used 1 kg on job J-0042"), never a
quantity, and this module changes the item's quantity and the job's parts list in the same transaction as the
move. A move cannot be changed once saved; a mistake is fixed with a new move.
"""

import re
from collections.abc import Callable
from copy import deepcopy
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from karyahub import access
from karyahub.accounts import service as accounts
from karyahub.db.models import ItemCode, Record
from karyahub.errors import AppError

UNITS = ("nos", "kg", "metre", "litre", "set", "roll")
WHOLE_UNITS = frozenset({"nos", "set", "roll"})
UNIT_ALIASES = {
    "m": "metre",
    "mtr": "metre",
    "mtrs": "metre",
    "meter": "metre",
    "meters": "metre",
    "metres": "metre",
    "kgs": "kg",
    "l": "litre",
    "ltr": "litre",
    "ltrs": "litre",
    "litres": "litre",
    "liter": "litre",
    "pcs": "nos",
    "pc": "nos",
    "piece": "nos",
    "pieces": "nos",
    "no": "nos",
    "sets": "set",
    "rolls": "roll",
}
GST_RATES = (0, 5, 18, 40)
MOVE_KINDS = ("opening", "in", "out", "used", "returned", "count")
# What a person needs to save each kind of move. Parts for a job are the office's call,
# or an allowed technician's.
MOVE_PERMISSION = {
    "opening": "manage_inventory",
    "in": "manage_inventory",
    "out": "manage_inventory",
    "count": "manage_inventory",
    "used": "use_parts",
    "returned": "use_parts",
}
CODE_RE = re.compile(r"^[A-Za-z0-9._/-]{1,24}$")
HSN_RE = re.compile(r"^(\d{4}|\d{6}|\d{8})$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_QTY = 1_000_000
MAX_PAISE = 100_000_000_000
FORBIDDEN = AppError("forbidden", "Your access doesn't include this. Ask your business owner.", 403)
ROLE_SHORT = {r.id: r.short for r in access.ROLES}


def r3(x: float) -> float:
    return round(float(x) + 0.0, 3)


def fmt(q: float) -> str:
    """1.5 -> '1.5', 38.0 -> '38'."""
    return f"{r3(q):.3f}".rstrip("0").rstrip(".") or "0"


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None or value == "":
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n == n and abs(n) != float("inf") else None


def parse_unit(value: Any) -> str | None:
    text = str(value or "").strip().lower()
    return text if text in UNITS else UNIT_ALIASES.get(text)


def parse_rupees(text: Any) -> tuple[bool, int | None]:
    """'450' or '1,250.50' -> paise. Empty is allowed (None)."""
    raw = re.sub(r"[₹,\s]", "", str(text if text is not None else ""))
    if not raw:
        return True, None
    if not re.fullmatch(r"\d+(\.\d{1,2})?", raw):
        return False, None
    return True, round(float(raw) * 100)


def quantity_problem(unit: str, value: float) -> str | None:
    if value < 0 or value > MAX_QTY:
        return "Use a quantity between 0 and 1,000,000."
    if unit in WHOLE_UNITS and abs(value - round(value)) > 1e-9:
        return f"Use a whole number for {unit}."
    return None


# ---------- checking an item ----------
def _paise(value: Any, *, required: bool = False) -> int | None:
    n = _number(value)
    if n is None:
        if required:
            raise AppError("validation_error", "Give the item a sale price (0 if you never bill it).", 422)
        return None
    if n < 0 or n > MAX_PAISE:
        raise AppError("validation_error", "A price can't be negative or that large.", 422)
    return round(n)


def clean_item(item_id: str, body: Any) -> dict[str, Any]:
    """The item as it is stored. The quantity is not here: it belongs to the server."""
    if not isinstance(body, dict):
        raise AppError("validation_error", "A change must carry the item itself.", 422)
    name = str(body.get("name") or "").strip()
    if not 2 <= len(name) <= 80:
        raise AppError("validation_error", "Give the item a name of 2 to 80 characters.", 422)
    code = str(body.get("code") or "").strip()
    if code and not CODE_RE.match(code):
        raise AppError(
            "validation_error", "A code has up to 24 letters, numbers, dots, dashes or slashes.", 422
        )
    unit = body.get("unit")
    if unit not in UNITS:
        raise AppError("validation_error", "Pick a unit: nos, kg, metre, litre, set or roll.", 422)
    hsn = str(body.get("hsn") or "").strip()
    if hsn and not HSN_RE.match(hsn):
        raise AppError("validation_error", "An HSN code has 4, 6 or 8 digits.", 422)
    gst = body.get("gst", 18)
    if isinstance(gst, bool) or gst not in GST_RATES:
        raise AppError("validation_error", "Pick a GST rate: 0, 5, 18 or 40 %.", 422)
    low = _number(body.get("low"))
    if low is not None and not 0 <= low <= MAX_QTY:
        raise AppError("validation_error", "The low-stock level must be a number from 0 up.", 422)
    return {
        "id": item_id,
        "name": name,
        "code": code,
        "unit": unit,
        "sale": _paise(body.get("sale"), required=True),
        "cost": _paise(body.get("cost")),
        "hsn": hsn,
        "gst": int(gst),
        "low": None if low is None else r3(low),
        "stopped": bool(body.get("stopped", False)),
    }


def hide_cost(rec_kind: str, body: dict[str, Any]) -> dict[str, Any]:
    """Cost prices belong to the people who manage the inventory."""
    if rec_kind in {"item", "stock_move"}:
        body.pop("cost", None)
    return body


def can_see_cost(p: accounts.Principal) -> bool:
    return "manage_inventory" in p.permissions


def actor_label(p: accounts.Principal) -> str:
    return f"{p.user.name} ({ROLE_SHORT.get(p.user.role, p.user.role)})"


class Batch:
    """The records one sync (or one CSV import) touches, loaded once, with the server's own changes to them.

    ``take_seq`` hands out the next change number, so every record that changes gets one the phones pull.
    ``audits`` collects activity-log lines, written by the caller once the business scope is lifted.
    """

    def __init__(
        self,
        db: AsyncSession,
        p: accounts.Principal,
        business_id: str,
        take_seq: Callable[[], int],
        found: dict[tuple[str, str], Record],
        audits: list[tuple[str, str]],
    ) -> None:
        self.db, self.p, self.business_id = db, p, business_id
        self.take_seq, self.found, self.audits = take_seq, found, audits
        self.now = accounts.utcnow()

    async def record(self, kind: str, rid: str) -> Record | None:
        key = (kind, rid)
        if key not in self.found:
            row = (
                await self.db.execute(
                    select(Record).where(
                        Record.business_id == self.business_id, Record.kind == kind, Record.id == rid
                    )
                )
            ).scalar_one_or_none()
            if row is None:
                return None
            self.found[key] = row
        return self.found[key]

    # ---------- items ----------
    async def put_item(self, item_id: str, clean: dict[str, Any], existing: Record | None) -> Record:
        """Create or change an item. The quantity of an existing item is kept; a new one starts at zero."""
        new_key = clean["code"].lower()
        old_key = str(existing.body.get("code") or "").lower() if existing is not None else ""
        if new_key != old_key:
            await self._move_code(item_id, old_key, new_key, clean["code"])
        body = {**clean, "qty": float(existing.body.get("qty", 0)) if existing is not None else 0}
        if existing is None:
            rec = Record(
                business_id=self.business_id,
                kind="item",
                id=item_id,
                number="",
                body=body,
                seq=self.take_seq(),
                updated_at=self.now,
            )
            self.db.add(rec)
            self.found[("item", item_id)] = rec
            self.audits.append(("inventory_item", f"Added inventory item {clean['name']}"))
            return rec
        before = existing.body
        changed = {k for k in clean if before.get(k) != clean[k]}
        if changed:
            existing.body = body
            existing.seq = self.take_seq()
            existing.updated_at = self.now
            if "stopped" in changed:
                said = "Stopped using" if clean["stopped"] else "Started using again"
                self.audits.append(("inventory_item", f"{said} inventory item {clean['name']}"))
            else:
                self.audits.append(("inventory_item", f"Changed inventory item {clean['name']}"))
        return existing

    async def _move_code(self, item_id: str, old_key: str, new_key: str, shown: str) -> None:
        if new_key:
            holder = await self.db.get(ItemCode, (self.business_id, new_key))
            if holder is not None and holder.item_id != item_id:
                raise await self._code_in_use(shown, holder.item_id)
        try:
            async with self.db.begin_nested():  # both steps or neither, so a failure never loses the old code
                if old_key:
                    old = await self.db.get(ItemCode, (self.business_id, old_key))
                    if old is not None and old.item_id == item_id:
                        await self.db.delete(old)
                        await self.db.flush()
                if new_key:
                    self.db.add(ItemCode(business_id=self.business_id, code_key=new_key, item_id=item_id))
                    await self.db.flush()
        except IntegrityError:  # another phone took the code a moment ago
            holder = await self.db.get(ItemCode, (self.business_id, new_key))
            raise await self._code_in_use(shown, holder.item_id if holder else "") from None

    async def _code_in_use(self, shown: str, holder_id: str) -> AppError:
        holder = await self.record("item", holder_id) if holder_id else None
        name = holder.body.get("name", "another item") if holder is not None else "another item"
        return AppError("code_in_use", f"Code {shown} is already used by {name}.", 409)

    # ---------- moves ----------
    async def apply_move(self, move_id: str, raw: Any, current: Record | None) -> Record:
        if current is not None:
            raise AppError("immutable", "Stock moves can't be changed. Add a correction instead.", 409)
        if not isinstance(raw, dict) or raw.get("kind") not in MOVE_KINDS:
            raise AppError("validation_error", "That stock move is not in the right shape.", 422)
        kind: str = raw["kind"]
        if MOVE_PERMISSION[kind] not in self.p.permissions:
            raise FORBIDDEN
        item = await self.record("item", str(raw.get("item_id") or ""))
        if item is None:
            raise AppError("not_found", "That item isn't in your inventory.", 404)
        name, unit = item.body["name"], item.body["unit"]
        have = float(item.body.get("qty", 0))
        if item.body.get("stopped") and kind != "returned":
            raise AppError("stopped", f"{name} is not in use. Use it again first.", 409)

        if kind == "count":
            counted = _number(raw.get("counted"))
            if counted is None:
                raise AppError("validation_error", "Type what is on the shelf.", 422)
            if problem := quantity_problem(unit, counted):
                raise AppError("validation_error", problem, 422)
            qty, after = r3(counted - have), r3(counted)
        else:
            magnitude = _number(raw.get("qty"))
            magnitude = abs(magnitude) if magnitude is not None else None
            if magnitude is None or magnitude <= 0:
                raise AppError("validation_error", "The quantity must be more than 0.", 422)
            if problem := quantity_problem(unit, magnitude):
                raise AppError("validation_error", problem, 422)
            qty = r3(magnitude if kind in {"opening", "in", "returned"} else -magnitude)
            after = r3(have + qty)
            if kind == "out" and after < 0:
                raise AppError(
                    "short",
                    f"Only {fmt(have)} {unit} in stock. If that's wrong, count the stock first.",
                    409,
                )

        job_id = ""
        job: Record | None = None
        if kind in {"used", "returned"}:
            job_id = str(raw.get("job_id") or "")
            job = await self.record("job", job_id) if job_id else None
            if job is None:
                raise AppError(
                    "job_not_synced", "That job isn't on the server yet. Try again with signal.", 404
                )
            if job.body.get("state") in {"CLOSED", "CANCELLED"}:
                raise AppError("job_closed", "This job is closed, so its parts can't change.", 409)

        day = self._date(raw.get("date"))
        move: dict[str, Any] = {
            "id": move_id,
            "item_id": item.id,
            "kind": kind,
            "qty": qty,
            "after": after,
            "date": day,
            "at": self.now.isoformat(timespec="seconds"),
            "who": self.p.user.name,
            "who_id": self.p.user.id,
            "note": str(raw.get("note") or "")[:200],
        }
        if kind == "count":
            move["counted"] = after
        if job_id:
            move["job_id"] = job_id
        if kind == "in":
            move["supplier"] = str(raw.get("supplier") or "")[:80]
            move["bill"] = str(raw.get("bill") or "")[:40]
            move["cost"] = _paise(raw.get("cost"))

        if job is not None:
            self._job_parts(job, move, item, magnitude or 0)
        item.body = {**item.body, "qty": after}
        item.seq = self.take_seq()
        item.updated_at = self.now
        rec = Record(
            business_id=self.business_id,
            kind="stock_move",
            id=move_id,
            number="",
            body=move,
            seq=self.take_seq(),
            updated_at=self.now,
        )
        self.db.add(rec)
        self.found[("stock_move", move_id)] = rec
        self._audit_move(kind, name, unit, qty, move)
        return rec

    def _date(self, value: Any) -> str:
        today = self.now.date()
        if value in (None, ""):
            return today.isoformat()
        if not isinstance(value, str) or not DATE_RE.match(value):
            raise AppError("validation_error", "Use a real date as dd-mm-yyyy.", 422)
        try:
            when = date.fromisoformat(value)
        except ValueError:
            raise AppError("validation_error", "Use a real date as dd-mm-yyyy.", 422) from None
        if when > today + timedelta(days=1):
            raise AppError("validation_error", "The date can't be in the future.", 422)
        return value

    def _job_parts(self, job: Record, move: dict[str, Any], item: Record, magnitude: float) -> None:
        """Keep the job's list of parts (server-owned) and its history in step with the move."""
        body = deepcopy(job.body)
        parts = dict(body.get("parts_used") or {})
        item_id, unit, name = item.id, item.body["unit"], item.body["name"]
        used_now = float(parts.get(item_id, 0))
        if move["kind"] == "returned":
            if magnitude > used_now + 1e-9:
                raise AppError(
                    "not_taken",
                    f"Only {fmt(used_now)} {unit} of this part was taken for this job.",
                    409,
                )
            left = r3(used_now - magnitude)
            verb, action = "put back", "parts_returned"
        else:
            left = r3(used_now + magnitude)
            verb, action = "used", "parts_used"
        if left > 0:
            parts[item_id] = left
        else:
            parts.pop(item_id, None)
        body["parts_used"] = parts
        who = actor_label(self.p)
        detail = f"{self.p.user.name} {verb} {fmt(magnitude)} {unit} {name}"
        body["events"] = [
            *(body.get("events") or []),
            {
                "id": f"ev-part-{move['id']}",
                "action": action,
                "from_state": body.get("state"),
                "to_state": body.get("state"),
                "client_op_id": f"part-{move['id']}",
                "actor": who,
                "channel": "web",
                "detail": detail,
                "received_at": self.now.isoformat(timespec="seconds"),
            },
        ]
        job.body = body
        job.seq = self.take_seq()
        job.updated_at = self.now

    def _audit_move(self, kind: str, name: str, unit: str, qty: float, move: dict[str, Any]) -> None:
        if kind == "opening":
            self.audits.append(("stock_move", f"Opening stock: {fmt(qty)} {unit} {name}"))
        elif kind == "in":
            extra = f" from {move['supplier']}" if move.get("supplier") else ""
            self.audits.append(("stock_move", f"Stock in: {fmt(qty)} {unit} {name}{extra}"))
        elif kind == "out":
            self.audits.append(
                ("stock_move", f"Stock out: {fmt(-qty)} {unit} {name} ({move['note'] or 'no reason given'})")
            )
        elif kind == "count":
            self.audits.append(
                ("stock_move", f"Count: {name} is now {fmt(move['after'])} {unit} ({qty:+g} correction)")
            )
        # Parts used and put back go in the job's own history, not the activity log.
