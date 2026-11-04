"""US-32 to US-34: a business's own item fields, lists and units, and the CSV import that uses them (CR-0013)."""

import pytest
from test_us25_inventory import (
    COORD,
    TECH,
    add_member,
    item,
    log_lines,
    move,
    one,
    op,
    state_of,
    sync,
)

CSV_HEAD = (
    "code,name,Brand,Material type,Size,unit,sale_price,cost_price,hsn,gst_rate,low_stock_at,opening_stock"
)


@pytest.fixture
def firm(make_business):
    return make_business("Shree Cool AC", "9811100001")


def field(name="Brand", kind="list", **over):
    return {"name": name, "type": kind, "required": False, "in_list": False, "in_filter": False, **over}


def entry(field_id, name):
    return {"field_id": field_id, "name": name, "stopped": False}


@pytest.fixture
def shop(firm):
    """An owner with a Brand list (Havells, Polycab), a Material type list, a Size text field, one Coil unit."""
    owner = firm["owner"]
    r = sync(
        owner,
        [
            op("item_field", "f-brand", field("Brand", in_list=True, in_filter=True)),
            op("item_field", "f-mat", field("Material type", "list")),
            op("item_field", "f-size", field("Size", "text")),
            op("list_entry", "e-havells", entry("f-brand", "Havells")),
            op("list_entry", "e-polycab", entry("f-brand", "Polycab")),
            op("list_entry", "e-wire", entry("f-mat", "FR PVC Copper Wire")),
            op("unit", "u-coil", {"name": "Coil", "whole": True, "stopped": False}),
        ],
    )
    assert [x["status"] for x in r["results"]] == ["applied"] * 7, r["results"]
    return owner


def wire(**over):
    base = {
        "name": "Life Line Plus 0.75 sq mm - Red",
        "code": "WIR-075-RD",
        "unit": "u-coil",
        "sale": 92000,
        "attrs": {"f-brand": "e-havells", "f-mat": "e-wire", "f-size": "0.75 sq mm"},
    }
    return item(**{**base, **over})


# ---------- US-32: fields ----------
def test_ac_32_1_an_owner_adds_renames_and_stops_a_field_at_any_time(firm):
    """AC-32.1: fields can be added, renamed and stopped whenever; the order is the order they were made."""
    owner = firm["owner"]
    assert one(owner, "item_field", "f-1", field("Brand"))["status"] == "applied"
    assert one(owner, "item_field", "f-2", field("Colour"))["status"] == "applied"
    assert one(owner, "item_field", "f-1", field("Make"))["status"] == "applied"  # renamed
    assert one(owner, "item_field", "f-2", field("Colour", stopped=True))["status"] == "applied"
    got = {c["id"]: c["body"] for c in sync(owner)["changes"]["item_field"]}
    assert got["f-1"]["name"] == "Make" and got["f-2"]["stopped"] is True
    assert got["f-1"]["order"] < got["f-2"]["order"]
    lines = log_lines(owner)
    assert "Added item field Brand" in lines and "Stopped using item field Colour" in lines


def test_ac_32_1_a_field_name_is_unique_and_never_a_standard_column(firm):
    """AC-32.1: the same name twice, or a name the CSV already uses (code, unit...), is refused."""
    owner = firm["owner"]
    assert one(owner, "item_field", "f-1", field("Brand"))["status"] == "applied"
    twice = one(owner, "item_field", "f-2", field("brand "))
    assert twice["status"] == "rejected" and "already have a field called" in twice["message"]
    for reserved in ("Unit", "Sale price", "HSN"):
        r = one(owner, "item_field", "f-3", field(reserved))
        assert r["status"] == "rejected" and "standard column" in r["message"]


def test_ac_32_1_a_business_has_up_to_15_fields_in_use(firm):
    """AC-32.1: a safety limit of 15 fields in use; stopping one makes room."""
    owner = firm["owner"]
    ops = [op("item_field", f"f-{i}", field(f"Detail {i}", "text")) for i in range(15)]
    assert all(x["status"] == "applied" for x in sync(owner, ops)["results"])
    over = one(owner, "item_field", "f-x", field("One more", "text"))
    assert over["status"] == "rejected" and "up to 15 item fields" in over["message"]
    assert one(owner, "item_field", "f-0", field("Detail 0", "text", stopped=True))["status"] == "applied"
    assert one(owner, "item_field", "f-x", field("One more", "text"))["status"] == "applied"


