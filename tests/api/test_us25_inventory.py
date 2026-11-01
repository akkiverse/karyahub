"""US-25: inventory per business (CR-0011): items, stock moves, parts used on a job, CSV import, permissions."""

import uuid

import pytest
from conftest import DEMO_OWNER

TECH = {
    "name": "Ravi Kale",
    "phone": "9822200002",
    "role": "technician",
    "pin": "6402",
    "must_change_pin": False,
}
COORD = {
    "name": "Priya Nair",
    "phone": "9822200003",
    "role": "coordinator",
    "pin": "6403",
    "must_change_pin": False,
}


def op(kind, item_id, body, op_id=None):
    return {"op_id": op_id or f"op-{uuid.uuid4().hex[:12]}", "kind": kind, "id": item_id, "body": body}


def sync(client, ops=(), since=0):
    r = client.post("/api/v1/sync", json={"since": since, "ops": list(ops)})
    assert r.status_code == 200, r.text
    return r.json()


def item(name="Capacitor 45 µF", code="CAP-45", **over):
    return {
        "name": name,
        "code": code,
        "unit": "nos",
        "sale": 45000,
        "cost": 21000,
        "hsn": "8532",
        "gst": 18,
        "low": 5,
        "stopped": False,
        **over,
    }


def move(item_id, kind, qty=None, **over):
    body = {"item_id": item_id, "kind": kind, **over}
    if qty is not None:
        body["qty"] = qty
    return body


def job(**over):
    return {
        "customer_id": "c-1",
        "customer_name": "Ramesh Sharma",
        "phone": "9822200010",
        "date": "2027-01-01",
        "work_done": "Gas top-up",
        "lines": [],
        "state": "WORK_DONE",
        "events": [],
        **over,
    }


def one(client, kind, item_id, body):
    """Send one change and return its result."""
    return sync(client, [op(kind, item_id, body)])["results"][0]


def state_of(client, kind, item_id):
    for c in sync(client)["changes"][kind]:
        if c["id"] == item_id:
            return c["body"]
    return None


def stock(client, item_id):
    return state_of(client, "item", item_id)["qty"]


def add_member(owner, member):
    r = owner.post("/api/v1/team", json=member)
    assert r.status_code == 201, r.text
    return r.json()["member"]["id"]


def log_lines(owner):
    return [e["text"] for e in owner.get("/api/v1/team/audit").json()["entries"]]


@pytest.fixture
def firm(make_business):
    return make_business("Shree Cool AC", "9811100001")


@pytest.fixture
def two_firms(make_business):
    return make_business("Shree Cool AC", "9811100001"), make_business("Blue Star Cooling", "9811100002")


@pytest.fixture
def stocked(firm):
    """An owner with one item holding 10 nos, and one open job."""
    owner = firm["owner"]
    r = sync(
        owner,
        [
            op("item", "it-cap", item()),
            op("stock_move", "mv-open", move("it-cap", "opening", 10)),
            op("job", "j-1", job()),
        ],
    )
    assert [x["status"] for x in r["results"]] == ["applied"] * 3
    return owner


# ---------- items ----------
def test_ac_25_1_an_owner_sees_the_items_and_their_quantity(stocked):
    """AC-25.1: items of the business reach the phone with the quantity the server worked out."""
    body = state_of(stocked, "item", "it-cap")
    assert body["name"] == "Capacitor 45 µF" and body["qty"] == 10 and body["unit"] == "nos"
    assert sync(stocked)["readable"].count("item") == 1 and "stock_move" in sync(stocked)["readable"]


