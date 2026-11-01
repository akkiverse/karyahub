"""Import inventory items from a CSV file (CR-0011, AC-25.6).

The phone sends the file's text. With ``check`` the server only reports each row (new, update, same or a
problem with its row number and reason). Without it the good rows are saved. A code that already exists (or,
with no code, a name that exists) updates that item and never touches its quantity, so importing the same
file twice changes nothing. The call needs a signal because every code is checked against the business.
"""

import csv
import io
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from karyahub.accounts import service as accounts
from karyahub.data import inventory, rls
from karyahub.data.service import _business, bump
from karyahub.db.models import Record
from karyahub.errors import AppError

MAX_ROWS = 500
MAX_BYTES = 1024 * 1024
COLUMNS = (
    "code",
    "name",
    "unit",
    "sale_price",
    "cost_price",
    "hsn",
    "gst_rate",
    "low_stock_at",
    "opening_stock",
)
COMPARED = ("code", "name", "unit", "sale", "cost", "hsn", "gst", "low")


def _refuse(message: str) -> AppError:
    return AppError("csv_refused", message, 422)


def _parse(text: str) -> tuple[list[str], list[list[str]]]:
    rows = [r for r in csv.reader(io.StringIO(text.lstrip("﻿"))) if any(c.strip() for c in r)]
    if not rows:
        raise _refuse("This file is empty. Download the template and fill in one row per item.")
    head = [h.strip().lower() for h in rows[0]]
    if "name" not in head:
        raise _refuse('This file has no "name" column. Use the template: its first row names the columns.')
    if len(rows) == 1:
        raise _refuse("This file has only the column names. Add one row per item below them.")
    if len(rows) - 1 > MAX_ROWS:
        raise _refuse(f"This file has {len(rows) - 1} rows; up to {MAX_ROWS} can be imported at once.")
    return head, rows[1:]


def _row(head: list[str], cells: list[str]) -> dict[str, str]:
    return {
        c: (cells[head.index(c)].strip() if c in head and head.index(c) < len(cells) else "") for c in COLUMNS
    }


def _check_row(r: dict[str, str]) -> tuple[dict[str, Any] | None, float, list[str], list[str]]:
    problems: list[str] = []
    notes: list[str] = []
    name = r["name"]
    if len(name) < 2:
        problems.append("name is empty" if not name else "name is shorter than 2 letters")
    unit = inventory.parse_unit(r["unit"])
    if unit is None:
        problems.append(f'unit "{r["unit"]}" isn\'t one of nos, kg, metre, litre, set, roll')
    elif r["unit"].lower() != unit:
        notes.append(f'unit "{r["unit"]}" read as {unit}')
    ok, sale = inventory.parse_rupees(r["sale_price"])
    if not ok or sale is None:
        problems.append(
            f'sale price "{r["sale_price"]}" isn\'t a number'
            if r["sale_price"]
            else "sale price is empty (use 0)"
        )
    ok_c, cost = inventory.parse_rupees(r["cost_price"])
    if not ok_c:
        problems.append(f'cost price "{r["cost_price"]}" isn\'t a number')
    if r["code"] and not inventory.CODE_RE.match(r["code"]):
        problems.append(f'code "{r["code"]}" has characters that are not allowed')
    if r["hsn"] and not inventory.HSN_RE.match(r["hsn"]):
        problems.append(f'HSN "{r["hsn"]}" must have 4, 6 or 8 digits')
    gst: float | None = 18
    if r["gst_rate"]:
        gst = inventory._number(r["gst_rate"])
        if gst is None or gst not in inventory.GST_RATES:
            problems.append(f"GST rate {r['gst_rate']} % isn't one of 0, 5, 18, 40")
    low = None
    if r["low_stock_at"]:
        low = inventory._number(r["low_stock_at"])
        if low is None or not 0 <= low <= inventory.MAX_QTY:
            problems.append(f'low_stock_at "{r["low_stock_at"]}" isn\'t a number')
    opening = 0.0
    if r["opening_stock"]:
        n = inventory._number(r["opening_stock"])
        issue = "isn't a number" if n is None else (inventory.quantity_problem(unit or "kg", n) or "")
        if issue:
            problems.append(f"opening stock {r['opening_stock']}: {issue[:1].lower()}{issue[1:].rstrip('.')}")
        else:
            opening = float(n or 0)
    if problems:
        return None, 0.0, problems, notes
    fields = {
        "name": name,
        "code": r["code"],
        "unit": unit,
        "sale": sale,
        "cost": cost,
        "hsn": r["hsn"],
        "gst": int(gst or 18),
        "low": None if low is None else inventory.r3(low),
    }
    return fields, opening, problems, notes


