"""Records of a business (customers, jobs, documents, chat), the sync call and the device import (CR-0009).

Every function here takes the signed-in person (:class:`~karyahub.accounts.service.Principal`) and filters
by *their* business id, never by anything in the request. See ADR-0013.
"""

import json
import re
from collections.abc import Iterable
from copy import deepcopy
from datetime import datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from karyahub.accounts import service as accounts
from karyahub.data import inventory, rls
from karyahub.db.models import Counter, DeviceImport, Record, SyncOp
from karyahub.domain.workflow import STATES
from karyahub.errors import AppError

KINDS = ("customer", "job", "document", "message", "item", "stock_move")
# What a phone can move from its old on-device data (inventory is new, so there is nothing to move).
IMPORT_KINDS = ("customer", "job", "document", "message")
# What a person needs (any one of these) to read, or to save, each kind of record. The owner decides.
READ_PERMISSIONS: dict[str, frozenset[str]] = {
    "customer": frozenset({"view_jobs", "use_chat", "manage_renewals", "view_dashboard", "create_documents"}),
    "job": frozenset({"view_jobs", "use_chat", "manage_renewals", "view_dashboard"}),
    "document": frozenset({"create_documents"}),
    "message": frozenset({"use_chat"}),
    # Inventory (CR-0011): whoever may take parts needs the items; the history is for those who see inventory.
    "item": frozenset({"view_inventory", "use_parts", "manage_inventory"}),
    "stock_move": frozenset({"view_inventory", "manage_inventory"}),
}
WRITE_PERMISSIONS: dict[str, frozenset[str]] = {
    "customer": frozenset({"use_chat", "manage_renewals", "create_documents"}),
    "job": frozenset({"use_chat"}),
    "document": frozenset({"create_documents"}),
    "message": frozenset({"use_chat", "create_documents"}),
    "item": frozenset({"manage_inventory"}),
    "stock_move": frozenset(
        {"manage_inventory", "use_parts"}
    ),  # which move needs which one is checked per move
}
ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,64}$")
MAX_OPS = 100
MAX_BODY_BYTES = 60_000
MAX_PAGE = 500
MAX_IMPORT = {"customer": 2000, "job": 2000, "document": 4000, "message": 4000}
SERVER_OWNED_JOB_FIELDS = ("state", "events", "otp", "number", "parts_used")
DEMO_LOCAL = AppError(
    "demo_local", "The demo business keeps its data on your own device, so there is nothing to sync.", 403
)


def readable_kinds(p: accounts.Principal) -> list[str]:
    return [k for k in KINDS if READ_PERMISSIONS[k] & p.permissions]


def can_write(p: accounts.Principal, kind: str) -> bool:
    return bool(WRITE_PERMISSIONS[kind] & p.permissions)


def _business(p: accounts.Principal) -> str:
    business = accounts._require_business(p)
    if business.is_demo:
        raise DEMO_LOCAL
    return business.id


def public(rec: Record, p: accounts.Principal | None = None) -> dict[str, Any]:
    """The item as the phone holds it, with the server's id and number written in. Cost prices are left out
    for people who don't manage the inventory."""
    body = deepcopy(rec.body)
    if p is not None and not inventory.can_see_cost(p):
        inventory.hide_cost(rec.kind, body)
    body["id"] = rec.id
    if rec.kind in {"job", "document"}:
        body["number"] = rec.number
    return {"kind": rec.kind, "id": rec.id, "number": rec.number, "seq": rec.seq, "body": body}


# ---------- counters ----------
async def bump(db: AsyncSession, business_id: str, name: str, n: int = 1) -> int:
    """Add n to a counter of this business and return the new value. The row lock lasts until commit,
    which is what makes one business's writes happen one after another."""
    stmt = (
        update(Counter)
        .where(Counter.business_id == business_id, Counter.name == name)
        .values(value=Counter.value + n)
        .returning(Counter.value)
    )
    row = (await db.execute(stmt)).first()
    if row is not None:
        return int(row[0])
    try:
        async with db.begin_nested():
            db.add(Counter(business_id=business_id, name=name, value=n))
            await db.flush()
        return n
    except IntegrityError:  # another request made the row first
        row = (await db.execute(stmt)).first()
        return int(row[0])  # type: ignore[index]