def test_ac_25_4_an_item_is_checked_and_its_code_is_unique_in_the_business(firm):
    """AC-25.4: each wrong field is refused in plain words; a used code names the item that has it."""
    owner = firm["owner"]
    assert one(owner, "item", "it-1", item())["status"] == "applied"
    bad = {
        "name": item(name="X"),
        "code": item(code="no spaces allowed"),
        "unit": item(unit="bags"),
        "hsn": item(hsn="853"),
        "gst": item(gst=12),
        "sale": item(sale=None),
        "price": item(sale=-5),
    }
    said = {k: one(owner, "item", f"it-{k}", body) for k, body in bad.items()}
    assert {r["status"] for r in said.values()} == {"rejected"}
    assert "name of 2 to 80" in said["name"]["message"] and "HSN code has 4, 6 or 8" in said["hsn"]["message"]
    assert "GST rate" in said["gst"]["message"] and "sale price" in said["sale"]["message"]
    clash = one(owner, "item", "it-2", item(name="Another make", code="cap-45"))  # capitals don't matter
    assert clash["status"] == "rejected"
    assert clash["message"] == "Code cap-45 is already used by Capacitor 45 µF."
    assert state_of(owner, "item", "it-2") is None
    assert one(owner, "item", "it-3", item(name="No code", code=""))["status"] == "applied"
    assert one(owner, "item", "it-4", item(name="Also no code", code=""))["status"] == "applied"


def test_ac_25_4_a_code_can_be_freed_by_renaming_and_taken_by_another_item(firm):
    """AC-25.4: changing an item's code frees the old one; two phones can't both take the same code."""
    owner = firm["owner"]
    sync(owner, [op("item", "it-1", item())])
    assert one(owner, "item", "it-1", item(code="CAP-45A"))["status"] == "applied"
    assert one(owner, "item", "it-2", item(name="Second", code="CAP-45"))["status"] == "applied"
    again = one(owner, "item", "it-1", item(code="cap-45"))
    assert again["status"] == "rejected" and "already used by Second" in again["message"]
    assert state_of(owner, "item", "it-1")["code"] == "CAP-45A"


def test_ac_25_4_editing_an_item_never_changes_the_quantity(stocked):
    """AC-25.4: the quantity belongs to the server; a phone's copy of it is ignored."""
    forged = item(sale=50000)
    forged["qty"] = 9999
    assert one(stocked, "item", "it-cap", forged)["status"] == "applied"
    body = state_of(stocked, "item", "it-cap")
    assert body["qty"] == 10 and body["sale"] == 50000
    fresh = item(name="Brand new", code="NEW-1")
    fresh["qty"] = 500
    sync(stocked, [op("item", "it-new", fresh)])
    assert state_of(stocked, "item", "it-new")["qty"] == 0


def test_ac_25_5_an_item_is_stopped_not_deleted(stocked):
    """AC-25.5: a stopped item keeps its history, takes no new stock or parts, and can be used again."""
    assert one(stocked, "item", "it-cap", item(stopped=True))["status"] == "applied"
    refused = one(stocked, "stock_move", "mv-2", move("it-cap", "in", 5))
    assert refused["status"] == "rejected" and "not in use" in refused["message"]
    used = one(stocked, "stock_move", "mv-3", move("it-cap", "used", 1, job_id="j-1"))
    assert used["status"] == "rejected"
    assert state_of(stocked, "stock_move", "mv-open")["qty"] == 10  # the history is still there
    assert one(stocked, "item", "it-cap", item(stopped=False))["status"] == "applied"
    assert one(stocked, "stock_move", "mv-4", move("it-cap", "in", 5))["status"] == "applied"


# ---------- moves ----------
def test_ac_25_7_stock_in_raises_the_quantity(stocked):
    """AC-25.7: stock in adds to the quantity; the move records who, the supplier and the bill."""
    r = one(
        stocked,
        "stock_move",
        "mv-in",
        move("it-cap", "in", 5, supplier="Sai Refrigeration", bill="4471", cost=20000),
    )
    assert r["status"] == "applied" and stock(stocked, "it-cap") == 15
    body = state_of(stocked, "stock_move", "mv-in")
    assert body["qty"] == 5 and body["after"] == 15 and body["who"].startswith("Owner of")
    assert body["supplier"] == "Sai Refrigeration" and body["cost"] == 20000
    assert (
        one(stocked, "stock_move", "mv-past", move("it-cap", "in", 1, date="2026-10-30"))["status"]
        == "applied"
    )
    assert state_of(stocked, "stock_move", "mv-past")["date"] == "2026-10-30"
    bad = [
        one(stocked, "stock_move", "mv-b1", move("it-cap", "in", 0)),
        one(stocked, "stock_move", "mv-b2", move("it-cap", "in", 1.5)),  # nos are whole numbers
        one(stocked, "stock_move", "mv-b3", move("it-cap", "in", 1, date="2999-01-01")),
        one(stocked, "stock_move", "mv-b4", move("it-cap", "in", 1, date="01-02-2027")),
    ]
    assert [x["status"] for x in bad] == ["rejected"] * 4
    assert "whole number for nos" in bad[1]["message"] and "can't be in the future" in bad[2]["message"]
    assert stock(stocked, "it-cap") == 16