def test_ac_32_2_text_and_number_can_swap_when_every_value_fits(shop):
    """AC-32.2: text to number is refused, naming the values, until each one is a number; a pick-list is locked."""
    assert one(shop, "item", "it-1", wire(attrs={"f-size": "0.75 sq mm"}))["status"] == "applied"
    refused = one(shop, "item_field", "f-size", field("Size", "number"))
    assert refused["status"] == "rejected" and "0.75 sq mm" in refused["message"]
    assert one(shop, "item", "it-1", wire(attrs={"f-size": "0.75"}))["status"] == "applied"
    assert one(shop, "item_field", "f-size", field("Size", "number"))["status"] == "applied"
    assert one(shop, "item", "it-1", wire(attrs={"f-size": "0.75"}))["status"] == "applied"
    assert state_of(shop, "item", "it-1")["attrs"]["f-size"] == 0.75  # stored as a number from now on
    locked = one(shop, "item_field", "f-brand", field("Brand", "text"))
    assert locked["status"] == "rejected" and "can't change into another kind" in locked["message"]


# ---------- US-32: lists ----------
def test_ac_32_3_an_entry_belongs_to_a_pick_list_and_is_unique_in_it(shop):
    """AC-32.3: an entry needs a pick-list field; renaming it to a name already in the list is refused."""
    no_list = one(shop, "list_entry", "e-x", entry("f-size", "Big"))
    assert no_list["status"] == "rejected" and "isn't a pick-list" in no_list["message"]
    clash = one(shop, "list_entry", "e-polycab", entry("f-brand", "havells"))
    assert clash["status"] == "rejected" and "already in this list" in clash["message"]
    assert one(shop, "list_entry", "e-polycab", entry("f-brand", "Polycab Cables"))["status"] == "applied"
    assert state_of(shop, "list_entry", "e-polycab")["name"] == "Polycab Cables"


def test_ac_32_3_two_phones_adding_the_same_name_end_up_with_one_entry(shop):
    """AC-32.3: the second becomes an alias of the first; an item that points to it is written to point at the first."""
    assert one(shop, "list_entry", "e-dup", entry("f-brand", " HAVELLS"))["status"] == "applied"
    dup = state_of(shop, "list_entry", "e-dup")
    assert dup["alias_of"] == "e-havells" and dup["stopped"] is True
    assert one(shop, "item", "it-1", wire(attrs={"f-brand": "e-dup"}))["status"] == "applied"
    assert state_of(shop, "item", "it-1")["attrs"] == {"f-brand": "e-havells"}


def test_ac_32_3_a_stopped_entry_cannot_be_picked_but_old_items_keep_it(shop):
    """AC-32.3: stopping a brand hides it from new picks; items that already have it still read it."""
    assert one(shop, "item", "it-1", wire())["status"] == "applied"
    assert (
        one(shop, "list_entry", "e-havells", entry("f-brand", "Havells") | {"stopped": True})["status"]
        == "applied"
    )
    assert one(shop, "item", "it-1", wire(low=2))["status"] == "applied"  # same brand as before: fine
    other = one(shop, "item", "it-2", wire(code="WIR-2", attrs={"f-brand": "e-havells"}))
    assert other["status"] == "rejected" and "Havells is not in use" in other["message"]


# ---------- US-32: an item's details ----------
def test_ac_32_4_an_item_keeps_its_details_by_id_and_each_kind_is_checked(shop):
    """AC-32.4: a list value is an entry of that field, a number is a number, text is trimmed; unknown fields go."""
    assert (
        one(
            shop,
            "item",
            "it-1",
            wire(attrs={"f-brand": "e-havells", "f-size": "  0.75   sq mm", "gone": "x"}),
        )["status"]
        == "applied"
    )
    assert state_of(shop, "item", "it-1")["attrs"] == {"f-brand": "e-havells", "f-size": "0.75 sq mm"}
    wrong = one(shop, "item", "it-2", wire(code="W2", attrs={"f-brand": "e-wire"}))  # a material, not a brand
    assert wrong["status"] == "rejected" and "Pick a Brand from the list" in wrong["message"]
    assert one(shop, "item_field", "f-weight", field("Weight", "number"))["status"] == "applied"
    nan = one(shop, "item", "it-3", wire(code="W3", attrs={"f-weight": "heavy"}))
    assert nan["status"] == "rejected" and "Weight must be a number" in nan["message"]


