"""US-36 and US-37: an item sold in several units, each with its own stock, and Cut (CR-0014)."""

import pytest
from conftest import line, put_doc, stored, sync_ops
from test_us25_inventory import COORD, add_member, item, log_lines, move, one, op, state_of, sync
from test_us32_item_fields import import_csv


def sold(unit, sale, **over):
    return {"unit": unit, "sale": sale, "cost": None, "low": None, "cut_from": "", "cut_gives": None, **over}


@pytest.fixture
def firm(make_business):
    return make_business("Shree Cool AC", "9811100001")


@pytest.fixture
def wire(firm):
    """Wire counted by the coil (the main unit), also sold by the metre and by the box of 5 coils."""
    owner = firm["owner"]
    r = sync(
        owner,
        [
            op("unit", "u-coil", {"name": "Coil", "whole": True, "stopped": False}),
            op("unit", "u-box", {"name": "Box", "whole": True, "stopped": False}),
        ],
    )
    assert [x["status"] for x in r["results"]] == ["applied"] * 2
    body = item(
        name="Life Line Plus Red",
        code="WIR-RD",
        unit="u-coil",
        sale=92000,
        cost=74000,
        sells=[
            sold("metre", 1200, cost=900, low=20, cut_from="u-coil", cut_gives=90),
            sold("u-box", 440000, cost=360000),
        ],
    )
    assert one(owner, "item", "it-w", body)["status"] == "applied"
    return owner


# ---------- US-36: the item and its units ----------
def test_ac_36_1_an_item_holds_its_other_units_with_prices_and_a_quantity_of_zero(wire):
    """AC-36.1: each selling unit has its own sale price, cost price, low level and stock, and its cut."""
    got = state_of(wire, "item", "it-w")
    assert got["unit"] == "u-coil" and got["qty"] == 0 and got["sale"] == 92000
    assert [s["unit"] for s in got["sells"]] == ["metre", "u-box"]
    metre = got["sells"][0]
    assert metre == {
        "unit": "metre",
        "sale": 1200,
        "cost": 900,
        "low": 20.0,
        "cut_from": "u-coil",
        "cut_gives": 90.0,
        "qty": 0.0,
    }


def test_ac_36_1_items_made_before_units_were_added_read_with_none(firm):
    """AC-36.1: an item from v0.9.0 or before reads with no other units, and saves."""
    owner = firm["owner"]
    assert one(owner, "item", "it-old", item())["status"] == "applied"
    assert state_of(owner, "item", "it-old")["sells"] == []


def test_ac_36_1_the_units_are_checked(wire):
    """AC-36.1: a unit twice, the main unit again, an unknown unit, a cut from nowhere, or a service with units is refused."""
    base = item(name="Item X", code="X1", unit="u-coil")
    twice = one(wire, "item", "it-1", {**base, "sells": [sold("metre", 100), sold("metre", 110)]})
    assert twice["status"] == "rejected" and "metre is listed twice" in twice["message"]
    main = one(wire, "item", "it-1", {**base, "sells": [sold("u-coil", 100)]})
    assert main["status"] == "rejected" and "Coil is listed twice" in main["message"]
    unknown = one(wire, "item", "it-1", {**base, "sells": [sold("nope", 100)]})
    assert unknown["status"] == "rejected" and "Pick a unit from your list" in unknown["message"]
    nowhere = one(wire, "item", "it-1", {**base, "sells": [sold("metre", 100, cut_from="kg", cut_gives=2)]})
    assert nowhere["status"] == "rejected" and "start from one of this item's own units" in nowhere["message"]
    nogive = one(wire, "item", "it-1", {**base, "sells": [sold("metre", 100, cut_from="u-coil")]})
    assert nogive["status"] == "rejected" and "how many a cut gives" in nogive["message"]
    service = one(wire, "item", "it-1", {**base, "service": True, "sells": [sold("metre", 100)]})
    assert service["status"] == "rejected" and "A service has no stock" in service["message"]