def test_ac_25_8_stock_out_is_refused_when_it_is_more_than_is_in_stock(stocked):
    """AC-25.8: a manual stock out can't take the quantity below zero; the message says what is in stock."""
    ok = one(stocked, "stock_move", "mv-out", move("it-cap", "out", 4, note="Damaged or lost: burnt"))
    assert ok["status"] == "applied" and stock(stocked, "it-cap") == 6
    assert state_of(stocked, "stock_move", "mv-out")["qty"] == -4  # stored with its sign
    over = one(stocked, "stock_move", "mv-over", move("it-cap", "out", 7))
    assert over["status"] == "rejected"
    assert over["message"] == "Only 6 nos in stock. If that's wrong, count the stock first."
    assert stock(stocked, "it-cap") == 6


def test_ac_25_9_a_count_records_the_difference_worked_out_by_the_server(stocked):
    """AC-25.9: the phone says what is on the shelf; the server records the correction against its own number."""
    sync(stocked, [op("stock_move", "mv-a", move("it-cap", "out", 2, note="Used without a job: shop"))])
    r = one(stocked, "stock_move", "mv-count", move("it-cap", "count", counted=7, note="Monthly count"))
    assert r["status"] == "applied" and stock(stocked, "it-cap") == 7
    body = state_of(stocked, "stock_move", "mv-count")
    assert body["qty"] == -1 and body["after"] == 7  # the server had 8, not the 10 the phone first saw
    same = one(stocked, "stock_move", "mv-match", move("it-cap", "count", counted=7))
    assert same["status"] == "applied" and state_of(stocked, "stock_move", "mv-match")["qty"] == 0
    assert one(stocked, "stock_move", "mv-nan", move("it-cap", "count", counted=-3))["status"] == "rejected"
    assert one(stocked, "stock_move", "mv-half", move("it-cap", "count", counted=2.5))["status"] == "rejected"


def test_ac_25_10_a_stock_move_cannot_be_changed(stocked):
    """AC-25.10: once saved a move is final; a mistake is fixed with a new move."""
    again = one(stocked, "stock_move", "mv-open", move("it-cap", "opening", 99))
    assert again["status"] == "rejected"
    assert again["message"] == "Stock moves can't be changed. Add a correction instead."
    assert state_of(stocked, "stock_move", "mv-open")["qty"] == 10 and stock(stocked, "it-cap") == 10


# ---------- parts used on a job ----------
def test_ac_25_11_parts_taken_for_a_job_leave_stock_and_show_on_the_job(stocked):
    """AC-25.11: the quantity falls, the job lists the part and its history says who used it."""
    r = one(stocked, "stock_move", "mv-u1", move("it-cap", "used", 2, job_id="j-1"))
    assert r["status"] == "applied" and stock(stocked, "it-cap") == 8
    body = state_of(stocked, "job", "j-1")
    assert body["parts_used"] == {"it-cap": 2}
    last = body["events"][-1]
    assert last["action"] == "parts_used" and "used 2 nos Capacitor 45 µF" in last["detail"]
    back = one(stocked, "stock_move", "mv-r1", move("it-cap", "returned", 1, job_id="j-1"))
    assert back["status"] == "applied" and stock(stocked, "it-cap") == 9
    body = state_of(stocked, "job", "j-1")
    assert body["parts_used"] == {"it-cap": 1} and "put back 1 nos" in body["events"][-1]["detail"]
    too_many = one(stocked, "stock_move", "mv-r2", move("it-cap", "returned", 5, job_id="j-1"))
    assert too_many["status"] == "rejected" and "Only 1 nos of this part was taken" in too_many["message"]
    assert stock(stocked, "it-cap") == 9


