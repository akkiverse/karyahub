"""Import inventory items from a CSV file (CR-0011, AC-25.6; the business's own columns, CR-0013).

The phone sends the file's text. With ``check`` the server only reports each row (new, update, same or a
problem with its row number and reason) and what it would add to the business's lists. Without it the good
rows are saved. A code that already exists (or, with no code, a name that exists) updates that item and never
touches its quantity, so importing the same file twice changes nothing. The call needs a signal because every
code is checked against the business.

The columns are the standard ones plus one for each item field the business has (matched by name, so
``material_type`` and ``Material type`` are the same). A brand or unit the business doesn't have yet is added
when the file is imported; a name that looks like a typo of an existing one is pointed out first.
"""

import csv
import io
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from karyahub.accounts import service as accounts
from karyahub.data import inventory, item_fields, rls
from karyahub.data.item_fields import MAX_TEXT, norm, similar
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
    "cut_from",
    "cut_gives",
)
COMPARED = ("code", "name", "unit", "sale", "cost", "hsn", "gst", "low")
IGNORED = frozenset({"sno", "s no", "sr", "sr no", "serial", "serial no", "no", "#", "id"})
NEW = "new"  # in a row's values: this entry or unit doesn't exist yet and is added at import


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


class Book:
    """What the business already has: its fields, the entries of each list and its units."""

    def __init__(self, records: dict[str, list[Record]]) -> None:
        self.fields = [r for r in records["item_field"] if not r.body.get("stopped")]
        self.field_by_key = {norm(f.body["name"]): f for f in self.fields}
        self.entries: dict[str, dict[str, Record]] = {f.id: {} for f in self.fields}
        for e in records["list_entry"]:
            if e.body.get("alias_of") or e.body.get("field_id") not in self.entries:
                continue
            self.entries[e.body["field_id"]][norm(e.body["name"])] = e
        self.units: dict[str, str] = {}  # what a person may type -> the unit's id
        for u in inventory.UNITS:
            self.units[norm(u)] = u
        for alias, unit in inventory.UNIT_ALIASES.items():
            self.units[norm(alias)] = unit
        self.unit_names = list(inventory.UNITS)
        for u in records["unit"]:
            if u.body.get("alias_of"):
                continue
            self.units[norm(u.body["name"])] = u.id
            self.unit_names.append(u.body["name"])
        self.whole = {u.id: bool(u.body.get("whole")) for u in records["unit"]} | {
            u: u in inventory.WHOLE_UNITS for u in inventory.UNITS
        }
        # What this file adds, in the order met: list entries by field id, units by key.
        self.new_entries: dict[str, dict[str, str]] = {}
        self.new_units: dict[str, str] = {}

    def column(self, header: str) -> str | None:
        """The header as a standard column (``sale price`` is ``sale_price``) or a field id."""
        key = header.strip().lower().replace(" ", "_")
        if key in COLUMNS:
            return key
        field = self.field_by_key.get(norm(header))
        return f"field:{field.id}" if field is not None else None


def _plain(head: list[str], book: Book) -> tuple[dict[str, int], list[str]]:
    """Where each column is, and the headers nobody asked for (ignored)."""
    where: dict[str, int] = {}
    unknown: list[str] = []
    for i, h in enumerate(head):
        col = book.column(h)
        if col is not None and col not in where:
            where[col] = i
        elif col is None and h and norm(h) not in IGNORED:
            unknown.append(h)
    return where, unknown


def _row(where: dict[str, int], cells: list[str]) -> dict[str, str]:
    return {c: (cells[i].strip() if i < len(cells) else "") for c, i in where.items()}


def _unit(book: Book, text: str, problems: list[str], notes: list[str]) -> str | None:
    """The unit's id, ``NEW`` plus its key when the business doesn't have it yet, or None with a problem."""
    if not text:
        problems.append("unit is empty (for example nos, kg, metre)")
        return None
    key = norm(text)
    if key in book.units:
        found = book.units[key]
        if text.lower() != found:
            notes.append(f'unit "{text}" read as {found}')
        return found
    if len(text) > 12 or all(ch.isdigit() or ch in ".,- " for ch in text):
        problems.append(f'unit "{text}" isn\'t a unit name (up to 12 letters, for example Coil)')
        return None
    near = similar(text, book.unit_names)
    if near:
        notes.append(f'unit "{text}": did you mean {near}? It will be added as a new unit')
    book.new_units.setdefault(key, text)
    return f"{NEW}:unit:{key}"