def test_ac_36_1_an_item_is_sold_in_up_to_50_units(firm):
    """AC-36.1: the safety limit is 49 other units (50 with the main one)."""
    owner = firm["owner"]
    names = [f"Unit{i:02d}" for i in range(50)]
    sync(owner, [op("unit", f"u-{i}", {"name": n, "whole": False}) for i, n in enumerate(names)])
    base = item(name="Thing", code="T1", unit="nos")
    ok = one(owner, "item", "it-1", {**base, "sells": [sold(f"u-{i}", 100) for i in range(49)]})
    assert ok["status"] == "applied"
    over = one(
        owner, "item", "it-2", {**base, "code": "T2", "sells": [sold(f"u-{i}", 100) for i in range(50)]}
    )
    assert over["status"] == "rejected" and "up to 50 units" in over["message"]


def test_ac_36_1_a_unit_with_stock_cannot_be_taken_off(wire):
    """AC-36.1: taking a unit off an item is refused while it holds stock; with none it goes."""
    assert one(wire, "stock_move", "mv-1", move("it-w", "opening", 50, unit="metre"))["status"] == "applied"
    body = {k: v for k, v in state_of(wire, "item", "it-w").items() if k not in {"qty", "id"}}
    refused = one(wire, "item", "it-w", {**body, "sells": [s for s in body["sells"] if s["unit"] != "metre"]})
    assert refused["status"] == "rejected" and "metre still has stock" in refused["message"]
    free = one(wire, "item", "it-w", {**body, "sells": [s for s in body["sells"] if s["unit"] != "u-box"]})
    assert free["status"] == "applied" and [s["unit"] for s in state_of(wire, "item", "it-w")["sells"]] == [
        "metre"
    ]


def test_ac_36_1_editing_an_item_keeps_every_units_quantity(wire):
    """AC-36.1: a price change never touches stock in any unit."""
    sync(
        wire,
        [
            op("stock_move", "mv-a", move("it-w", "opening", 25)),
            op("stock_move", "mv-b", move("it-w", "opening", 500, unit="metre")),
        ],
    )
    body = {k: v for k, v in state_of(wire, "item", "it-w").items() if k not in {"qty", "id"}}
    body["sells"][0]["sale"] = 1300
    assert one(wire, "item", "it-w", body)["status"] == "applied"
    got = state_of(wire, "item", "it-w")
    assert got["qty"] == 25 and got["sells"][0]["qty"] == 500 and got["sells"][0]["sale"] == 1300


# ---------- US-36: stock per unit ----------
def test_ac_36_2_stock_in_out_and_count_work_on_the_unit_chosen(wire):
    """AC-36.2: each unit's quantity moves on its own; the move says which unit; messages use its name."""
    sync(
        wire,
        [
            op("stock_move", "mv-1", move("it-w", "opening", 25)),
            op("stock_move", "mv-2", move("it-w", "opening", 300, unit="metre")),
        ],
    )
    assert (
        one(wire, "stock_move", "mv-3", move("it-w", "out", 40, unit="metre", reason="lost", note="Offcut"))[
            "status"
        ]
        == "applied"
    )
    assert one(wire, "stock_move", "mv-4", move("it-w", "count", counted=22))["status"] == "applied"
    got = state_of(wire, "item", "it-w")
    assert got["qty"] == 22 and got["sells"][0]["qty"] == 260
    moves = {m["id"]: m["body"] for m in sync(wire)["changes"]["stock_move"]}
    assert moves["mv-2"]["unit"] == "metre" and "unit" not in moves["mv-1"]  # the main unit needs no label
    short = one(wire, "stock_move", "mv-5", move("it-w", "out", 400, unit="metre", reason="lost", note="x"))
    assert short["status"] == "rejected" and "Only 260 metre in stock" in short["message"]
    whole = one(wire, "stock_move", "mv-6", move("it-w", "in", 2.5, unit="u-box"))
    assert whole["status"] == "rejected" and "Use a whole number for Box" in whole["message"]
    nope = one(wire, "stock_move", "mv-7", move("it-w", "in", 1, unit="kg"))
    assert nope["status"] == "rejected" and "isn't sold in that unit" in nope["message"]


