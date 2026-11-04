"""A business's own item details: fields, list entries and units (CR-0013, ADR-0017).

Each business sets up the details it wants on an item (Brand, Material type, Size, ...) and the lists those
details are picked from (a list of brands, a list of units). They are ordinary rows of the ``records`` table,
kinds ``item_field``, ``list_entry`` and ``unit``, so they sit behind the same business wall, the same
row-level security and the same sync call as everything else.

An item stores the *id* of the entry it points to, never its words, so correcting "Havels" once corrects every
item. Entries are stopped, never deleted. Two phones that add the same name while offline both succeed: the
second becomes an *alias* of the first (``alias_of``), and any item that points to the alias is written to
point at the first, so the lists never show a name twice.
"""

import difflib
import re
from typing import Any

from karyahub.data import inventory
from karyahub.data.inventory import UNIT_ALIASES, UNITS, Batch
from karyahub.db.models import Record
from karyahub.errors import AppError

KINDS = ("item_field", "list_entry", "unit")
FIELD_TYPES = ("text", "number", "list")
MAX_FIELDS = 15  # fields in use at once; a safety limit so a bad file can't flood a phone
MAX_TEXT = 120
# Names a field can't take, because the CSV file already has a column of that name.
RESERVED = frozenset(
    {
        "sno",
        "code",
        "name",
        "unit",
        "sale price",
        "sale",
        "cost price",
        "cost",
        "hsn",
        "gst rate",
        "gst",
        "low stock at",
        "low",
        "opening stock",
        "opening",
        "quantity",
        "qty",
    }
)


def norm(text: Any) -> str:
    """Words as a person compares them: no case, and spaces, dots, dashes and underscores all alike."""
    return re.sub(r"[\s_\-./]+", " ", str(text or "").strip().lower()).strip()


def similar(word: str, others: list[str]) -> str | None:
    """The one of ``others`` that ``word`` is probably a typo of (for example Havels and Havells)."""
    close = difflib.get_close_matches(norm(word), [norm(o) for o in others], n=1, cutoff=0.85)
    if not close or close[0] == norm(word):
        return None
    return next(o for o in others if norm(o) == close[0])


# ---------- checking what a phone sends ----------
def _flag(body: dict[str, Any], key: str, default: bool = False) -> bool:
    value = body.get(key, default)
    return value if isinstance(value, bool) else default


def clean(kind: str, rid: str, body: Any) -> dict[str, Any]:
    if not isinstance(body, dict):
        raise AppError("validation_error", "A change must carry the record itself.", 422)
    name = " ".join(str(body.get("name") or "").split())
    if kind == "item_field":
        if not 2 <= len(name) <= 40:
            raise AppError("validation_error", "Give the field a name of 2 to 40 characters.", 422)
        if body.get("type") not in FIELD_TYPES:
            raise AppError("validation_error", "A field is text, a number or a pick-list.", 422)
        return {
            "id": rid,
            "name": name,
            "type": body["type"],
            "required": _flag(body, "required"),
            "in_list": _flag(body, "in_list"),
            "in_filter": _flag(body, "in_filter") and body["type"] == "list",
            "on_bills": _flag(body, "on_bills"),
            "stopped": _flag(body, "stopped"),
        }
    if kind == "list_entry":
        if not 1 <= len(name) <= 60:
            raise AppError("validation_error", "Give the entry a name of up to 60 characters.", 422)
        field_id = str(body.get("field_id") or "")
        if not field_id:
            raise AppError("validation_error", "An entry belongs to a pick-list field.", 422)
        return {"id": rid, "field_id": field_id, "name": name, "stopped": _flag(body, "stopped")}
    if not 1 <= len(name) <= 12:
        raise AppError("validation_error", "Give the unit a name of up to 12 characters.", 422)
    if re.fullmatch(r"[\d.,\s]+", name):
        raise AppError("validation_error", "A unit is a word, for example Coil or Box.", 422)
    return {"id": rid, "name": name, "whole": _flag(body, "whole"), "stopped": _flag(body, "stopped")}


