"""Estimates and bills, version 2 (CR-0012, ADR-0016): numbers, status, figures, stock and links.

A version-2 document is a ``records`` row of kind ``document`` whose body has ``doc_version: 2``. Its type is
stored as ``quote`` (estimate) or ``invoice`` (bill), as older phones expect. Documents saved by v0.7.0 or
earlier have no ``doc_version`` and are never worked out again (AC-28.7).

The phone owns what a person types (customer, lines, discounts, dates, notes). The server owns everything
else: the number, the status, every figure (worked out again with :mod:`karyahub.domain.tax`, AC-27.9), the
seller's details at the moment of saving, the link, the stock taken and the history.

Drafts and the request to save travel through the sync queue, so a bill can be made with no signal
(AC-28.3). Saving gives the next number in the business's series for the financial year of the bill's date,
in the same transaction as the save, so a failed save uses no number (AC-28.1). A save the checks refuse is
not lost: it stays a draft with ``save_problem`` saying why, because a rejected change would vanish from the
phone. The other steps (sent, paid, cancel, links) need signal and are their own calls.
"""

import hashlib
import re
import secrets
from copy import deepcopy
from datetime import date, datetime, timedelta
from typing import Any
from urllib.parse import quote
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from karyahub.accounts import service as accounts
from karyahub.data import business_setup, inventory, rls
from karyahub.db.models import Business, DocLink, Record
from karyahub.domain import tax
from karyahub.errors import AppError

INDIA = ZoneInfo("Asia/Kolkata")
DOC_VERSION = 2
STATUSES = ("draft", "saved", "sent", "paid", "cancelled")
WALK_IN = "Walk-in customer"
BIG_BILL = 5_000_000  # ₹50,000 in paise (AC-27.8)
UNDO_SECONDS = 60  # the screen offers Undo for 10 seconds; the server allows for a slow answer
PHONE_FIELDS = (
    "type",
    "date",
    "due_date",
    "valid_until",
    "customer",
    "place_of_supply",
    "lines",
    "bill_discount",
    "notes",
    "terms",
    "job_id",
    "estimate_id",
)
LINE_FIELDS = (
    "item_id",
    "description",
    "hsn",
    "qty",
    "unit",
    "rate",
    "price_includes_gst",
    "discount",
    "gst_rate",
    "from_job_parts",
)
CUSTOMER_FIELDS = ("id", "name", "phone", "address", "gstin", "state_code")
SENT_LOCKED = "A sent bill can't be changed. Cancel it and make a copy."
CANCELLED_LOCKED = "A cancelled bill can't be changed. Make a copy instead."
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
WORDS = {"quote": "estimate", "invoice": "bill"}


def today() -> date:
    """Today in India: a bill made at 11 pm on 31 March belongs to that financial year."""
    return datetime.now(INDIA).date()


def is_v2(body: dict[str, Any] | None) -> bool:
    return bool(body) and body.get("doc_version") == DOC_VERSION


def fy_of(day: date) -> str:
    """The financial year (1 April to 31 March) as "26-27"."""
    start = day.year if day.month >= 4 else day.year - 1
    return f"{start % 100:02d}-{(start + 1) % 100:02d}"


def series_of(kind: str, fy: str) -> str:
    return f"{'bill' if kind == 'invoice' else 'estimate'}:{fy}"


def number_of(kind: str, prefix: str, fy: str, n: int) -> str:
    if kind == "invoice":
        return business_setup.sample_number(prefix, fy, n)
    return f"E/{fy}/{n:04d}"


def heading(body: dict[str, Any]) -> str:
    """ "Tax Invoice", "Bill of Supply", "Bill" or "Estimate" (AC-27.7, AC-30.2)."""
    if body.get("type") == "quote":
        return "Estimate"
    registration = (body.get("seller") or {}).get("registration", "regular")
    return {"regular": "Tax Invoice", "composition": "Bill of Supply"}.get(registration, "Bill")