def test_ac_36_4_parts_for_a_job_use_the_main_unit_only(wire):
    """AC-36.4: a part is taken for a job in the item's main unit; another unit is refused in plain words."""
    sync(
        wire,
        [
            op("stock_move", "mv-1", move("it-w", "opening", 25)),
            op(
                "job",
                "j-1",
                {
                    "customer_id": "c-1",
                    "customer_name": "Ramesh",
                    "phone": "9822200010",
                    "date": "2027-01-01",
                    "work_done": "x",
                    "lines": [],
                    "state": "WORK_DONE",
                    "events": [],
                },
            ),
        ],
    )
    refused = one(wire, "stock_move", "mv-2", move("it-w", "used", 1, unit="metre", job_id="j-1"))
    assert refused["status"] == "rejected" and "main unit" in refused["message"]
    assert one(wire, "stock_move", "mv-3", move("it-w", "used", 1, job_id="j-1"))["status"] == "applied"


# ---------- US-36: bills ----------
def test_ac_36_3_a_bill_takes_stock_from_the_unit_sold_and_cancel_returns_it(biller):
    """AC-36.3: a line for metres lowers the metres, a line for the coil lowers the coils; cancelling returns each."""
    owner = biller()["owner"]
    sync_ops(
        owner,
        {"kind": "unit", "id": "u-coil", "body": {"name": "Coil", "whole": True}},
        {
            "kind": "item",
            "id": "it-w",
            "body": item(
                name="Wire",
                code="W1",
                unit="u-coil",
                sale=92000,
                sells=[sold("metre", 1200, cut_from="u-coil", cut_gives=90)],
            ),
        },
        {"kind": "stock_move", "id": "mv-1", "body": move("it-w", "opening", 25)},
        {"kind": "stock_move", "id": "mv-2", "body": move("it-w", "opening", 90, unit="metre")},
    )
    lines = [
        line("Wire", qty=2, rate=92000, item_id="it-w", unit="Coil", unit_id="u-coil"),
        line("Wire", qty=5, rate=1200, item_id="it-w", unit="metre", unit_id="metre"),
    ]
    _, body = put_doc(owner, "d-1", save=True, lines=lines)
    got = stored(owner, "item", "it-w")
    assert got["qty"] == 23 and got["sells"][0]["qty"] == 85
    assert body["stock_taken"] == {"it-w": 2.0, "it-w|metre": 5.0}
    r = owner.post("/api/v1/documents/d-1/actions", json={"action": "cancel", "reason": "Wrong customer"})
    assert r.status_code == 200, r.text
    got = stored(owner, "item", "it-w")
    assert got["qty"] == 25 and got["sells"][0]["qty"] == 90


def test_ac_36_3_changing_a_saved_bill_moves_only_the_difference_in_the_right_unit(biller):
    """AC-36.3: 5 metres changed to 8 takes 3 more metres and leaves the coils alone."""
    owner = biller()["owner"]
    sync_ops(
        owner,
        {
            "kind": "item",
            "id": "it-w",
            "body": item(name="Wire", code="W1", unit="nos", sale=92000, sells=[sold("metre", 1200)]),
        },
        {"kind": "stock_move", "id": "mv-1", "body": move("it-w", "opening", 10)},
        {"kind": "stock_move", "id": "mv-2", "body": move("it-w", "opening", 100, unit="metre")},
    )
    put_doc(owner, "d-2", save=True, lines=[line("Wire", qty=5, rate=1200, item_id="it-w", unit_id="metre")])
    put_doc(owner, "d-2", lines=[line("Wire", qty=8, rate=1200, item_id="it-w", unit_id="metre")])
    got = stored(owner, "item", "it-w")
    assert got["sells"][0]["qty"] == 92 and got["qty"] == 10


def test_ac_36_3_bills_made_before_units_still_move_the_main_unit(biller):
    """AC-36.3: a line with no unit_id (as v0.9.0 wrote it) takes the item's main unit."""
    owner = biller()["owner"]
    sync_ops(
        owner,
        {"kind": "item", "id": "it-w", "body": item(name="Wire", code="W1", unit="metre", sale=1200)},
        {"kind": "stock_move", "id": "mv-1", "body": move("it-w", "opening", 10)},
    )
    _, body = put_doc(
        owner, "d-3", save=True, lines=[line("Wire", qty=2, rate=1200, item_id="it-w", unit="metre")]
    )
    assert stored(owner, "item", "it-w")["qty"] == 8 and body["stock_taken"] == {"it-w": 2.0}