def test_ac_25_11_using_more_than_is_in_stock_is_allowed_and_shows_as_short(stocked):
    """AC-25.11: a job can use what the records say is not there; the item then shows as short."""
    assert one(stocked, "stock_move", "mv-u", move("it-cap", "used", 12, job_id="j-1"))["status"] == "applied"
    assert stock(stocked, "it-cap") == -2


def test_ac_25_11_a_closed_job_or_an_unknown_job_takes_no_parts(stocked):
    """AC-25.11: a closed job's parts can't change; a job the server doesn't have is refused."""
    verify = {"state": "WORK_DONE", "action": "supervisor_verify", "client_op_id": "op-ver-0001"}
    verify["payload"] = {"reason": "Customer unreachable"}
    assert stocked.post("/api/v1/jobs/j-1/transitions", json=verify).status_code == 200
    close = {"state": "VERIFIED", "action": "close", "client_op_id": "op-close-0001", "payload": {}}
    assert stocked.post("/api/v1/jobs/j-1/transitions", json=close).json()["state"] == "CLOSED"
    closed = one(stocked, "stock_move", "mv-late", move("it-cap", "used", 1, job_id="j-1"))
    assert closed["status"] == "rejected"
    assert closed["message"] == "This job is closed, so its parts can't change."
    unknown = one(stocked, "stock_move", "mv-none", move("it-cap", "used", 1, job_id="j-nope"))
    assert unknown["status"] == "rejected" and "isn't on the server" in unknown["message"]
    assert one(stocked, "stock_move", "mv-nojob", move("it-cap", "used", 1))["status"] == "rejected"
    assert stock(stocked, "it-cap") == 10


def test_ac_25_14_a_move_sent_twice_is_applied_once(stocked):
    """AC-25.14: a lost answer and a retry (the same operation id) change the quantity once."""
    batch = [op("stock_move", "mv-twice", move("it-cap", "used", 3, job_id="j-1"), "op-twice-1")]
    assert sync(stocked, batch)["results"][0]["status"] == "applied"
    assert sync(stocked, batch)["results"][0]["status"] == "duplicate"
    assert stock(stocked, "it-cap") == 7 and state_of(stocked, "job", "j-1")["parts_used"] == {"it-cap": 3}


def test_ac_25_14_two_phones_using_the_last_unit_are_both_counted(firm, make_client):
    """AC-25.14: both uses count; the item shows as short by one instead of one phone's work being lost."""
    owner = firm["owner"]
    sync(
        owner,
        [
            op("item", "it-stab", item(name="Stabiliser 4 kVA", code="STB")),
            op("stock_move", "mv-o", move("it-stab", "opening", 1)),
            op("job", "j-a", job()),
            op("job", "j-b", job(customer_name="Imran Khan")),
        ],
    )
    add_member(owner, COORD)
    other = make_client(COORD["phone"], COORD["pin"])
    first = sync(owner, [op("stock_move", "mv-a", move("it-stab", "used", 1, job_id="j-a"))])
    second = sync(other, [op("stock_move", "mv-b", move("it-stab", "used", 1, job_id="j-b"))])
    assert first["results"][0]["status"] == second["results"][0]["status"] == "applied"
    assert stock(owner, "it-stab") == -1
    assert state_of(owner, "job", "j-a")["parts_used"] == state_of(owner, "job", "j-b")["parts_used"]