# ---------- saving ----------
def _write(batch: Batch, kind: str, rid: str, body: dict[str, Any], current: Record | None) -> Record:
    if current is None:
        rec = Record(
            business_id=batch.business_id,
            kind=kind,
            id=rid,
            number="",
            body=body,
            seq=batch.take_seq(),
            updated_at=batch.now,
        )
        batch.db.add(rec)
        batch.found[(kind, rid)] = rec
        return rec
    if current.body != body:
        current.body = body
        current.seq = batch.take_seq()
        current.updated_at = batch.now
    return current


async def put(batch: Batch, kind: str, rid: str, body: dict[str, Any], current: Record | None) -> Record:
    if current is not None and current.body.get("alias_of"):
        return current  # a merged duplicate is the server's; an edit to it changes nothing
    if kind == "item_field":
        return await _put_field(batch, rid, body, current)
    if kind == "list_entry":
        return await _put_entry(batch, rid, body, current)
    return await _put_unit(batch, rid, body, current)


async def _put_field(batch: Batch, rid: str, body: dict[str, Any], current: Record | None) -> Record:
    others = [r for r in await batch.all_of("item_field") if r.id != rid]
    active = [r for r in others if not r.body.get("stopped")]
    name, key = body["name"], norm(body["name"])
    if key in RESERVED:
        raise AppError(
            "name_reserved", f'"{name}" is already a standard column. Pick another name for the field.', 422
        )
    if not body["stopped"]:
        if any(norm(r.body["name"]) == key for r in active):
            raise AppError("name_in_use", f"You already have a field called {name}.", 409)
        if len(active) >= MAX_FIELDS and (current is None or current.body.get("stopped")):
            raise AppError(
                "too_many",
                f"You can have up to {MAX_FIELDS} item fields in use. Stop one you don't use first.",
                422,
            )
    if current is not None and current.body["type"] != body["type"]:
        await _change_type(batch, current, body)
    order = (
        current.body.get("order")
        if current is not None
        else max((r.body.get("order", 0) for r in others), default=0) + 1
    )
    saved = {**body, "order": order}
    was = dict(current.body) if current is not None else None
    rec = _write(batch, "item_field", rid, saved, current)
    if was is None:
        batch.audits.append(("inventory_field", f"Added item field {name}"))
    elif was.get("stopped") != body["stopped"]:
        said = "Stopped using" if body["stopped"] else "Started using again"
        batch.audits.append(("inventory_field", f"{said} item field {name}"))
    elif was != saved:
        batch.audits.append(("inventory_field", f"Changed item field {name}"))
    return rec


async def _change_type(batch: Batch, current: Record, body: dict[str, Any]) -> None:
    """Text and number can swap when every value fits; a pick-list can't change into anything else."""
    before, after = current.body["type"], body["type"]
    if "list" in (before, after):
        raise AppError(
            "type_locked",
            "A pick-list can't change into another kind of field. Add a new field and move the values.",
            409,
        )
    if after == "number":
        bad = []
        for item in await batch.all_of("item"):
            value = (item.body.get("attrs") or {}).get(current.id)
            if value not in (None, "") and inventory._number(value) is None:
                bad.append(str(value))
        if bad:
            shown = ", ".join(dict.fromkeys(bad[:5]))
            raise AppError(
                "type_unsafe", f"These values aren't numbers: {shown}. Correct them before the change.", 409
            )


async def _put_entry(batch: Batch, rid: str, body: dict[str, Any], current: Record | None) -> Record:
    field = await batch.record("item_field", body["field_id"])
    if field is None or field.body.get("type") != "list":
        raise AppError("validation_error", "That field isn't a pick-list.", 422)
    if current is not None and current.body["field_id"] != body["field_id"]:
        raise AppError("validation_error", "An entry can't move to another list.", 422)
    key = norm(body["name"])
    twin = next(
        (
            r
            for r in await batch.all_of("list_entry")
            if r.id != rid
            and r.body.get("field_id") == body["field_id"]
            and not r.body.get("alias_of")
            and norm(r.body["name"]) == key
        ),
        None,
    )
    if twin is not None:
        if current is not None:
            raise AppError("name_in_use", f"{body['name']} is already in this list.", 409)
        return _write(batch, "list_entry", rid, {**body, "alias_of": twin.id, "stopped": True}, None)
    rec = _write(batch, "list_entry", rid, body, current)
    if current is None:
        batch.audits.append(("inventory_list", f"Added {field.body['name']}: {body['name']}"))
    return rec