def test_ac_32_4_a_required_field_must_be_given(shop):
    """AC-32.4: with Brand required an item without one is refused; a stopped required field is not asked for."""
    assert one(shop, "item_field", "f-brand", field("Brand", required=True))["status"] == "applied"
    missing = one(shop, "item", "it-1", wire(attrs={}))
    assert missing["status"] == "rejected" and "Give the Brand" in missing["message"]
    assert (
        one(shop, "item_field", "f-brand", field("Brand", required=True, stopped=True))["status"] == "applied"
    )
    assert one(shop, "item", "it-1", wire(attrs={}))["status"] == "applied"


def test_ac_32_4_items_made_before_any_field_exist_still_load_and_save(firm):
    """AC-32.4: an item with no details (as v0.8.0 made them) reads back with an empty attrs and can be saved."""
    owner = firm["owner"]
    assert one(owner, "item", "it-old", item())["status"] == "applied"
    assert state_of(owner, "item", "it-old")["attrs"] == {}
    assert one(owner, "item", "it-old", item(sale=50000))["status"] == "applied"


# ---------- US-32: who may do what ----------
def test_ac_32_7_only_the_owner_changes_fields_and_staff_who_manage_stock_add_entries(shop, make_client):
    """AC-32.7: fields need manage_settings; entries and units need manage_inventory; parts staff only read."""
    add_member(shop, COORD)
    add_member(shop, TECH)
    coord = make_client(COORD["phone"], COORD["pin"])
    no = one(coord, "item_field", "f-new", field("Colour"))
    assert no["status"] == "rejected" and "doesn't include this" in no["message"]
    assert one(coord, "list_entry", "e-new", entry("f-brand", "Finolex"))["status"] == "applied"
    assert one(coord, "unit", "u-box", {"name": "Box", "whole": True})["status"] == "applied"
    assert {"item_field", "list_entry", "unit"} <= set(sync(coord)["readable"])
    tech = make_client(TECH["phone"], TECH["pin"])
    assert not {"item", "item_field", "list_entry", "unit"} & set(sync(tech)["readable"])
    denied = one(tech, "list_entry", "e-t", entry("f-brand", "Anchor"))
    assert denied["status"] == "rejected"
    allow = {"overrides": {"use_parts": "allow"}}
    tech_id = next(m["id"] for m in shop.get("/api/v1/team").json()["members"] if m["phone"] == TECH["phone"])
    assert shop.put(f"/api/v1/team/{tech_id}/permissions", json=allow).status_code == 200
    assert {"item", "item_field", "list_entry", "unit"} <= set(
        sync(tech)["readable"]
    )  # parts need to name them
    assert one(tech, "list_entry", "e-t", entry("f-brand", "Anchor"))["status"] == "rejected"


def test_ac_32_8_each_business_has_its_own_fields_and_lists(two_businesses):
    """AC-32.8: another business never sees a field, an entry or a unit, and can't point an item at them."""
    a, b = two_businesses
    assert one(a, "item_field", "f-brand", field("Brand"))["status"] == "applied"
    assert one(a, "list_entry", "e-1", entry("f-brand", "Havells"))["status"] == "applied"
    assert sync(b)["changes"]["item_field"] == [] and sync(b)["changes"]["list_entry"] == []
    leak = one(b, "item", "it-1", item(attrs={"f-brand": "e-1"}))
    assert leak["status"] == "applied" and state_of(b, "item", "it-1")["attrs"] == {}


@pytest.fixture
def two_businesses(make_business):
    return make_business("Shree Cool AC", "9811100001")["owner"], make_business("Blue Star", "9811100002")[
        "owner"
    ]