async def counter_value(db: AsyncSession, business_id: str, name: str) -> int:
    value = (
        await db.execute(
            select(Counter.value).where(Counter.business_id == business_id, Counter.name == name)
        )
    ).scalar()
    return int(value or 0)


async def raise_counter(db: AsyncSession, business_id: str, name: str, at_least: int) -> None:
    """Make sure the next number given is above every number already used (after an import)."""
    current = await bump(db, business_id, name, 0)
    if current < at_least:
        await bump(db, business_id, name, at_least - current)


def _trailing_number(text: str) -> int:
    match = re.search(r"(\d+)\s*$", text or "")
    return int(match.group(1)) if match else 0


def job_number(n: int) -> str:
    return f"J-{n:04d}"


def document_number(kind: str, n: int, year: str) -> str:
    return f"{'INV' if kind == 'invoice' else 'QT'}-{year}-{n:04d}"


# ---------- checking a change ----------
def _clean_body(kind: str, item_id: str, body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise AppError("validation_error", "A change must carry the item itself.", 422)
    if len(json.dumps(body, default=str)) > MAX_BODY_BYTES:
        raise AppError("validation_error", "That item is too large to save.", 422)
    if kind == "item":
        return inventory.clean_item(item_id, body)
    clean = deepcopy(body)
    clean["id"] = item_id
    if kind == "customer" and not str(clean.get("name", "")).strip():
        raise AppError("validation_error", "A customer needs a name.", 422)
    if kind == "job":
        if not str(clean.get("customer_name", "")).strip():
            raise AppError("validation_error", "A job needs a customer name.", 422)
        if clean.get("state") not in STATES:
            clean["state"] = "WORK_DONE"
    if kind == "document":
        if clean.get("type") not in {"quote", "invoice"}:
            raise AppError("validation_error", "A document is a quote or an invoice.", 422)
        if not isinstance(clean.get("lines", []), list):
            raise AppError("validation_error", "A document's lines must be a list.", 422)
    return clean


def _year(body: dict[str, Any]) -> str:
    stamp = str(body.get("date") or "")
    return stamp[:4] if re.match(r"^\d{4}", stamp) else str(datetime.now().year)


async def _store(
    db: AsyncSession,
    business_id: str,
    kind: str,
    item_id: str,
    body: dict[str, Any],
    existing: Record | None,
    seq: int,
    *,
    keep_number: str | None = None,
    keep_state: bool = False,
) -> Record:
    """Create or replace one item. The server's own fields on an existing job or document are kept."""
    now = accounts.utcnow()
    if existing is not None:
        merged = body
        if kind == "job":
            for key in SERVER_OWNED_JOB_FIELDS:
                if key in existing.body:
                    merged[key] = existing.body[key]
                elif key == "parts_used":
                    merged.pop(key, None)  # a phone can't invent a job's list of parts
        existing.body = merged
        existing.seq = seq
        existing.updated_at = now
        return existing
    number = ""
    if keep_number:
        number = keep_number
    elif kind == "job":
        number = job_number(await bump(db, business_id, "job"))
    elif kind == "document":
        number = document_number(body["type"], await bump(db, business_id, body["type"]), _year(body))
    if kind == "job":
        if not keep_state:
            body["state"] = (
                "WORK_DONE"  # a new job starts where the app starts it; later steps are the server's
            )
        body["otp"] = None
        body["parts_used"] = {}
        body.setdefault("events", [])
        body["events"] = [e for e in body["events"] if isinstance(e, dict)][:20]
    if number:
        body["number"] = number
    rec = Record(
        business_id=business_id, kind=kind, id=item_id, number=number, body=body, seq=seq, updated_at=now
    )
    db.add(rec)
    return rec


# ---------- the sync call ----------
async def _existing(
    db: AsyncSession, business_id: str, ops: Iterable[dict[str, Any]]
) -> dict[tuple[str, str], Record]:
    wanted: dict[str, set[str]] = {}
    for op in ops:
        wanted.setdefault(op["kind"], set()).add(op["id"])
    found: dict[tuple[str, str], Record] = {}
    for kind, ids in wanted.items():
        rows = await db.execute(
            select(Record).where(Record.business_id == business_id, Record.kind == kind, Record.id.in_(ids))
        )
        for rec in rows.scalars():
            found[(rec.kind, rec.id)] = rec
    return found


def _problem(op: Any) -> str | None:
    if not isinstance(op, dict):
        return "That change is not in the right shape."
    if op.get("kind") not in KINDS:
        return "KaryaHub does not know that kind of item."
    if not ID_RE.match(str(op.get("id", ""))) or not ID_RE.match(str(op.get("op_id", ""))):
        return "That change has no valid id."
    return None


async def sync(
    db: AsyncSession,
    p: accounts.Principal,
    *,
    since: int,
    ops: list[dict[str, Any]],
) -> dict[str, Any]:
    """Apply the phone's queued changes once each, then answer with all that changed after ``since``."""
    business_id = _business(p)
    if len(ops) > MAX_OPS:
        raise AppError("too_many", f"Send at most {MAX_OPS} changes at a time.", 422)
    await rls.scope(db, business_id)
    results: list[dict[str, Any]] = []
    seen: dict[str, dict[str, Any]] = {}
    audits: list[tuple[str, str]] = []  # activity-log lines, written once the business scope is lifted
    if ops:
        valid_ids = [
            str(o["op_id"]) for o in ops if isinstance(o, dict) and ID_RE.match(str(o.get("op_id", "")))
        ]
        if valid_ids:
            rows = await db.execute(
                select(SyncOp.op_id, SyncOp.result).where(
                    SyncOp.business_id == business_id, SyncOp.op_id.in_(valid_ids)
                )
            )
            seen = {op_id: result for op_id, result in rows.all()}
        fresh = [o for o in ops if _problem(o) is None and str(o["op_id"]) not in seen]
        # One change number for each record that changes: a stock move also changes its item and its job.
        need = sum(3 if o["kind"] == "stock_move" else 1 for o in fresh)
        start = (await bump(db, business_id, "seq", need)) - need if fresh else 0
        existing = await _existing(db, business_id, fresh) if fresh else {}
        next_seq = start

        def take_seq() -> int:
            nonlocal next_seq
            next_seq += 1
            return next_seq

        batch = inventory.Batch(db, p, business_id, take_seq, existing, audits)
        done_here: dict[str, dict[str, Any]] = {}
        for op in ops:
            problem = _problem(op)
            if problem:
                results.append(
                    {
                        "op_id": str(op.get("op_id", "")) if isinstance(op, dict) else "",
                        "status": "rejected",
                        "message": problem,
                    }
                )
                continue
            op_id = str(op["op_id"])
            if op_id in seen or op_id in done_here:
                results.append({**(seen.get(op_id) or done_here[op_id]), "status": "duplicate"})
                continue
            kind, item_id = op["kind"], str(op["id"])
            result: dict[str, Any] = {"op_id": op_id, "kind": kind, "id": item_id}
            current = existing.get((kind, item_id))
            try:
                if not can_write(p, kind):
                    raise AppError(
                        "forbidden", "Your access doesn't include this. Ask your business owner.", 403
                    )
                if kind == "stock_move":
                    _clean_body(
                        kind, item_id, op.get("body")
                    )  # size and shape; the move itself is checked below
                    rec = await batch.apply_move(item_id, op.get("body"), current)
                elif kind == "item":
                    rec = await batch.put_item(item_id, _clean_body(kind, item_id, op.get("body")), current)
                else:
                    body = _clean_body(kind, item_id, op.get("body"))
                    rec = await _store(db, business_id, kind, item_id, body, current, take_seq())
                existing[(kind, item_id)] = rec
                result.update(status="applied", number=rec.number)
            except AppError as exc:
                result.update(status="rejected", message=exc.message)
                if current is not None and kind in readable_kinds(p):
                    result["record"] = public(current, p)
            done_here[op_id] = {k: v for k, v in result.items() if k != "record"}
            db.add(
                SyncOp(
                    business_id=business_id,
                    op_id=op_id,
                    applied_at=accounts.utcnow(),
                    result=done_here[op_id],
                )
            )
            results.append(result)
    cursor_now = await counter_value(db, business_id, "seq")
    kinds = readable_kinds(p)
    changes = {k: [] for k in KINDS}
    more = False
    last = since
    if kinds:
        rows = (
            (
                await db.execute(
                    select(Record)
                    .where(Record.business_id == business_id, Record.kind.in_(kinds), Record.seq > since)
                    .order_by(Record.seq)
                    .limit(MAX_PAGE + 1)
                )
            )
            .scalars()
            .all()
        )
        more = len(rows) > MAX_PAGE
        for rec in rows[:MAX_PAGE]:
            changes[rec.kind].append(public(rec, p))
            last = rec.seq
    cursor = last if more else max(since, cursor_now)
    if audits:
        await db.flush()
        await rls.unscope(db)  # the activity log is not a business-data table
        for action, text in audits:
            await accounts.audit(db, business_id, p.user.name, action, text)
    await db.commit()
    return {"cursor": cursor, "more": more, "readable": kinds, "results": results, "changes": changes}


# ---------- proof of work: the server loads and saves the job ----------
async def load_job(db: AsyncSession, business_id: str, job_id: str) -> Record | None:
    return (
        await db.execute(
            select(Record)
            .where(Record.business_id == business_id, Record.kind == "job", Record.id == job_id)
            .with_for_update()
        )
    ).scalar_one_or_none()


async def save_job_step(
    db: AsyncSession,
    business_id: str,
    rec: Record,
    state: str,
    event: dict[str, Any] | None,
    otp: dict[str, Any] | None,
) -> None:
    body = deepcopy(rec.body)
    body["state"] = state
    if event is not None and all(e.get("id") != event["id"] for e in body.get("events", [])):
        body["events"] = [*body.get("events", []), event]
    body["otp"] = otp if state == "WORK_DONE" else None
    rec.body = body
    rec.seq = await bump(db, business_id, "seq")
    rec.updated_at = accounts.utcnow()


# ---------- the one-time import of what a phone held before ----------
def _digits(phone: Any) -> str:
    return re.sub(r"\D", "", str(phone or ""))[-10:]


async def import_from_device(
    db: AsyncSession,
    p: accounts.Principal,
    *,
    device_id: str,
    data: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    """Move one phone's old on-device data to the server, once. Ids are made unique per phone, customers with
    the same mobile number are merged, numbers already given are kept, and the counters move past them."""
    business_id = _business(p)
    if not ID_RE.match(device_id or ""):
        raise AppError("validation_error", "This phone has no valid device id.", 422)
    await rls.scope(db, business_id)
    already = await db.get(DeviceImport, (business_id, device_id))
    if already is not None:
        counts_before = dict(already.counts)
        await db.rollback()
        return {"imported": False, "already": True, "counts": counts_before}
    counts = {"customer": 0, "job": 0, "document": 0, "message": 0, "merged_customers": 0, "skipped": 0}
    tag = re.sub(r"[^A-Za-z0-9]", "", device_id)[:10] or "device"
    for kind in IMPORT_KINDS:
        if len(data.get(kind, [])) > MAX_IMPORT[kind]:
            raise AppError(
                "too_many", "There is too much on this phone to move in one go. Ask for help.", 422
            )
    total = sum(len(data.get(k, [])) for k in IMPORT_KINDS)
    start = (await bump(db, business_id, "seq", max(total, 1))) - max(total, 1)
    seq = start
    # Existing customers by mobile number, so the same customer isn't added twice.
    existing_customers = (
        (await db.execute(select(Record).where(Record.business_id == business_id, Record.kind == "customer")))
        .scalars()
        .all()
    )
    by_phone = {_digits(c.body.get("phone")): c for c in existing_customers if _digits(c.body.get("phone"))}
    job_rows = (
        (
            await db.execute(
                select(Record.number).where(Record.business_id == business_id, Record.kind == "job")
            )
        )
        .scalars()
        .all()
    )
    used_job_numbers = {n for n in job_rows if n}
    customer_map: dict[str, str] = {}
    job_map: dict[str, str] = {}
    doc_map: dict[str, str] = {}
    top = {"job": 0, "quote": 0, "invoice": 0}

    def can(kind: str) -> bool:
        return can_write(p, kind)

    for item in data.get("customer", []) if can("customer") else []:
        old = str(item.get("id", ""))
        phone = _digits(item.get("phone"))
        try:
            body = _clean_body("customer", old or "x", item)
        except AppError:
            counts["skipped"] += 1
            continue
        hit = by_phone.get(phone) if phone else None
        if hit is not None:
            customer_map[old] = hit.id
            counts["merged_customers"] += 1
            continue
        new_id = f"imp-{tag}-{old}"[:64]
        body["id"] = new_id
        seq += 1
        rec = await _store(db, business_id, "customer", new_id, body, None, seq)
        customer_map[old] = new_id
        if phone:
            by_phone[phone] = rec
        counts["customer"] += 1
    for item in data.get("job", []) if can("job") else []:
        old = str(item.get("id", ""))
        try:
            body = _clean_body("job", old or "x", item)
        except AppError:
            counts["skipped"] += 1
            continue
        new_id = f"imp-{tag}-{old}"[:64]
        body["id"] = new_id
        body["customer_id"] = customer_map.get(str(body.get("customer_id", "")), body.get("customer_id", ""))
        keep = str(item.get("number") or old)
        keep = keep if re.match(r"^J-\d+$", keep) and keep not in used_job_numbers else None
        if keep:
            used_job_numbers.add(keep)
            top["job"] = max(top["job"], _trailing_number(keep))
        seq += 1
        await _store(db, business_id, "job", new_id, body, None, seq, keep_number=keep, keep_state=True)
        job_map[old] = new_id
        counts["job"] += 1
    for item in data.get("document", []) if can("document") else []:
        old = str(item.get("id", ""))
        try:
            body = _clean_body("document", old or "x", item)
        except AppError:
            counts["skipped"] += 1
            continue
        new_id = f"imp-{tag}-{old}"[:64]
        body["id"] = new_id
        body["job_id"] = job_map.get(str(body.get("job_id", "")), body.get("job_id", ""))
        number = str(item.get("number") or old)
        kind = body["type"]
        top[kind] = max(top[kind], _trailing_number(number))
        seq += 1
        await _store(
            db,
            business_id,
            "document",
            new_id,
            body,
            None,
            seq,
            keep_number=number if re.match(r"^(QT|INV)-", number) else None,
        )
        doc_map[old] = new_id
        counts["document"] += 1
    for item in data.get("message", []) if can("message") else []:
        old = str(item.get("id", ""))
        if old == "m-welcome":
            continue
        try:
            body = _clean_body("message", old or "x", item)
        except AppError:
            counts["skipped"] += 1
            continue
        new_id = f"imp-{tag}-{old}"[:64]
        body["id"] = new_id
        for key, mapping in (("job_id", job_map), ("doc_id", doc_map)):
            if body.get(key):
                body[key] = mapping.get(str(body[key]), body[key])
        seq += 1
        await _store(db, business_id, "message", new_id, body, None, seq)
        counts["message"] += 1
    for name, value in top.items():
        if value:
            await raise_counter(db, business_id, name, value)
    db.add(
        DeviceImport(
            business_id=business_id,
            device_id=device_id,
            user_id=p.user.id,
            imported_at=accounts.utcnow(),
            counts=counts,
        )
    )
    try:
        await db.flush()
    except IntegrityError:  # the same phone sent this twice at once; the first one won
        await db.rollback()
        return {"imported": False, "already": True, "counts": {}}
    await rls.unscope(db)
    await accounts.audit(
        db,
        business_id,
        p.user.name,
        "device_import",
        f"Moved data from a phone to the server: {counts['customer']} customers, {counts['job']} jobs, "
        f"{counts['document']} documents, {counts['message']} messages",
    )
    await db.commit()
    return {"imported": True, "already": False, "counts": counts}