def test_ac_25_15_the_server_owns_the_quantity_and_the_jobs_parts(stocked):
    """AC-25.15: a phone can't write the quantity, a job's list of parts or its history through the job."""
    sync(stocked, [op("stock_move", "mv-u", move("it-cap", "used", 2, job_id="j-1"))])
    stale = job(parts_used={"it-cap": 99, "it-ghost": 5}, events=[])
    assert one(stocked, "job", "j-1", stale)["status"] == "applied"
    body = state_of(stocked, "job", "j-1")
    assert body["parts_used"] == {"it-cap": 2} and body["events"][-1]["action"] == "parts_used"
    fresh = one(stocked, "job", "j-new", job(parts_used={"it-cap": 3}))
    assert fresh["status"] == "applied" and state_of(stocked, "job", "j-new")["parts_used"] == {}


def test_ac_25_15_a_move_for_something_that_is_not_there_is_refused(stocked):
    """AC-25.15: an unknown item, an unknown kind and a move that is not an object are refused, nothing changes."""
    r = sync(
        stocked,
        [
            op("stock_move", "mv-1", move("it-nope", "in", 1)),
            op("stock_move", "mv-2", move("it-cap", "teleport", 1)),
            op("stock_move", "mv-3", "in 5 please"),
        ],
    )
    assert [x["status"] for x in r["results"]] == ["rejected"] * 3
    assert r["results"][0]["message"] == "That item isn't in your inventory."
    assert stock(stocked, "it-cap") == 10


# ---------- the wall ----------
def test_ac_25_16_one_business_cannot_read_or_use_anothers_inventory(two_firms):
    """AC-25.16: items, moves, jobs and codes of one business are invisible and unusable from another."""
    a, b = two_firms
    sync(
        a["owner"],
        [
            op("item", "it-cap", item()),
            op("stock_move", "mv-o", move("it-cap", "opening", 10)),
            op("job", "j-a", job()),
        ],
    )
    got = sync(b["owner"])
    assert got["changes"]["item"] == [] and got["changes"]["stock_move"] == []
    spy = sync(
        b["owner"],
        [
            op("stock_move", "mv-spy", move("it-cap", "in", 50)),
            op("stock_move", "mv-job", move("it-cap", "used", 1, job_id="j-a")),
        ],
    )
    assert [x["status"] for x in spy["results"]] == ["rejected", "rejected"]
    assert stock(a["owner"], "it-cap") == 10 and state_of(a["owner"], "job", "j-a")["parts_used"] == {}
    # The same id and the same code in B make B's own, separate item.
    assert one(b["owner"], "item", "it-cap", item(name="B's capacitor"))["status"] == "applied"
    assert state_of(a["owner"], "item", "it-cap")["name"] == "Capacitor 45 µF"
    assert state_of(b["owner"], "item", "it-cap")["name"] == "B's capacitor"
    assert state_of(b["owner"], "item", "it-cap")["qty"] == 0
    csv_b = "code,name,unit,sale_price\nCAP-45,Mine,nos,10\n"
    r = b["owner"].post("/api/v1/inventory/import", json={"text": csv_b, "check": False})
    assert r.status_code == 200 and r.json()["counts"]["update"] == 1  # B's own CAP-45, not A's


# ---------- permissions ----------
def test_ac_25_17_technicians_have_no_inventory_access_unless_the_owner_gives_it(firm, make_client):
    """AC-25.17: by default a technician reads and changes no inventory; the owner can allow one person."""
    owner = firm["owner"]
    tech_id = add_member(owner, TECH)
    sync(
        owner,
        [
            op("item", "it-cap", item()),
            op("stock_move", "mv-o", move("it-cap", "opening", 10)),
            op("job", "j-1", job()),
        ],
    )
    tech = make_client(TECH["phone"], TECH["pin"])
    nothing = sync(tech)
    assert "item" not in nothing["readable"] and "stock_move" not in nothing["readable"]
    assert nothing["changes"]["item"] == []
    for kind, body in (("item", item(name="Sneaky")), ("stock_move", move("it-cap", "in", 5))):
        r = one(tech, kind, f"x-{kind}", body)
        assert r["status"] == "rejected" and "access doesn't include" in r["message"]
    roles = tech.get("/api/v1/access/roles").json()
    wanted = {"view_inventory", "manage_inventory", "use_parts"}
    for perm in roles["permissions"]:
        if perm["id"] in wanted:
            assert perm["roles"] == ["owner", "coordinator"]
    allow = {"overrides": {"use_parts": "allow"}}
    assert owner.put(f"/api/v1/team/{tech_id}/permissions", json=allow).status_code == 200
    taker = sync(tech, [op("stock_move", "mv-t", move("it-cap", "used", 1, job_id="j-1"))])
    assert taker["results"][0]["status"] == "applied" and "item" in taker["readable"]
    assert "stock_move" not in taker["readable"]  # taking parts is not the same as seeing the history
    seen = sync(tech)["changes"]["item"][0]["body"]
    assert seen["qty"] == 9 and "cost" not in seen  # cost prices stay with the people who manage inventory
    assert sync(tech)["changes"]["job"][0]["body"]["parts_used"] == {"it-cap": 1}
    stock_in = one(tech, "stock_move", "mv-t2", move("it-cap", "in", 5))
    assert stock_in["status"] == "rejected"  # use_parts does not include adding stock
    edit = one(tech, "item", "it-cap", item(name="Renamed by tech"))
    assert edit["status"] == "rejected"