def _detail(book: Book, field: Record, text: str, problems: list[str], notes: list[str]) -> Any:
    name, kind = field.body["name"], field.body["type"]
    if not text:
        if field.body.get("required"):
            problems.append(f"{name} is empty")
        return None
    if kind == "text":
        if len(text) > MAX_TEXT:
            problems.append(f"{name} is longer than {MAX_TEXT} characters")
            return None
        return " ".join(text.split())
    if kind == "number":
        number = inventory._number(text.replace(",", ""))
        if number is None:
            problems.append(f'{name} "{text}" isn\'t a number')
            return None
        return int(number) if float(number).is_integer() else number
    key = norm(text)
    entry = book.entries[field.id].get(key)
    if entry is not None:
        return entry.id
    added = book.new_entries.setdefault(field.id, {})
    if key not in added:
        near = similar(text, [e.body["name"] for e in book.entries[field.id].values()] + list(added.values()))
        if near:
            notes.append(f'{name} "{text}": did you mean {near}? It will be added as new')
        added[key] = " ".join(text.split())
    return f"{NEW}:{field.id}:{key}"


def _check_row(
    book: Book, r: dict[str, str]
) -> tuple[dict[str, Any] | None, str, list[str], list[str], float]:
    problems: list[str] = []
    notes: list[str] = []
    name = r.get("name", "")
    if len(name) < 2:
        problems.append("name is empty" if not name else "name is shorter than 2 letters")
    unit = _unit(book, r.get("unit", ""), problems, notes)
    ok, sale = inventory.parse_rupees(r.get("sale_price", ""))
    if not ok or sale is None:
        problems.append(
            f'sale price "{r.get("sale_price", "")}" isn\'t a number'
            if r.get("sale_price")
            else "sale price is empty (use 0)"
        )
    ok_c, cost = inventory.parse_rupees(r.get("cost_price", ""))
    if not ok_c:
        problems.append(f'cost price "{r["cost_price"]}" isn\'t a number')
    code = r.get("code", "")
    if code and not inventory.CODE_RE.match(code):
        problems.append(f'code "{code}" has characters that are not allowed')
    hsn = r.get("hsn", "")
    if hsn and not inventory.HSN_RE.match(hsn):
        problems.append(f'HSN "{hsn}" must have 4, 6 or 8 digits')
    gst: float | None = 18
    if r.get("gst_rate"):
        gst = inventory._number(r["gst_rate"])
        if gst is None or gst not in inventory.GST_RATES:
            problems.append(f"GST rate {r['gst_rate']} % isn't one of 0, 0.25, 3, 5, 18, 40")
    low = None
    if r.get("low_stock_at"):
        low = inventory._number(r["low_stock_at"])
        if low is None or not 0 <= low <= inventory.MAX_QTY:
            problems.append(f'low_stock_at "{r["low_stock_at"]}" isn\'t a number')
    opening = 0.0
    if r.get("opening_stock"):
        n = inventory._number(r["opening_stock"])
        whole = book.whole.get(unit, False) if unit and not unit.startswith(NEW) else False
        label = r.get("unit", "") if not unit or unit.startswith(NEW) else unit
        issue = "isn't a number" if n is None else (inventory.quantity_problem(label, n, whole) or "")
        if issue:
            problems.append(f"opening stock {r['opening_stock']}: {issue[:1].lower()}{issue[1:].rstrip('.')}")
        else:
            opening = float(n or 0)
    attrs: dict[str, Any] = {}
    for field in book.fields:
        value = _detail(book, field, r.get(f"field:{field.id}", ""), problems, notes)
        if value is not None:
            attrs[field.id] = value
    details = [f"{f.body['name']}: {r[f'field:{f.id}']!s}" for f in book.fields if r.get(f"field:{f.id}")]
    if problems:
        return None, "; ".join(details), problems, notes, 0.0
    fields = {
        "name": name,
        "code": code,
        "unit": unit,
        "sale": sale,
        "cost": cost,
        "hsn": hsn,
        "gst": int(gst or 18) if float(gst or 18).is_integer() else gst,
        "low": None if low is None else inventory.r3(low),
        "attrs": attrs,
    }
    return fields, "; ".join(details), problems, notes, opening


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
    records: dict[str, list[Record]] = {}
    for kind in ("item", "item_field", "list_entry", "unit"):
        rows_of = await db.execute(
            select(Record).where(Record.business_id == business_id, Record.kind == kind)
        )
        records[kind] = list(rows_of.scalars().all())
    items = records["item"]
    book = Book(records)
    where, unknown = _plain(head, book)
    by_code = {str(i.body.get("code") or "").lower(): i for i in items if i.body.get("code")}
    by_name = {str(i.body.get("name") or "").lower(): i for i in items}

    seen: dict[str, int] = {}
    groups: dict[str, dict[str, Any]] = {}  # an item's first row, by its code or name (CR-0014)
    rows: list[dict[str, Any]] = []
    for index, cells in enumerate(data):
        number = index + 2  # the spreadsheet's row number: the column names are row 1
        r = _row(where, cells)
        fields, details, problems, notes, opening = _check_row(book, r)
        code, row_name = r.get("code", ""), r.get("name", "")
        key = f"c:{code.lower()}" if code else f"n:{row_name.lower()}" if row_name else ""
        first = groups.get(key) if key else None
        another_unit = (
            first is not None
            and fields is not None
            and first["_fields"] is not None
            and fields["unit"] != first["_fields"]["unit"]
            and fields["unit"] not in [sold["unit"] for sold in first["_fields"]["sells"]]
        )
        if another_unit and first is not None and fields is not None:
            sold = _sold_unit(book, r, fields, problems, notes)
            if sold is None:
                fields = None
            else:
                sold["_row"] = number
                first["_fields"]["sells"].append(sold)
                first["_opens"].append((fields["unit"], opening))
        elif key and key in seen:
            what = f"code {code}" if code else "this name"
            problems.append(f"{what} is also in row {seen[key]}")
            fields = None
        elif key:
            seen[key] = number
        existing = None
        if fields is not None and not another_unit:
            existing = by_code.get(code.lower()) if code else by_name.get(row_name.lower())
        status = "problem" if fields is None else "unit" if another_unit else "update" if existing else "new"
        if status == "update" and opening:
            notes.append("opening stock ignored for an existing item: use Stock in")
        if fields is not None and not another_unit:
            fields["sells"] = []
            if r.get("cut_from") or r.get("cut_gives"):
                notes.append("cut_from and cut_gives are read on the rows after the first of an item")
        rows.append(
            {
                "row": number,
                "status": status,
                "problems": problems,
                "notes": notes,
                "code": code,
                "name": row_name,
                "unit": r.get("unit", ""),
                "sale_price": r.get("sale_price", ""),
                "opening_stock": r.get("opening_stock", ""),
                "details": details,
                "_fields": fields,
                "_opening": opening,
                "_opens": [],
                "_existing": existing,
            }
        )
        if status in {"new", "update"} and key:
            groups[key] = rows[-1]
    _finish_groups(rows)
    counts = {s: sum(1 for x in rows if x["status"] == s) for s in ("new", "update", "same", "problem")}
    if any(x["status"] == "unit" for x in rows):
        counts["unit"] = sum(1 for x in rows if x["status"] == "unit")
    public_rows = [{k: v for k, v in x.items() if not k.startswith("_")} for x in rows]
    good = [x for x in rows if x["status"] in {"new", "update"}]
    used = {v for x in good for v in _values(x["_fields"]) if isinstance(v, str)}
    adds: dict[str, Any] = {
        "units": [n for k, n in book.new_units.items() if f"{NEW}:unit:{k}" in used],
        "lists": [],
    }
    for f in book.fields:
        names = [n for k, n in book.new_entries.get(f.id, {}).items() if f"{NEW}:{f.id}:{k}" in used]
        if names:
            adds["lists"].append({"field": f.body["name"], "values": names})
    report = {"file": name, "rows": public_rows, "counts": counts, "unknown_columns": unknown, "adds": adds}
    if check:
        return {"checked": True, **report}

    audits: list[tuple[str, str]] = []
    added = updated = 0
    if good:
        extra = len(adds["units"]) + sum(len(x["values"]) for x in adds["lists"])
        need = (
            sum(
                4 + 2 * len(x["_opens"]) if x["status"] == "new" else 1 for x in good if x["status"] != "unit"
            )
            + extra
        )
        top = await bump(db, business_id, "seq", need)
        cursor = top - need

        def take_seq() -> int:
            nonlocal cursor
            cursor += 1
            return cursor

        batch = inventory.Batch(db, p, business_id, take_seq, {}, audits)
        made = _make_lists(batch, book, used)
        for x in good:
            fields = dict(x["_fields"])
            fields["unit"] = made.get(fields["unit"], fields["unit"])
            fields["sells"] = [
                {
                    **{k: v for k, v in sold.items() if k != "_row"},
                    "unit": made.get(sold["unit"], sold["unit"]),
                    "cut_from": made.get(sold["cut_from"], sold["cut_from"]),
                }
                for sold in fields.get("sells", [])
            ]
            fields["attrs"] = {
                k: made.get(v, v) if isinstance(v, str) else v for k, v in fields["attrs"].items()
            }
            if x["status"] == "update":
                existing: Record = x["_existing"]
                fields["stopped"] = bool(existing.body.get("stopped", False))
                for flag in ("service", "price_includes_gst"):  # an update keeps what the file doesn't say
                    fields[flag] = bool(existing.body.get(flag, False))
                fields["sells"] = await item_fields.check_sells(batch, fields, existing.body)
                await batch.put_item(existing.id, {**fields, "id": existing.id}, existing)
                updated += 1
                continue
            item_id = f"it-{uuid.uuid4().hex[:16]}"
            fields.update(id=item_id, stopped=False)
            fields["sells"] = await item_fields.check_sells(batch, fields, {})
            await batch.put_item(item_id, fields, None)
            added += 1
            for unit_token, qty in x["_opens"]:
                if qty > 0:
                    await batch.apply_move(
                        f"mv-{uuid.uuid4().hex[:16]}",
                        {
                            "kind": "opening",
                            "item_id": item_id,
                            "unit": made.get(unit_token, unit_token),
                            "qty": qty,
                            "note": "From CSV import",
                        },
                        None,
                    )
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
    extra_text = ""
    if adds["units"] or adds["lists"]:
        count = len(adds["units"]) + sum(len(x["values"]) for x in adds["lists"])
        extra_text = f", {count} new list {'entry' if count == 1 else 'entries'}"
    await accounts.audit(
        db,
        business_id,
        p.user.name,
        "inventory_import",
        f"Imported inventory from {name or 'a CSV file'}: {added} new, {updated} updated, "
        f"{skipped} skipped{extra_text}",
    )
    await db.commit()
    return {
        "checked": False,
        **report,
        "imported": {"added": added, "updated": updated, "skipped": skipped},
    }