# ---------- US-33: units ----------
def test_ac_33_1_an_owner_adds_a_unit_and_a_repeat_name_is_merged(shop):
    """AC-33.1: a unit has a name of up to 12 characters; a name already used (even a built-in) is merged."""
    long = one(shop, "unit", "u-x", {"name": "A very long unit", "whole": False})
    assert long["status"] == "rejected" and "up to 12 characters" in long["message"]
    number = one(shop, "unit", "u-x", {"name": "12", "whole": False})
    assert number["status"] == "rejected"
    assert one(shop, "unit", "u-m", {"name": "Metres", "whole": False})["status"] == "applied"
    assert state_of(shop, "unit", "u-m")["alias_of"] == "metre"  # the built-in unit
    assert one(shop, "unit", "u-c2", {"name": "coil", "whole": False})["status"] == "applied"
    assert state_of(shop, "unit", "u-c2")["alias_of"] == "u-coil"


def test_ac_33_2_an_item_can_use_a_unit_of_the_business_and_its_whole_rule_applies(shop):
    """AC-33.2: stock in Coil must be whole numbers; messages call it Coil; a repeat unit is replaced by the first."""
    assert one(shop, "item", "it-w", wire())["status"] == "applied"
    bad = one(shop, "stock_move", "mv-1", move("it-w", "opening", 2.5))
    assert bad["status"] == "rejected" and "Use a whole number for Coil" in bad["message"]
    assert one(shop, "stock_move", "mv-2", move("it-w", "opening", 25))["status"] == "applied"
    short = one(shop, "stock_move", "mv-3", move("it-w", "out", 30, note="Lost", reason="lost"))
    assert short["status"] == "rejected" and "Only 25 Coil in stock" in short["message"]
    assert one(shop, "unit", "u-c2", {"name": "COIL", "whole": False})["status"] == "applied"
    assert one(shop, "item", "it-d", wire(code="W9", unit="u-c2"))["status"] == "applied"
    assert state_of(shop, "item", "it-d")["unit"] == "u-coil"
    unknown = one(shop, "item", "it-u", wire(code="W8", unit="nope"))
    assert unknown["status"] == "rejected" and "Pick a unit from your list" in unknown["message"]


def test_ac_33_3_a_stopped_unit_stays_on_the_items_that_have_it(shop):
    """AC-33.3: stopping a unit keeps it on existing items; new items can't pick it."""
    assert one(shop, "item", "it-w", wire())["status"] == "applied"
    assert (
        one(shop, "unit", "u-coil", {"name": "Coil", "whole": True, "stopped": True})["status"] == "applied"
    )
    assert one(shop, "item", "it-w", wire(sale=95000))["status"] == "applied"
    new = one(shop, "item", "it-n", wire(code="W7"))
    assert new["status"] == "rejected" and "The unit Coil is not in use" in new["message"]


# ---------- US-34: the CSV import with a business's own columns ----------
def import_csv(client, text, commit=False, name="stock.csv"):
    r = client.post("/api/v1/inventory/import", json={"text": text, "name": name, "check": not commit})
    assert r.status_code == 200, r.text
    return r.json()


ROWS = (
    f"{CSV_HEAD}\n"
    "WIR-075-RD,Life Line Plus 0.75 sq mm - Red,Havells,FR PVC Copper Wire,0.75 sq mm,Coil,920,740,8544,18,5,25\n"
    "WIR-075-BK,Life Line Plus 0.75 sq mm - Black,Finolex,FR PVC Copper Wire,0.75 sq mm,Coil,920,740,8544,18,5,20\n"
    "SW-1,Modular switch,Polycab,Switch,,nos,45,30,8536,18,,10\n"
)


def test_ac_34_2_the_check_lists_what_will_be_added_and_saves_nothing(shop):
    """AC-34.2: new brands, materials and units are named before anything is saved; a check changes nothing."""
    body = import_csv(shop, ROWS)
    assert body["checked"] is True and body["counts"] == {"new": 3, "update": 0, "same": 0, "problem": 0}
    assert body["adds"]["units"] == []  # Coil is already a unit of this business
    adds = {x["field"]: x["values"] for x in body["adds"]["lists"]}
    assert adds == {"Brand": ["Finolex"], "Material type": ["Switch"]}
    assert "Brand: Havells" in body["rows"][0]["details"]
    assert sync(shop)["changes"]["item"] == []


def test_ac_34_2_unknown_columns_are_named_and_a_serial_number_column_is_ignored(shop):
    """AC-34.2: a column the business has no field for is listed (not guessed); Sno is quietly ignored."""
    text = "Sno,code,name,unit,sale_price,Make\n1,A1,Thing,nos,10,Acme\n"
    body = import_csv(shop, text)
    assert body["unknown_columns"] == ["make"] and body["counts"]["new"] == 1