def test_ac_25_17_cost_prices_reach_only_people_who_manage_inventory(firm, make_client):
    """AC-25.17: without manage_inventory the server sends no cost prices, in items or in stock-in moves."""
    owner = firm["owner"]
    add_member(owner, COORD)
    sync(owner, [op("item", "it-cap", item()), op("stock_move", "mv-i", move("it-cap", "in", 5, cost=20000))])
    coord = make_client(COORD["phone"], COORD["pin"])
    assert state_of(coord, "item", "it-cap")["cost"] == 21000
    assert state_of(coord, "stock_move", "mv-i")["cost"] == 20000
    off = {"permissions": {"manage_inventory": False}}
    assert owner.put("/api/v1/team/roles/coordinator/permissions", json=off).status_code == 200
    assert "cost" not in state_of(coord, "item", "it-cap")
    assert "cost" not in state_of(coord, "stock_move", "mv-i")
    assert state_of(coord, "item", "it-cap")["sale"] == 45000  # the sale price is for quotes: still there


def test_ac_25_17_the_platform_admin_and_the_demo_business_have_no_inventory(platform, make_client):
    """AC-25.17 and AC-25.19: the platform admin sees no business data; the demo business never syncs."""
    assert (
        platform.post("/api/v1/inventory/import", json={"text": "name\nX", "check": True}).status_code == 403
    )
    demo = make_client(*DEMO_OWNER)
    r = demo.post("/api/v1/sync", json={"since": 0, "ops": [op("item", "it-1", item())]})
    assert r.status_code == 403 and r.json()["error"]["code"] == "demo_local"
    r = demo.post("/api/v1/inventory/import", json={"text": "name,unit,sale_price\nX,nos,1", "check": False})
    assert r.status_code == 403 and r.json()["error"]["code"] == "demo_local"


def test_ac_25_17_importing_needs_manage_inventory(firm, make_client):
    """AC-25.17: a person who can't manage inventory can't import."""
    add_member(firm["owner"], TECH)
    tech = make_client(TECH["phone"], TECH["pin"])
    r = tech.post("/api/v1/inventory/import", json={"text": "name,unit,sale_price\nX,nos,1", "check": True})
    assert r.status_code == 403


