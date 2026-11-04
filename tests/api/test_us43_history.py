"""CR-0016: History. Who did what, with their name, for those allowed to see it."""

import pytest

from tests.api.conftest import sign_in
from tests.api.test_us25_inventory import add_member, item, job, move, one, state_of


def history(client, **params):
    r = client.get("/api/v1/history", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def lines(client, **params):
    return [(e["who"], e["text"]) for e in history(client, **params)["entries"]]


@pytest.fixture
def firm(make_business):
    return make_business("Shree Cool AC", "9811100001")


def test_ac_43_1_item_stock_and_bill_changes_are_logged_with_the_persons_name(firm):
    owner = firm["owner"]
    who = "Owner of Shree Cool AC"
    one(owner, "item", "it-1", item())
    one(owner, "stock_move", "mv-1", move("it-1", "in", qty=3, date="2026-01-05"))
    one(owner, "stock_move", "mv-2", move("it-1", "out", qty=1, reason="other", note="Taken"))
    bill = {
        "id": "d-1",
        "doc_version": 2,
        "type": "invoice",
        "status": "draft",
        "save": True,
        "date": "2026-11-04",
        "customer": {"name": "Walk-in customer"},
        "lines": [
            {
                "item_id": "it-1",
                "description": "Capacitor",
                "qty": 1,
                "unit": "nos",
                "rate": 35000,
                "gst_rate": "18",
            }
        ],
    }
    saved = one(owner, "document", "d-1", bill)
    assert saved["status"] == "applied", saved
    got = lines(owner, group="stock")
    assert (who, "Added inventory item Capacitor 45 µF") in got
    assert any(w == who and t.startswith("Stock in: 3") for w, t in got)
    assert any(w == who and t.startswith("Stock out: 1") for w, t in got)
    assert any(w == who and t.startswith("Sold on bill") and "Capacitor" in t for w, t in got)
    assert any(w == who and "bill" in t.lower() for w, t in lines(owner, group="bills"))


def test_ac_43_2_an_items_own_history_says_what_changed_and_who_changed_it(firm):
    owner = firm["owner"]
    one(owner, "item", "it-1", item())
    one(owner, "item", "it-1", item(sale=40000, low=2, cost=99900))
    body = state_of(owner, "item", "it-1")
    assert [h["what"].split(":")[0] for h in body["history"]] == ["Added", "Changed"]
    last = body["history"][-1]
    assert last["who"] == "Owner of Shree Cool AC" and last["at"]
    assert "sale price" in last["what"] and "₹400" in last["what"] and "low-stock level" in last["what"]
    assert "cost price" in last["what"] and "999" not in last["what"]  # the figure itself stays out
    assert any("sale price" in t for _, t in lines(owner, group="stock"))
    one(owner, "item", "it-1", item(sale=40000, low=2, cost=99900, stopped=True))
    assert state_of(owner, "item", "it-1")["history"][-1]["what"] == "Stopped using"


def test_ac_43_2_a_phone_cannot_write_or_wipe_an_items_history(firm):
    owner = firm["owner"]
    one(owner, "item", "it-1", item())
    faked = item(sale=40000)
    faked["history"] = [{"at": "2020-01-01T00:00:00", "who": "Someone else", "what": "Nothing happened"}]
    one(owner, "item", "it-1", faked)
    history_of = state_of(owner, "item", "it-1")["history"]
    assert [h["who"] for h in history_of] == ["Owner of Shree Cool AC"] * 2


def test_ac_43_3_customers_and_jobs_are_logged_too(firm):
    owner = firm["owner"]
    one(owner, "customer", "c-1", {"id": "c-1", "name": "Mehta Clinic", "phone": "9811100009"})
    one(owner, "customer", "c-1", {"id": "c-1", "name": "Mehta Clinic", "phone": "9811100008"})
    one(
        owner,
        "customer",
        "c-1",
        {"id": "c-1", "name": "Mehta Clinic", "phone": "9811100008", "reminded_at": "2026-11-04"},
    )
    one(owner, "job", "j-1", job())
    texts = [t for _, t in lines(owner, group="jobs")]
    assert "Added customer Mehta Clinic" in texts
    assert "Changed customer Mehta Clinic" in texts
    assert "Renewal reminder for Mehta Clinic" in texts
    assert any(t.startswith("Recorded job J-") for t in texts)
    step = {
        "state": "WORK_DONE",
        "action": "supervisor_verify",
        "client_op_id": "op-step-0001",
        "actor": "Owner",
    }
    step["payload"] = {"reason": "Customer unreachable"}
    r = owner.post("/api/v1/jobs/j-1/transitions", json=step)
    assert r.status_code == 200, r.text
    steps = [(w, t) for w, t in lines(owner, group="jobs") if t.startswith("Job J-")]
    assert steps and steps[0][0] == "Owner of Shree Cool AC"


def test_ac_43_4_filters_by_kind_person_and_words_and_pages_back(firm, make_client):
    owner = firm["owner"]
    for i in range(3):
        one(owner, "item", f"it-{i}", item(name=f"Filter mesh {i}", code=f"F-{i}"))
    assert all(e["group"] == "stock" for e in history(owner, group="stock")["entries"])
    assert all(
        "sign" in e["text"].lower() or e["group"] == "team" for e in history(owner, group="team")["entries"]
    )
    assert [t for _, t in lines(owner, q="MESH 1")] == ["Added inventory item Filter mesh 1"]
    assert lines(owner, who="Nobody At All") == []
    assert "Owner of Shree Cool AC" in history(owner)["people"]
    first = history(owner, group="stock", limit=2)
    assert len(first["entries"]) == 2 and first["more"] is True
    rest = history(owner, group="stock", limit=2, before=first["entries"][-1]["id"])
    assert rest["entries"][0]["id"] < first["entries"][-1]["id"] and rest["more"] is False
    assert owner.get("/api/v1/history", params={"group": "nonsense"}).status_code == 422


def test_ac_43_5_only_those_allowed_see_history_and_the_owner_can_allow_it(firm, make_client):
    owner = firm["owner"]
    add_member(
        owner,
        {
            "name": "Asha Menon",
            "phone": "9811100031",
            "role": "coordinator",
            "pin": "5173",
            "must_change_pin": False,
        },
    )
    staff = make_client(signed_in=False)
    assert sign_in(staff, "9811100031", "5173").status_code == 200
    assert staff.get("/api/v1/history").status_code == 403
    assert make_client(signed_in=False).get("/api/v1/history").status_code == 401
    r = owner.put("/api/v1/team/roles/coordinator/permissions", json={"permissions": {"view_history": True}})
    assert r.status_code == 200, r.text
    assert staff.get("/api/v1/history").status_code == 200


def test_ac_43_6_each_business_sees_only_its_own_history(make_business):
    a = make_business("Shree Cool AC", "9811100001")
    b = make_business("Blue Star Cooling", "9811100002")
    one(a["owner"], "item", "it-a", item(name="Only in A", code="A-1"))
    assert any("Only in A" in t for _, t in lines(a["owner"]))
    assert not any("Only in A" in t for _, t in lines(b["owner"]))
    assert "Owner of Shree Cool AC" not in history(b["owner"])["people"]