async def _put_unit(batch: Batch, rid: str, body: dict[str, Any], current: Record | None) -> Record:
    key = norm(body["name"])
    built_in = next((u for u in UNITS if norm(u) == key), None) or next(
        (UNIT_ALIASES[a] for a in UNIT_ALIASES if norm(a) == key), None
    )
    twin_id = built_in
    if twin_id is None:
        twin = next(
            (
                r
                for r in await batch.all_of("unit")
                if r.id != rid and not r.body.get("alias_of") and norm(r.body["name"]) == key
            ),
            None,
        )
        twin_id = twin.id if twin is not None else None
    if twin_id is not None:
        if current is not None:
            raise AppError("name_in_use", f"{body['name']} is already one of your units.", 409)
        return _write(batch, "unit", rid, {**body, "alias_of": twin_id, "stopped": True}, None)
    rec = _write(batch, "unit", rid, body, current)
    if current is None:
        batch.audits.append(("inventory_list", f"Added unit {body['name']}"))
    return rec


# ---------- checking an item against the business's fields ----------
async def check_item(batch: Batch, body: dict[str, Any], existing: Record | None) -> dict[str, Any]:
    """The item with its unit and details checked: aliases are replaced by the entry they merged into."""
    before = existing.body if existing is not None else {}
    unit = body["unit"]
    if unit not in UNITS:
        rec = await batch.record("unit", unit)
        if rec is None:
            raise AppError("validation_error", "Pick a unit from your list.", 422)
        if rec.body.get("alias_of"):
            unit = str(rec.body["alias_of"])
            rec = await batch.record("unit", unit) if unit not in UNITS else None
        if rec is not None and rec.body.get("stopped") and unit != before.get("unit"):
            raise AppError(
                "validation_error", f"The unit {rec.body['name']} is not in use. Pick another.", 409
            )
    body["unit"] = unit
    body["attrs"] = await clean_attrs(batch, body.get("attrs"), before.get("attrs") or {})
    return body


async def clean_attrs(batch: Batch, raw: Any, before: dict[str, Any]) -> dict[str, Any]:
    fields = {r.id: r.body for r in await batch.all_of("item_field")}
    out: dict[str, Any] = {}
    for fid, value in (raw or {}).items():
        field = fields.get(fid)
        if field is None or value is None or str(value).strip() == "":
            continue  # a field that is gone, or left empty
        name = field["name"]
        if field["type"] == "text":
            text = " ".join(str(value).split())
            if len(text) > MAX_TEXT:
                raise AppError("validation_error", f"{name} can have up to {MAX_TEXT} characters.", 422)
            out[fid] = text
        elif field["type"] == "number":
            number = inventory._number(value)
            if number is None or abs(number) > 1e12:
                raise AppError("validation_error", f"{name} must be a number.", 422)
            out[fid] = int(number) if float(number).is_integer() else number
        else:
            entry = await batch.record("list_entry", str(value))
            if entry is not None and entry.body.get("alias_of"):
                entry = await batch.record("list_entry", str(entry.body["alias_of"]))
            if entry is None or entry.body.get("field_id") != fid:
                raise AppError("validation_error", f"Pick a {name} from the list.", 422)
            if entry.body.get("stopped") and before.get(fid) != entry.id:
                raise AppError(
                    "validation_error", f"{entry.body['name']} is not in use. Pick another {name}.", 409
                )
            out[fid] = entry.id
    for fid, field in fields.items():
        if field.get("required") and not field.get("stopped") and fid not in out:
            raise AppError("validation_error", f"Give the {field['name']}.", 422)
    return out