# ---------- the activity log ----------
def test_ac_25_18_inventory_changes_go_in_the_activity_log(stocked):
    """AC-25.18: items, stock in, stock out, counts and imports are logged; parts used go in the job's history."""
    sync(
        stocked,
        [
            op("stock_move", "mv-in", move("it-cap", "in", 5, supplier="Sai Refrigeration")),
            op("stock_move", "mv-out", move("it-cap", "out", 1, note="Damaged or lost: dropped")),
            op("stock_move", "mv-count", move("it-cap", "count", counted=12)),
            op("stock_move", "mv-use", move("it-cap", "used", 1, job_id="j-1")),
            op("item", "it-cap", item(sale=47000)),
            op("item", "it-cap", item(sale=47000, stopped=True), "op-stop"),
        ],
    )
    lines = " | ".join(log_lines(stocked))
    for text in (
        "Added inventory item Capacitor 45 µF",
        "Opening stock: 10 nos Capacitor 45 µF",
        "Stock in: 5 nos Capacitor 45 µF from Sai Refrigeration",
        "Stock out: 1 nos Capacitor 45 µF (Damaged or lost: dropped)",
        "Count: Capacitor 45 µF is now 12 nos",
        "Changed inventory item Capacitor 45 µF",
        "Stopped using inventory item Capacitor 45 µF",
    ):
        assert text in lines
    assert "used 1 nos" not in lines  # a part used is in the job's history, not the log
    assert "used 1 nos Capacitor 45 µF" in state_of(stocked, "job", "j-1")["events"][-1]["detail"]


# ---------- CSV import ----------
CSV_OK = """code,name,unit,sale_price,cost_price,hsn,gst_rate,low_stock_at,opening_stock
CAP-35,Capacitor 35 µF,nos,380,170,8532,18,5,10
GAS-R410,R410A refrigerant gas,kg,1250,880,2903,18,3,6.5
,Wall bracket set,set,650,420,7326,,4,8
"""
CSV_BAD = (
    CSV_OK
    + """CU-12,Copper pipe,box,340,240,7411,18,10,30
THM-01,Thermistor,nos,12O0,90,9025,18,4,10
BLW-01,Blower wheel,nos,900,520,8414,12,2,3
CAP-35,Capacitor again,nos,400,180,8532,18,5,6
,,nos,100,,,18,,
SLV-01,Sleeve,m,35,18,ABC1,18,20,50
REM-LG,Remote,nos,450,260,8543,18,3,2.5
FLT-01,Filter,pcs,100,,,,,5
"""
)


def check(client, text, name="stock.csv", commit=False):
    r = client.post("/api/v1/inventory/import", json={"text": text, "name": name, "check": not commit})
    return r


def test_ac_25_6_the_check_lists_every_row_and_saves_nothing(firm):
    """AC-25.6: Check reports new, update and problem rows with row numbers and reasons; nothing is saved."""
    owner = firm["owner"]
    r = check(owner, CSV_BAD)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["checked"] is True and body["counts"] == {"new": 4, "update": 0, "same": 0, "problem": 7}
    rows = {x["row"]: x for x in body["rows"]}
    assert rows[2]["status"] == "new" and rows[4]["status"] == "new"
    reasons = {n: " ".join(x["problems"]) for n, x in rows.items() if x["problems"]}
    assert 'unit "box"' in reasons[5] and 'sale price "12O0"' in reasons[6]
    assert "GST rate 12 %" in reasons[7] and "also in row 2" in reasons[8] and "name is empty" in reasons[9]
    assert 'HSN "ABC1"' in reasons[10] and "opening stock 2.5: use a whole number for nos" in reasons[11]
    assert rows[12]["status"] == "new" and 'unit "pcs" read as nos' in rows[12]["notes"][0]
    assert sync(owner)["changes"]["item"] == []  # a check saves nothing


def test_ac_25_6_import_saves_the_good_rows_with_their_opening_stock(firm):
    """AC-25.6: Import adds the good rows and their opening stock, skips the rest, and says what it did."""
    owner = firm["owner"]
    r = check(owner, CSV_BAD, commit=True)
    assert r.status_code == 200, r.text
    assert r.json()["imported"] == {"added": 4, "updated": 0, "skipped": 7}
    got = {i["body"]["name"]: i["body"] for i in sync(owner)["changes"]["item"]}
    assert set(got) == {"Capacitor 35 µF", "R410A refrigerant gas", "Wall bracket set", "Filter"}
    assert got["Capacitor 35 µF"]["qty"] == 10 and got["R410A refrigerant gas"]["qty"] == 6.5
    assert got["Wall bracket set"]["code"] == "" and got["Wall bracket set"]["gst"] == 18
    assert got["Capacitor 35 µF"]["sale"] == 38000 and got["Capacitor 35 µF"]["cost"] == 17000
    assert len(sync(owner)["changes"]["stock_move"]) == 4  # an opening move for each
    assert any(
        "Imported inventory from stock.csv: 4 new, 0 updated, 7 skipped" in x for x in log_lines(owner)
    )