def status_of(body: dict[str, Any], on: date | None = None) -> str:
    """Overdue is worked out, never stored (AC-28.4): Saved or Sent, not Paid, due date passed."""
    if not is_v2(body):
        return "saved"  # documents from v0.7.0 and earlier show as Saved (AC-28.7)
    status = body.get("status", "draft")
    due = body.get("due_date") or ""
    unpaid = status in {"saved", "sent"} and body.get("type") == "invoice"
    if unpaid and DATE_RE.match(due) and date.fromisoformat(due) < (on or today()):
        return "overdue"
    return status


# ---------- reading what the phone sent ----------
def _text(value: Any, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _date(value: Any, fallback: str = "") -> str:
    text = str(value or "")
    if not DATE_RE.match(text):
        return fallback
    try:
        date.fromisoformat(text)
    except ValueError:
        return fallback
    return text


def _line(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise AppError("validation_error", "A line is not in the right shape.", 422)
    line = {k: raw.get(k) for k in LINE_FIELDS if k in raw}
    line["description"] = _text(raw.get("description"), 200)
    line["hsn"] = _text(raw.get("hsn"), 8)
    line["unit"] = _text(raw.get("unit"), 12)
    line["item_id"] = _text(raw.get("item_id"), 64)
    line["price_includes_gst"] = bool(raw.get("price_includes_gst"))
    line["from_job_parts"] = bool(raw.get("from_job_parts"))
    return line


def clean(raw: dict[str, Any], current: dict[str, Any] | None) -> dict[str, Any]:
    """The phone's fields of a version-2 document, on top of the server's own fields of the stored one."""
    body: dict[str, Any] = deepcopy(current) if current else {"doc_version": DOC_VERSION, "status": "draft"}
    for key in PHONE_FIELDS:
        if key in raw:
            body[key] = deepcopy(raw[key])
    if current and current.get("number") and raw.get("type") not in (None, current.get("type")):
        raise AppError("validation_error", "A numbered estimate can't become a bill. Use Make bill.", 422)
    if body.get("type") not in WORDS:
        raise AppError("validation_error", "A document is an estimate or a bill.", 422)
    lines = body.get("lines") or []
    if not isinstance(lines, list) or len(lines) > 200:
        raise AppError("validation_error", "A bill has up to 200 lines.", 422)
    body["lines"] = [_line(x) for x in lines]
    customer = body.get("customer") if isinstance(body.get("customer"), dict) else {}
    body["customer"] = {k: _text(customer.get(k), 200 if k == "address" else 80) for k in CUSTOMER_FIELDS}
    body["customer"]["name"] = body["customer"]["name"] or WALK_IN
    body["customer"]["gstin"] = body["customer"]["gstin"].upper()
    body["date"] = _date(body.get("date"), today().isoformat())
    for key in ("due_date", "valid_until"):
        body[key] = _date(body.get(key))
    body["place_of_supply"] = _text(body.get("place_of_supply"), 2)
    body["notes"] = _text(body.get("notes"), 500)
    body["terms"] = _text(body.get("terms"), 500)
    body["doc_version"] = DOC_VERSION
    body.pop("save", None)
    return body


def _engine_input(body: dict[str, Any], seller: dict[str, Any]) -> dict[str, Any]:
    return {
        "registration": seller["registration"],
        "business_state": seller["state_code"],
        "place_of_supply": body.get("place_of_supply") or seller["state_code"],
        "lines": body["lines"],
        "bill_discount": body.get("bill_discount"),
    }


def work_out(body: dict[str, Any], seller: dict[str, Any]) -> None:
    """Write the server's own figures into the body. Raises AppError naming the line at fault."""
    try:
        result = tax.compute(_engine_input(body, seller))
    except tax.TaxInputError as exc:
        where = f"Line {exc.line + 1}: " if exc.line is not None else ""
        raise AppError("validation_error", where + exc.message, 422) from None
    for line, figures in zip(body["lines"], result["lines"], strict=True):
        line.update(figures)
    body["place_of_supply"] = result["place_of_supply"]
    body["tax_mode"] = result["tax_mode"]
    body["summary"] = result["summary"]
    body["totals"] = result["totals"]


def save_checks(body: dict[str, Any]) -> None:
    """AC-27.8: the customer's GSTIN, a big bill's address and state, every line's description; and a date
    that isn't in the future, because the date decides the financial year's series (AC-28.1)."""
    if date.fromisoformat(body["date"]) > today() + timedelta(days=1):
        raise AppError("validation_error", "A bill's date can't be in the future.", 422)
    if not body["lines"]:
        raise AppError("validation_error", "Add an item or type a line.", 422)
    for i, line in enumerate(body["lines"], start=1):
        if not line["description"]:
            raise AppError("validation_error", f"Line {i}: give it a description.", 422)
    customer = body["customer"]
    if customer["gstin"] and not tax.gstin_ok(customer["gstin"]):
        raise AppError("validation_error", "This GSTIN doesn't look right. Check it with the customer.", 422)
    big = body["type"] == "invoice" and body["totals"]["total"] >= BIG_BILL
    if big and not customer["gstin"] and not (customer["address"] and customer["state_code"] in tax.STATES):
        raise AppError(
            "validation_error",
            "A bill of ₹50,000 or more to a customer without a GSTIN needs their address and state.",
            422,
        )


def seller_of(b: Business) -> dict[str, Any]:
    look = business_setup.look_of(b)
    return {
        "name": b.name,
        "address": b.address,
        "gstin": b.gstin if b.gst_registration != "unregistered" else "",
        "state_code": b.state_code,
        "registration": b.gst_registration or "regular",
        "phone": look["phone"],
    }


def _history(body: dict[str, Any], p: accounts.Principal, what: str, now: datetime) -> None:
    body["history"] = [
        *(body.get("history") or []),
        {"at": now.isoformat(timespec="seconds"), "who": p.user.name, "what": what},
    ][-50:]


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ---------- applying a change from the sync queue ----------
class Bills:
    """Version-2 documents inside one sync (or one action call), sharing its inventory batch."""

    def __init__(self, batch: inventory.Batch, business: Business) -> None:
        self.batch, self.db, self.p, self.business = batch, batch.db, batch.p, business
        self.business_id = business.id
        self.now = batch.now

    async def apply(self, doc_id: str, raw: dict[str, Any], current: Record | None) -> Record:
        stored = current.body if current is not None else None
        if stored is not None and not is_v2(stored):
            raise AppError(
                "validation_error", "This document was made before v0.8.0 and can't be changed.", 409
            )
        status = (stored or {}).get("status", "draft")
        if raw.get("deleted"):
            return await self._delete(doc_id, current, status)
        if status in {"sent", "paid"}:
            raise AppError("locked", SENT_LOCKED, 409)
        if status == "cancelled":
            raise AppError("locked", CANCELLED_LOCKED, 409)
        body = clean(raw, stored)
        if stored and stored.get("deleted"):
            body.pop("deleted", None)
        wants_save = raw.get("save") is True or status == "saved"
        body.pop("save_problem", None)
        seller = body.get("seller") if status == "saved" else seller_of(self.business)
        number = current.number if current is not None else ""
        if wants_save:
            try:
                work_out(body, seller)
                save_checks(body)
                if status == "draft":
                    await self._check_estimate(body, doc_id)
            except AppError as exc:
                if status == "saved":
                    raise  # a saved bill keeps its last good figures; the phone gets them back
                body["save_problem"] = exc.message
                wants_save = False
        if not wants_save:
            try:
                work_out(body, seller)
            except AppError:
                body.pop("totals", None)
            return self._put(doc_id, body, current, number)
        if status == "draft":
            number = await self._number(body)
            body.update(status="saved", number=number, seller=seller, saved_at=self.now.isoformat())
            if body["type"] == "invoice" and not body.get("due_date"):
                due = date.fromisoformat(body["date"]) + timedelta(days=self.look["due_days"])
                body["due_date"] = due.isoformat()
            if body["type"] == "quote" and not body.get("valid_until"):
                valid = date.fromisoformat(body["date"]) + timedelta(days=self.look["estimate_valid_days"])
                body["valid_until"] = valid.isoformat()
            await self._new_link(doc_id, body)
            _history(body, self.p, f"Saved as {number}", self.now)
            self.batch.audits.append(("document_saved", f"Saved {WORDS[body['type']]} {number}"))
        else:
            _history(body, self.p, "Changed", self.now)
        rec = self._put(doc_id, body, current, number)
        if body["type"] == "invoice":
            await self.settle_stock(rec, cancelled=False)
        if status == "draft" and body.get("estimate_id"):
            await self._mark_estimate_billed(body["estimate_id"], doc_id, number)
        return rec

    @property
    def look(self) -> dict[str, Any]:
        return business_setup.look_of(self.business)

    def _put(self, doc_id: str, body: dict[str, Any], current: Record | None, number: str) -> Record:
        body["id"] = doc_id
        body["number"] = number
        if current is not None:
            current.body = body
            current.number = number
            current.seq = self.batch.take_seq()
            current.updated_at = self.now
            return current
        rec = Record(
            business_id=self.business_id,
            kind="document",
            id=doc_id,
            number=number,
            body=body,
            seq=self.batch.take_seq(),
            updated_at=self.now,
        )
        self.db.add(rec)
        self.batch.found[("document", doc_id)] = rec
        return rec

    async def _delete(self, doc_id: str, current: Record | None, status: str) -> Record:
        if status != "draft":
            raise AppError("locked", "Only a draft can be deleted. Cancel a saved bill instead.", 409)
        body = (
            deepcopy(current.body) if current is not None else {"doc_version": DOC_VERSION, "type": "invoice"}
        )
        body.update(deleted=True, status="draft", lines=[])
        return self._put(doc_id, body, current, "")

    async def _number(self, body: dict[str, Any]) -> str:
        from karyahub.data.service import bump  # the counter lives with the sync code

        fy = fy_of(date.fromisoformat(body["date"]))
        n = await bump(self.db, self.business_id, series_of(body["type"], fy))
        body["fy"] = fy
        body["series"] = series_of(body["type"], fy)
        return number_of(body["type"], self.look["prefix"], fy, n)

    async def _new_link(self, doc_id: str, body: dict[str, Any]) -> None:
        token = secrets.token_urlsafe(24)  # 192 random bits (AC-30.3)
        self.db.add(DocLink(token_hash=token_hash(token), business_id=self.business_id, doc_id=doc_id))
        body["link_token"] = token
        body["link_on"] = True

    async def _check_estimate(self, body: dict[str, Any], doc_id: str) -> None:
        if body["type"] != "invoice" or not body.get("estimate_id"):
            return
        estimate = await self.batch.record("document", body["estimate_id"])
        if estimate is not None and estimate.body.get("bill_id") not in (None, "", doc_id):
            raise AppError(
                "already_billed",
                f"This estimate is already billed as {estimate.body.get('bill_number', '')}.",
                409,
            )

    async def _mark_estimate_billed(self, estimate_id: str, bill_id: str, number: str) -> None:
        estimate = await self.batch.record("document", estimate_id)
        if estimate is None or not is_v2(estimate.body):
            return
        body = deepcopy(estimate.body)
        body.update(bill_id=bill_id, bill_number=number)
        _history(body, self.p, f"Billed as {number}", self.now)
        estimate.body = body
        estimate.seq = self.batch.take_seq()
        estimate.updated_at = self.now

    async def settle_stock(self, rec: Record, *, cancelled: bool) -> None:
        """AC-27.10: item lines not from a job's parts take stock; cancelling gives it back. Only the
        difference from what the bill already took is moved, so changing a saved bill keeps stock right."""
        body = rec.body
        wanted: dict[str, float] = {}
        if not cancelled:
            for line in body["lines"]:
                if not line.get("item_id") or line.get("from_job_parts"):
                    continue
                item = await self.batch.record("item", line["item_id"])
                if item is None or item.body.get("service"):
                    continue
                qty = tax.scaled(line.get("qty"), 3) or 0
                wanted[item.id] = inventory.r3(wanted.get(item.id, 0) + qty / 1000)
        taken: dict[str, float] = dict(body.get("stock_taken") or {})
        number = body["number"]
        for item_id in sorted(set(wanted) | set(taken)):
            change = inventory.r3(wanted.get(item_id, 0) - taken.get(item_id, 0))
            if change == 0:
                continue
            if cancelled:
                note = f"Bill {number} cancelled"
            elif item_id not in taken:
                note = f"Sold on {number}"
            else:
                note = f"Bill {number} changed"
            await self.batch.bill_move(item_id, -change, note, rec.id, number)
        body = deepcopy(body)
        body["stock_taken"] = {k: v for k, v in wanted.items() if v}
        rec.body = body


# ---------- steps that need signal: sent, paid, cancel, links, send ----------
async def _load(db: AsyncSession, business_id: str, doc_id: str) -> Record:
    rec = (
        await db.execute(
            select(Record)
            .where(Record.business_id == business_id, Record.kind == "document", Record.id == doc_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if rec is None or not is_v2(rec.body) or rec.body.get("deleted"):
        raise AppError("not_found", "This bill isn't on the server yet. Wait for changes to send.", 404)
    return rec


def _numbered(rec: Record) -> None:
    if rec.body.get("status") == "draft":
        raise AppError("not_saved", "Save it first. It gets its number when online.", 409)


async def _session(db: AsyncSession, p: accounts.Principal) -> tuple[Business, inventory.Batch, list]:
    from karyahub.data import service

    business = service._business_record(p)
    await rls.scope(db, business.id)
    audits: list[tuple[str, str]] = []
    next_seq = [await service.bump(db, business.id, "seq", 0)]

    def take_seq() -> int:
        next_seq[0] += 1
        return next_seq[0]

    batch = inventory.Batch(db, p, business.id, take_seq, {}, audits)
    batch.seq_box = next_seq  # type: ignore[attr-defined]
    return business, batch, audits


async def _finish(db: AsyncSession, p: accounts.Principal, batch: inventory.Batch, audits: list) -> None:
    from karyahub.data import service

    business_id = batch.business_id
    used = batch.seq_box[0] - await service.bump(db, business_id, "seq", 0)  # type: ignore[attr-defined]
    if used > 0:
        await service.bump(db, business_id, "seq", used)
    await db.flush()
    await rls.unscope(db)
    for action, text in audits:
        await accounts.audit(db, business_id, p.user.name, action, text)
    await db.commit()


async def count_message(db: AsyncSession, business_id: str, on: date | None = None) -> int:
    """The business's messages this month, links included (AC-31.4)."""
    from karyahub.data.service import bump

    return await bump(db, business_id, f"msg:{(on or today()).strftime('%Y-%m')}")


HOW = {
    "copy": "copied the link",
    "share": "shared",
    "paper": "marked as sent",
    "whatsapp": "sent on WhatsApp",
}


async def act(db: AsyncSession, p: accounts.Principal, doc_id: str, req: dict[str, Any]) -> dict[str, Any]:
    """mark_sent, mark_paid, cancel, undo_cancel. Each goes in the bill's history and the activity log."""
    from karyahub.data import service

    action = req.get("action")
    if action == "cancel" and "cancel_bills" not in p.permissions:
        raise AppError(
            "forbidden", "Cancelling bills isn't part of your access. Ask your business owner.", 403
        )
    business, batch, audits = await _session(db, p)
    rec = await _load(db, business.id, doc_id)
    bills = Bills(batch, business)
    body = deepcopy(rec.body)
    status = body.get("status")
    word = WORDS[body["type"]]
    now = batch.now
    if action == "mark_sent":
        _numbered(rec)
        how = req.get("how") if req.get("how") in HOW else "paper"
        if status == "cancelled":
            raise AppError("locked", CANCELLED_LOCKED, 409)
        if status == "saved":
            body["status"] = "sent"
        body.update(sent_at=now.isoformat(timespec="seconds"), sent_how=how)
        _history(body, p, HOW[how].capitalize(), now)
        audits.append(("document_sent", f"{word.capitalize()} {rec.number}: {HOW[how]}"))
        await count_message(db, business.id)
    elif action == "mark_paid":
        _numbered(rec)
        if body["type"] != "invoice":
            raise AppError("validation_error", "An estimate isn't paid. Make a bill from it first.", 422)
        if status not in {"saved", "sent"}:
            raise AppError("locked", "Only a saved or sent bill can be marked paid.", 409)
        paid_on = _date(req.get("paid_on"), today().isoformat())
        body.update(status="paid", paid_at=paid_on)
        _history(body, p, f"Marked paid on {paid_on}", now)
        audits.append(("document_paid", f"Bill {rec.number} marked paid"))
    elif action == "cancel":
        _numbered(rec)
        if status == "cancelled":
            return service.public(rec, p)
        reason = _text(req.get("reason"), 200)
        body.update(
            status="cancelled",
            before_cancel=status,
            cancelled_at=now.isoformat(timespec="seconds"),
            cancel_reason=reason,
        )
        _history(body, p, "Cancelled" + (f": {reason}" if reason else ""), now)
        audits.append(
            ("document_cancelled", f"Cancelled {word} {rec.number}" + (f" ({reason})" if reason else ""))
        )
    elif action == "undo_cancel":
        if status != "cancelled":
            return service.public(rec, p)
        when = datetime.fromisoformat(body.get("cancelled_at") or "2000-01-01T00:00:00")
        if (now - when).total_seconds() > UNDO_SECONDS:
            raise AppError("too_late", "It's too late to undo. Make a copy of the bill instead.", 409)
        body["status"] = body.pop("before_cancel", "saved")
        for key in ("cancelled_at", "cancel_reason"):
            body.pop(key, None)
        _history(body, p, "Cancel undone", now)
        audits.append(("document_cancelled", f"Undid cancelling {word} {rec.number}"))
    else:
        raise AppError("validation_error", "Unknown step for a bill.", 422)
    rec.body = body
    rec.seq = batch.take_seq()
    rec.updated_at = now
    if body["type"] == "invoice" and action in {"cancel", "undo_cancel"}:
        await bills.settle_stock(rec, cancelled=action == "cancel")
    await _finish(db, p, batch, audits)
    return service.public(rec, p)


async def set_link(db: AsyncSession, p: accounts.Principal, doc_id: str, on: bool) -> dict[str, Any]:
    """AC-30.5: a link turned off answers "turned off"; turned on again, it is the same link."""
    from karyahub.data import service

    business, batch, audits = await _session(db, p)
    rec = await _load(db, business.id, doc_id)
    _numbered(rec)
    body = deepcopy(rec.body)
    if body.get("link_on", True) != on:
        body["link_on"] = on
        _history(body, p, "Link turned on" if on else "Link turned off", batch.now)
        audits.append(("document_link", f"{'Turned on' if on else 'Turned off'} the link of {rec.number}"))
        rec.body = body
        rec.seq = batch.take_seq()
        rec.updated_at = batch.now
    await _finish(db, p, batch, audits)
    return service.public(rec, p)


def public_url(base: str, token: str) -> str:
    return f"{base.rstrip('/')}/b/{token}"


def message_text(body: dict[str, Any], business_name: str, url: str) -> str:
    """AC-31.1: the WhatsApp message for a bill or an estimate."""
    name = body["customer"]["name"]
    greeting = "Namaste" if name == WALK_IN else f"Namaste {name}"
    total = rupees_text(body["totals"]["total"])
    if body["type"] == "quote":
        valid = pretty_date(body.get("valid_until") or "")
        what = f"your estimate {body['number']}, valid until {valid},"
    else:
        what = f"your bill {body['number']}"
    return f"{greeting}, here is {what} from {business_name} for {total}: {url}"


def wa_link(phone: str, text: str) -> str:
    digits = re.sub(r"\D", "", phone or "")[-10:]
    who = f"91{digits}" if len(digits) == 10 else ""
    return f"https://wa.me/{who}?text={quote(text)}"


async def send(
    db: AsyncSession, p: accounts.Principal, doc_id: str, base_url: str, sender: Any
) -> dict[str, Any]:
    """AC-31.1, AC-31.2: through the one sender layer. With no WhatsApp number connected (all of v0.8.0)
    it answers with the wa.me link; once one is connected (K6) the same call sends it, same screen."""
    from karyahub.data import service

    business, batch, audits = await _session(db, p)
    rec = await _load(db, business.id, doc_id)
    _numbered(rec)
    body = deepcopy(rec.body)
    if body.get("status") == "cancelled":
        raise AppError("locked", CANCELLED_LOCKED, 409)
    url = public_url(base_url, body["link_token"])
    text = message_text(body, business.name, url)
    outcome = await sender.send_document(business, body["customer"].get("phone", ""), text, wa_link)
    if body.get("status") == "saved":
        body["status"] = "sent"
    body.update(sent_at=batch.now.isoformat(timespec="seconds"), sent_how="whatsapp")
    how = "Sent on WhatsApp" if outcome["how"] == "sent" else "Opened WhatsApp with the message"
    _history(body, p, how, batch.now)
    audits.append(("document_sent", f"{WORDS[body['type']].capitalize()} {rec.number}: {how.lower()}"))
    await count_message(db, business.id)
    rec.body = body
    rec.seq = batch.take_seq()
    rec.updated_at = batch.now
    await _finish(db, p, batch, audits)
    return {**outcome, "text": text, "record": service.public(rec, p)}


async def make_bill(
    db: AsyncSession, p: accounts.Principal, estimate_id: str, bill_id: str
) -> dict[str, Any]:
    """AC-29.2, AC-29.3: a draft bill from a saved estimate, or the bill it already became."""
    from karyahub.data import service

    business, batch, audits = await _session(db, p)
    estimate = await _load(db, business.id, estimate_id)
    if estimate.body.get("type") != "quote":
        raise AppError("validation_error", "Only an estimate becomes a bill.", 422)
    _numbered(estimate)
    if estimate.body.get("bill_id"):
        raise AppError(
            "already_billed",
            f"This estimate is already billed as {estimate.body.get('bill_number', '')}.",
            409,
        )
    if not service.ID_RE.match(bill_id or ""):
        raise AppError("validation_error", "The new bill has no valid id.", 422)
    existing = await batch.record("document", bill_id)
    if existing is not None:
        await _finish(db, p, batch, audits)
        return service.public(existing, p)
    source = estimate.body
    draft = {
        "type": "invoice",
        "date": today().isoformat(),
        "customer": source["customer"],
        "place_of_supply": source.get("place_of_supply", ""),
        "lines": [{k: line.get(k) for k in LINE_FIELDS if k in line} for line in source["lines"]],
        "bill_discount": source.get("bill_discount"),
        "notes": source.get("notes", ""),
        "terms": source.get("terms", ""),
        "job_id": source.get("job_id", ""),
        "estimate_id": estimate.id,
    }
    rec = await Bills(batch, business).apply(bill_id, draft, None)
    await _finish(db, p, batch, audits)
    return service.public(rec, p)


# ---------- words shared by the page and the PDF ----------
def rupees_text(paise: int, *, exact: bool = False) -> str:
    """₹ in the Indian format: ₹2,655 or, exact, ₹2,655.00."""
    negative = paise < 0
    rupees, rest = divmod(abs(paise), 100)
    digits = str(rupees)
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join([*groups, tail])
    text = f"₹{digits}" + (f".{rest:02d}" if exact or rest else "")
    return f"−{text}" if negative else text


def pretty_date(iso: str) -> str:
    """dd-mm-yyyy (the Spec's date format)."""
    return f"{iso[8:10]}-{iso[5:7]}-{iso[0:4]}" if DATE_RE.match(iso or "") else ""


async def by_token(db: AsyncSession, token: str) -> tuple[Business, Record] | None:
    """The bill a public link points at, or None. The link table is read before the business is known."""
    if not token or len(token) > 64:
        return None
    link = await db.get(DocLink, token_hash(token))
    if link is None:
        return None
    business = await db.get(Business, link.business_id)
    if business is None or not business.active:
        return None
    await rls.scope(db, business.id)
    rec = (
        await db.execute(
            select(Record).where(
                Record.business_id == business.id, Record.kind == "document", Record.id == link.doc_id
            )
        )
    ).scalar_one_or_none()
    await rls.unscope(db)
    if rec is None or rec.body.get("link_token") != token:
        return None
    return business, rec