# ---------- US-37: Cut ----------
def test_ac_37_1_a_cut_lowers_one_unit_and_raises_the_other_in_one_move(wire):
    """AC-37.1: cutting 1 coil into 90 metres: coils 25 to 24, metres 0 to 90, one move, the person and the date."""
    sync(wire, [op("stock_move", "mv-1", move("it-w", "opening", 25))])
    r = one(
        wire,
        "stock_move",
        "mv-c",
        {"item_id": "it-w", "kind": "cut", "unit": "u-coil", "to_unit": "metre", "count": 1, "gives": 90},
    )
    assert r["status"] == "applied", r
    got = state_of(wire, "item", "it-w")
    assert got["qty"] == 24 and got["sells"][0]["qty"] == 90
    cut = state_of(wire, "stock_move", "mv-c")
    assert cut["kind"] == "cut" and cut["unit"] == "u-coil" and cut["qty"] == -1 and cut["after"] == 24
    assert cut["to_unit"] == "metre" and cut["gave"] == 90 and cut["to_after"] == 90 and cut["who"]
    assert any("Cut: 1 Coil into 90 metre (Life Line Plus Red)" in x for x in log_lines(wire))


def test_ac_37_2_the_person_may_change_the_metres_a_coil_gives(wire):
    """AC-37.2: a coil of 88 metres is cut as 88, and the unit keeps its usual 90 for next time."""
    sync(wire, [op("stock_move", "mv-1", move("it-w", "opening", 5))])
    assert (
        one(
            wire,
            "stock_move",
            "mv-c",
            {"item_id": "it-w", "kind": "cut", "unit": "u-coil", "to_unit": "metre", "count": 1, "gives": 88},
        )["status"]
        == "applied"
    )
    got = state_of(wire, "item", "it-w")
    assert got["sells"][0]["qty"] == 88 and got["sells"][0]["cut_gives"] == 90


def test_ac_37_1_a_cut_is_refused_when_there_is_not_enough_or_the_numbers_are_wrong(wire):
    """AC-37.1: more than is in stock, a whole-number unit cut in parts, the same unit twice, or zero metres is refused."""
    sync(wire, [op("stock_move", "mv-1", move("it-w", "opening", 2))])

    def cut(**over):
        return one(
            wire,
            "stock_move",
            f"mv-{len(over)}{sum(map(len, map(str, over.values())))}",
            {
                "item_id": "it-w",
                "kind": "cut",
                "unit": "u-coil",
                "to_unit": "metre",
                "count": 1,
                "gives": 90,
                **over,
            },
        )

    short = cut(count=3)
    assert short["status"] == "rejected" and "Only 2 Coil in stock" in short["message"]
    part = cut(count=1.5)
    assert part["status"] == "rejected" and "Use a whole number for Coil" in part["message"]
    same = cut(to_unit="u-coil")
    assert same["status"] == "rejected" and "Pick the unit you are cutting" in same["message"]
    zero = cut(gives=0)
    assert zero["status"] == "rejected" and "above 0" in zero["message"]
    other = cut(to_unit="kg")
    assert other["status"] == "rejected" and "isn't sold in both" in other["message"]
    assert state_of(wire, "item", "it-w")["qty"] == 2  # nothing moved


def test_ac_37_3_a_cut_cannot_be_changed_and_is_for_people_who_manage_stock(wire, make_client):
    """AC-37.3: a saved cut is immutable (a mistake is fixed with a new move); parts-only staff cannot cut."""
    sync(wire, [op("stock_move", "mv-1", move("it-w", "opening", 5))])
    body = {"item_id": "it-w", "kind": "cut", "unit": "u-coil", "to_unit": "metre", "count": 1, "gives": 90}
    assert one(wire, "stock_move", "mv-c", body)["status"] == "applied"
    again = one(wire, "stock_move", "mv-c", {**body, "count": 2})
    assert again["status"] == "rejected" and "can't be changed" in again["message"]
    add_member(wire, COORD)
    assert (
        wire.put(
            "/api/v1/team/roles/coordinator/permissions",
            json={"permissions": {"manage_inventory": False, "use_parts": True}},
        ).status_code
        == 200
    )
    coord = make_client(COORD["phone"], COORD["pin"])
    denied = one(coord, "stock_move", "mv-d", body)
    assert denied["status"] == "rejected" and "doesn't include this" in denied["message"]