def test_ac_25_6_importing_the_same_file_twice_changes_nothing(firm):
    """AC-25.6: a second import finds every row already there and changes no quantity."""
    owner = firm["owner"]
    check(owner, CSV_OK, commit=True)
    before = sync(owner)
    again = check(owner, CSV_OK, commit=True).json()
    assert again["counts"] == {"new": 0, "update": 0, "same": 3, "problem": 0}
    after = sync(owner, since=before["cursor"])
    assert after["changes"]["item"] == [] and after["changes"]["stock_move"] == []


def test_ac_25_6_a_row_for_an_existing_item_updates_it_and_ignores_opening_stock(stocked):
    """AC-25.6: an existing code (or name) is updated; its quantity stays; the check says opening stock is ignored."""
    text = "code,name,unit,sale_price,opening_stock\nCAP-45,Capacitor 45 µF,nos,500,99\nCAP-45,Capacitor 45 µF,nos,500,1\n"
    body = check(stocked, text).json()
    assert body["rows"][0]["status"] == "update"
    assert "opening stock ignored for an existing item" in body["rows"][0]["notes"][0]
    assert body["rows"][1]["status"] == "problem"  # the same name as row 2: it is in the file twice
    saved = check(stocked, text.split("\n")[0] + "\n" + text.split("\n")[1] + "\n", commit=True).json()
    assert saved["imported"]["updated"] == 1
    item_now = state_of(stocked, "item", "it-cap")
    assert item_now["sale"] == 50000 and item_now["qty"] == 10 and item_now["cost"] is None
    assert len(sync(stocked)["changes"]["stock_move"]) == 1  # still just the opening move


def test_ac_25_6_a_bad_file_is_refused_as_a_whole(firm):
    """AC-25.6: an empty file, no name column, too many rows or too big a file is refused with a reason."""
    owner = firm["owner"]
    cases = {
        "": "file is empty",
        "code,unit\nA,nos\n": 'no "name" column',
        "name,unit,sale_price\n": "only the column names",
        "name,unit,sale_price\n" + "x1,nos,1\n" * 501: "up to 500",
        "name\n" + "y" * (1024 * 1024 + 1): "bigger than 1 MB",
    }
    for text, why in cases.items():
        r = check(owner, text)
        assert r.status_code == 422 and why in r.json()["error"]["message"], (why, r.text[:200])
    assert sync(owner)["changes"]["item"] == []


def test_ac_25_6_the_import_of_a_stopped_item_leaves_it_stopped(stocked):
    """AC-25.6: an import updates the details of a stopped item without bringing it back."""
    sync(stocked, [op("item", "it-cap", item(stopped=True), "op-stop")])
    check(stocked, "code,name,unit,sale_price\nCAP-45,Capacitor 45 µF,nos,600\n", commit=True)
    body = state_of(stocked, "item", "it-cap")
    assert body["sale"] == 60000 and body["stopped"] is True and body["qty"] == 10


# ---------- the data kept by earlier versions ----------
def test_ac_25_19_jobs_from_before_inventory_load_and_take_parts(firm):
    """AC-25.19: a job saved by v0.6.0 has no list of parts; it works, and the first part creates the list."""
    owner = firm["owner"]
    sync(owner, [op("job", "j-old", job(parts="R32 gas 1 kg"))])
    old = state_of(owner, "job", "j-old")
    assert old["parts"] == "R32 gas 1 kg" and old["parts_used"] == {}
    sync(owner, [op("item", "it-1", item()), op("stock_move", "mv-o", move("it-1", "opening", 3))])
    assert one(owner, "stock_move", "mv-u", move("it-1", "used", 1, job_id="j-old"))["status"] == "applied"
    assert state_of(owner, "job", "j-old")["parts_used"] == {"it-1": 1}