def _values(fields: dict[str, Any]) -> list[Any]:
    sold = fields.get("sells", [])
    return [
        fields.get("unit"),
        *fields.get("attrs", {}).values(),
        *[s["unit"] for s in sold],
        *[s["cut_from"] for s in sold],
    ]


def _sold_unit(
    book: Book, r: dict[str, str], fields: dict[str, Any], problems: list[str], notes: list[str]
) -> dict[str, Any] | None:
    """A later row of the same item is another unit it is sold in, with its own price (CR-0014)."""
    cut_from = ""
    gives = None
    if r.get("cut_from"):
        cut_from = _unit(book, r["cut_from"], problems, notes) or ""
        gives = inventory._number(r.get("cut_gives", ""))
        if gives is None or gives <= 0:
            problems.append("cut_gives must be a number above 0 when cut_from is given")
    elif r.get("cut_gives"):
        notes.append("cut_gives ignored: there is no cut_from")
    if problems:
        return None
    return {
        "unit": fields["unit"],
        "sale": fields["sale"],
        "cost": fields["cost"],
        "low": fields["low"],
        "cut_from": cut_from,
        "cut_gives": None if gives is None else inventory.r3(gives),
    }


def _finish_groups(rows: list[dict[str, Any]]) -> None:
    """After every row is read: a cut must start from a unit of the same item, and an update that changes
    nothing is 'same'."""
    by_row = {x["row"]: x for x in rows}
    for first in rows:
        fields = first["_fields"]
        if first["status"] not in {"new", "update"} or fields is None:
            continue
        units = [fields["unit"], *[s["unit"] for s in fields["sells"]]]
        for sold in list(fields["sells"]):
            if sold["cut_from"] and sold["cut_from"] not in units:
                fields["sells"].remove(sold)
                bad = by_row[sold["_row"]]
                bad["status"] = "problem"
                bad["problems"].append("cut_from must be another unit of this same item (in an earlier row)")
        existing = first["_existing"]
        if first["status"] == "update" and existing is not None:
            kept = [
                {k: v for k, v in s.items() if k not in {"qty", "_row"}}
                for s in existing.body.get("sells") or []
            ]
            now = [{k: v for k, v in s.items() if k != "_row"} for s in fields["sells"]]
            same_attrs = (existing.body.get("attrs") or {}) == fields["attrs"]
            if same_attrs and kept == now and all(existing.body.get(k) == fields[k] for k in COMPARED):
                first["status"] = "same"


def _make_lists(batch: inventory.Batch, book: Book, used: set[str]) -> dict[str, str]:
    """Make the units and list entries this file needs; answer which id each ``new:...`` word became."""
    made: dict[str, str] = {}

    def make(kind: str, body: dict[str, Any]) -> str:
        rid = f"{'un' if kind == 'unit' else 'le'}-{uuid.uuid4().hex[:16]}"
        batch.db.add(
            Record(
                business_id=batch.business_id,
                kind=kind,
                id=rid,
                number="",
                body={"id": rid, **body, "stopped": False},
                seq=batch.take_seq(),
                updated_at=batch.now,
            )
        )
        return rid

    for key, unit_name in book.new_units.items():
        if f"{NEW}:unit:{key}" in used:
            made[f"{NEW}:unit:{key}"] = make("unit", {"name": unit_name, "whole": False})
    for field in book.fields:
        for key, entry_name in book.new_entries.get(field.id, {}).items():
            token = f"{NEW}:{field.id}:{key}"
            if token in used:
                made[token] = make("list_entry", {"field_id": field.id, "name": entry_name})
    return made