def test_ac_36_6_people_without_manage_inventory_see_no_cost_price_in_any_unit(wire, make_client):
    """AC-36.6: the cost prices of the other units stay with the people who manage inventory."""
    add_member(wire, COORD)
    assert (
        wire.put(
            "/api/v1/team/roles/coordinator/permissions",
            json={"permissions": {"manage_inventory": False, "view_inventory": True}},
        ).status_code
        == 200
    )
    coord = make_client(COORD["phone"], COORD["pin"])
    got = state_of(coord, "item", "it-w")
    assert (
        "cost" not in got and all("cost" not in s for s in got["sells"]) and got["sells"][0]["sale"] == 1200
    )


# ---------- US-36: the CSV file, one row per unit ----------
CSV = (
    "code,name,unit,sale_price,cost_price,opening_stock,cut_from,cut_gives\n"
    "WIR-RD,Life Line Plus Red,Coil,920,740,25,,\n"
    "WIR-RD,Life Line Plus Red,Metre,12,9,500,Coil,90\n"
    "WIR-RD,Life Line Plus Red,Box,4400,3600,2,,\n"
    "SW-1,Switch,nos,45,30,10,,\n"
)


def test_ac_36_5_rows_with_the_same_code_are_the_units_of_one_item(firm):
    """AC-36.5: the check counts items and unit rows, and the import makes one item with its units and stock."""
    owner = firm["owner"]
    body = import_csv(owner, CSV)
    assert body["counts"] == {"new": 2, "update": 0, "same": 0, "problem": 0, "unit": 2}
    assert [r["status"] for r in body["rows"]] == ["new", "unit", "unit", "new"]
    assert body["adds"]["units"] == ["Coil", "Box"]
    done = import_csv(owner, CSV, commit=True)
    assert done["imported"] == {"added": 2, "updated": 0, "skipped": 0}
    items = {c["body"]["code"]: c["body"] for c in sync(owner)["changes"]["item"]}
    wire = items["WIR-RD"]
    coil = next(c["id"] for c in sync(owner)["changes"]["unit"] if c["body"]["name"] == "Coil")
    assert wire["unit"] == coil and wire["qty"] == 25 and wire["sale"] == 92000
    metre, box = wire["sells"]
    assert (
        metre["unit"] == "metre"
        and metre["qty"] == 500
        and metre["cut_from"] == coil
        and metre["cut_gives"] == 90
    )
    assert box["qty"] == 2 and box["sale"] == 440000 and items["SW-1"]["sells"] == []
    again = import_csv(owner, CSV, commit=True)
    assert (
        again["counts"]["same"] == 2 and again["imported"]["added"] == 0
    )  # the same file twice changes nothing
    assert len(sync(owner, since=0)["changes"]["stock_move"]) == 4  # an opening move per unit, once


def test_ac_36_5_a_unit_row_with_a_cut_from_nowhere_or_a_repeat_is_a_problem(firm):
    """AC-36.5: a cut that starts from a unit the item doesn't have, or the same unit twice, is that row's problem."""
    text = (
        "code,name,unit,sale_price,cut_from,cut_gives\n"
        "A1,Wire,Coil,920,,\n"
        "A1,Wire,Metre,12,Drum,90\n"
        "A1,Wire,Coil,920,,\n"
    )
    body = import_csv(firm["owner"], text)
    assert [r["status"] for r in body["rows"]] == ["new", "problem", "problem"]
    assert "cut_from must be another unit of this same item" in body["rows"][1]["problems"][0]
    assert "is also in row 2" in body["rows"][2]["problems"][0]


def test_ac_36_5_an_import_that_updates_an_item_keeps_its_service_and_mrp_flags(firm):
    """AC-36.5: an update from a file must not turn a service item into a stocked one."""
    owner = firm["owner"]
    sync(
        owner,
        [
            op(
                "item",
                "it-s",
                item(name="Gas refill", code="GAS", unit="nos", service=True, price_includes_gst=True),
            )
        ],
    )
    import_csv(owner, "code,name,unit,sale_price\nGAS,Gas refill,nos,1600\n", commit=True)
    got = state_of(owner, "item", "it-s")
    assert got["sale"] == 160000 and got["service"] is True and got["price_includes_gst"] is True