async def import_csv(
    db: AsyncSession, p: accounts.Principal, *, text: str, name: str, check: bool
) -> dict[str, Any]:
    business_id = _business(p)
    if "manage_inventory" not in p.permissions:
        raise inventory.FORBIDDEN
    if len(text.encode("utf-8")) > MAX_BYTES:
        raise _refuse("This file is bigger than 1 MB. Split it into smaller files.")
    head, data = _parse(text)
    await rls.scope(db, business_id)
    items = (
        (await db.execute(select(Record).where(Record.business_id == business_id, Record.kind == "item")))
        .scalars()
        .all()
    )
    by_code = {str(i.body.get("code") or "").lower(): i for i in items if i.body.get("code")}
    by_name = {str(i.body.get("name") or "").lower(): i for i in items}

    seen: dict[str, int] = {}
    rows: list[dict[str, Any]] = []
    for index, cells in enumerate(data):
        number = index + 2  # the spreadsheet's row number: the column names are row 1
        r = _row(head, cells)
        fields, opening, problems, notes = _check_row(r)
        key = f"c:{r['code'].lower()}" if r["code"] else f"n:{r['name'].lower()}" if r["name"] else ""
        if key and key in seen:
            what = f"code {r['code']}" if r["code"] else "this name"
            problems.append(f"{what} is also in row {seen[key]}")
            fields = None
        elif key:
            seen[key] = number
        existing = None
        if fields is not None:
            existing = by_code.get(r["code"].lower()) if r["code"] else by_name.get(r["name"].lower())
        status = "problem" if fields is None else "update" if existing is not None else "new"
        if status == "update" and existing is not None and fields is not None:
            if opening:
                notes.append("opening stock ignored for an existing item: use Stock in")
            if all(existing.body.get(k) == fields[k] for k in COMPARED):
                status = "same"
        rows.append(
            {
                "row": number,
                "status": status,
                "problems": problems,
                "notes": notes,
                "code": r["code"],
                "name": r["name"],
                "unit": r["unit"],
                "sale_price": r["sale_price"],
                "opening_stock": r["opening_stock"],
                "_fields": fields,
                "_opening": opening,
                "_existing": existing,
            }
        )
    counts = {s: sum(1 for x in rows if x["status"] == s) for s in ("new", "update", "same", "problem")}
    public_rows = [{k: v for k, v in x.items() if not k.startswith("_")} for x in rows]
    if check:
        return {"checked": True, "file": name, "rows": public_rows, "counts": counts}

    todo = [x for x in rows if x["status"] in {"new", "update"}]
    audits: list[tuple[str, str]] = []
    added = updated = 0
    if todo:
        need = sum(4 if x["status"] == "new" else 1 for x in todo)
        top = await bump(db, business_id, "seq", need)
        cursor = top - need

        def take_seq() -> int:
            nonlocal cursor
            cursor += 1
            return cursor

        batch = inventory.Batch(db, p, business_id, take_seq, {}, audits)
        for x in todo:
            fields = dict(x["_fields"])
            if x["status"] == "update":
                existing: Record = x["_existing"]
                fields["stopped"] = bool(existing.body.get("stopped", False))
                await batch.put_item(existing.id, {**fields, "id": existing.id}, existing)
                updated += 1
                continue
            item_id = f"it-{uuid.uuid4().hex[:16]}"
            fields.update(id=item_id, stopped=False)
            await batch.put_item(item_id, fields, None)
            added += 1
            if x["_opening"] > 0:
                await batch.apply_move(
                    f"mv-{uuid.uuid4().hex[:16]}",
                    {"kind": "opening", "item_id": item_id, "qty": x["_opening"], "note": "From CSV import"},
                    None,
                )
        audits.clear()  # one line for the whole import, not one per row
        await db.flush()
    await rls.unscope(db)
    skipped = counts["problem"]
    await accounts.audit(
        db,
        business_id,
        p.user.name,
        "inventory_import",
        f"Imported inventory from {name or 'a CSV file'}: {added} new, {updated} updated, {skipped} skipped",
    )
    await db.commit()
    return {
        "checked": False,
        "file": name,
        "rows": public_rows,
        "counts": counts,
        "imported": {"added": added, "updated": updated, "skipped": skipped},
    }