def test_ac_34_3_a_name_that_looks_like_a_typo_is_pointed_out(shop):
    """AC-34.3: 'Havels' is flagged as a likely typo of Havells in the row's notes, still added if imported."""
    text = f"{CSV_HEAD}\nX1,Wire,Havels,FR PVC Copper Wire,,nos,10,,,18,,\n"
    body = import_csv(shop, text)
    assert body["rows"][0]["status"] == "new"
    assert 'Brand "Havels": did you mean Havells?' in body["rows"][0]["notes"][0]


def test_ac_34_4_import_adds_the_items_their_lists_and_units_once(shop):
    """AC-34.4: items carry the right entry ids; new entries exist; running the same file again changes nothing."""
    done = import_csv(shop, ROWS, commit=True)
    assert done["imported"] == {"added": 3, "updated": 0, "skipped": 0}
    changes = sync(shop)["changes"]
    brands = {c["body"]["name"]: c["id"] for c in changes["list_entry"] if c["body"]["field_id"] == "f-brand"}
    assert set(brands) == {"Havells", "Polycab", "Finolex"}  # Finolex is new
    items = {c["body"]["code"]: c["body"] for c in changes["item"]}
    assert items["WIR-075-BK"]["attrs"]["f-brand"] == brands["Finolex"]
    assert items["WIR-075-BK"]["unit"] == "u-coil" and items["WIR-075-BK"]["qty"] == 20
    assert items["SW-1"]["unit"] == "nos"
    again = import_csv(shop, ROWS, commit=True)
    assert again["counts"] == {"new": 0, "update": 0, "same": 3, "problem": 0}
    assert any(
        "1 new list entry" not in x and "Imported inventory from stock.csv" in x for x in log_lines(shop)
    )


def test_ac_34_4_a_new_unit_in_the_file_is_added_and_used(shop):
    """AC-34.4: 'Bundle' is not a unit yet: the check names it, the import makes it and the item uses it."""
    text = "name,unit,sale_price\nCable tie,Bundle,30\n"
    assert import_csv(shop, text)["adds"]["units"] == ["Bundle"]
    import_csv(shop, text, commit=True)
    units = {c["body"]["name"]: c["id"] for c in sync(shop)["changes"]["unit"]}
    tie = next(c["body"] for c in sync(shop)["changes"]["item"] if c["body"]["name"] == "Cable tie")
    assert "Bundle" in units and tie["unit"] == units["Bundle"]


def test_ac_34_4_a_wrong_value_in_a_row_skips_only_that_row(shop):
    """AC-34.4: a unit that is a number, or a number field with words, is a problem in plain words."""
    assert one(shop, "item_field", "f-w", field("Weight kg", "number"))["status"] == "applied"
    text = "name,unit,sale_price,Weight kg\nGood,nos,10,2.5\nBad unit,500,10,1\nBad weight,nos,10,heavy\n"
    body = import_csv(shop, text)
    assert body["counts"]["new"] == 1 and body["counts"]["problem"] == 2
    reasons = [" ".join(r["problems"]) for r in body["rows"] if r["problems"]]
    assert "isn't a unit name" in reasons[0] and 'Weight kg "heavy" isn\'t a number' in reasons[1]


def test_ac_34_4_a_required_detail_missing_in_a_row_is_a_problem(shop):
    """AC-34.4: a required field left empty in the file is a problem for that row."""
    assert one(shop, "item_field", "f-brand", field("Brand", required=True))["status"] == "applied"
    body = import_csv(shop, "name,unit,sale_price,Brand\nNo brand,nos,10,\n")
    assert body["counts"]["problem"] == 1 and "Brand is empty" in body["rows"][0]["problems"][0]


def test_ac_34_1_the_phone_makes_the_template_from_the_fields_so_the_server_reads_it_back(shop):
    """AC-34.1: a header written with spaces or underscores, in any case, reaches the same field."""
    text = "name,unit,sale_price,MATERIAL_TYPE,brand\nPipe,nos,5,FR PVC Copper Wire,HAVELLS\n"
    body = import_csv(shop, text)
    assert body["counts"]["new"] == 1 and body["adds"]["lists"] == [] and body["unknown_columns"] == []
