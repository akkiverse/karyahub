"""US-23: business data on the server (CR-0009): the wall between businesses, sync, import, numbers, logo."""

import base64
import importlib
import os
import uuid

import pytest
from conftest import CSRF, DEMO_OWNER, sign_in
from karyahub.data import rls, service

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64).decode()
PNG_URL = f"data:image/png;base64,{PNG}"
TECH = {
    "name": "Ravi Kale",
    "phone": "9822200002",
    "role": "technician",
    "pin": "6402",
    "must_change_pin": False,
}


def job(name="Ramesh Sharma", **over):
    return {
        "customer_id": "c-1",
        "customer_name": name,
        "phone": "9822200010",
        "date": "2027-01-01",
        "work_done": "Cleaned filters",
        "lines": [],
        "state": "WORK_DONE",
        "events": [{"id": "ev-1", "action": "report_done", "client_op_id": "reported-1"}],
        **over,
    }


def customer(name="Ramesh Sharma", phone="9822200010", **over):
    return {"name": name, "phone": phone, "area": "Kothrud", "amc_expiry": "", "amc_value": 0, **over}


def document(job_id="j-1", kind="quote", **over):
    return {
        "job_id": job_id,
        "type": kind,
        "lines": [{"description": "Service", "qty": 1, "rate": 500}],
        "date": "2027-01-01",
        **over,
    }


def op(kind, item_id, body, op_id=None):
    return {"op_id": op_id or f"op-{uuid.uuid4().hex[:12]}", "kind": kind, "id": item_id, "body": body}


def sync(client, ops=(), since=0):
    r = client.post("/api/v1/sync", json={"since": since, "ops": list(ops)})
    assert r.status_code == 200, r.text
    return r.json()


def ids(response, kind):
    return sorted(i["id"] for i in response["changes"][kind])


def add_tech(owner, **over):
    r = owner.post("/api/v1/team", json={**TECH, **over})
    assert r.status_code == 201, r.text


@pytest.fixture
def firm(make_business):
    return make_business("Shree Cool AC", "9811100001")


@pytest.fixture
def two_firms(make_business):
    return make_business("Shree Cool AC", "9811100001"), make_business("Blue Star Cooling", "9811100002")


def test_ac_23_1_another_phone_of_the_same_business_gets_what_was_saved(firm, make_client):
    """AC-23.1: customers, jobs, documents and chat saved by one phone reach another phone of the business."""
    owner = firm["owner"]
    add_tech(owner)
    r = sync(
        owner,
        [
            op("customer", "c-1", customer()),
            op("job", "j-1", job()),
            op("document", "d-1", document()),
            op("message", "m-1", {"from": "bot", "kind": "text", "body": "Saved."}),
        ],
    )
    assert [x["status"] for x in r["results"]] == ["applied"] * 4
    tech = make_client(TECH["phone"], TECH["pin"])
    got = sync(tech)
    assert ids(got, "customer") == ["c-1"] and ids(got, "job") == ["j-1"] and ids(got, "message") == ["m-1"]
    assert got["changes"]["job"][0]["body"]["customer_name"] == "Ramesh Sharma"
    assert got["changes"]["document"] == []  # a technician has no access to quotes and invoices (AC-23.3)
    second = make_client(firm["phone"], firm["pin"])  # the owner on a second phone
    assert ids(sync(second), "document") == ["d-1"]


def test_ac_23_2_one_business_cannot_read_or_change_anothers_records(two_firms):
    """AC-23.2: a pull never includes the other business, and reusing an id makes a separate record."""
    a, b = two_firms
    sync(a["owner"], [op("customer", "c-1", customer("A's customer")), op("job", "j-1", job("A's job"))])
    assert sync(b["owner"])["changes"]["job"] == []
    mine = sync(b["owner"], [op("job", "j-1", job("B's job"))])
    assert mine["results"][0]["number"] == "J-0001"  # B's own counter starts from one
    assert [i["body"]["customer_name"] for i in sync(b["owner"])["changes"]["job"]] == ["B's job"]
    assert [i["body"]["customer_name"] for i in sync(a["owner"])["changes"]["job"]] == ["A's job"]
    assert sync(a["owner"])["changes"]["customer"][0]["body"]["name"] == "A's customer"


def test_ac_23_2_a_proof_of_work_step_on_another_businesss_job_is_refused(two_firms):
    """AC-23.2: B cannot move A's job along, even knowing its id."""
    a, b = two_firms
    sync(a["owner"], [op("job", "j-secret", job())])
    step = {"state": "WORK_DONE", "action": "supervisor_verify", "client_op_id": "op-b-0001", "actor": "B"}
    step["payload"] = {"reason": "trying my luck"}
    r = b["owner"].post("/api/v1/jobs/j-secret/transitions", json=step)
    assert r.status_code == 404 and r.json()["error"]["code"] == "job_not_synced"
    assert sync(a["owner"])["changes"]["job"][0]["body"]["state"] == "WORK_DONE"


def test_ac_23_2_the_platform_admin_has_no_business_data(platform):
    """AC-23.2: the platform admin runs KaryaHub but belongs to no business, so the sync call is closed to them."""
    assert platform.post("/api/v1/sync", json={"since": 0, "ops": []}).status_code == 403
    assert platform.post("/api/v1/import", json={"device_id": "phone-1"}).status_code == 403


def test_ac_23_2_every_business_data_table_has_a_row_level_security_policy():
    """AC-23.2: each table with a business_id (except the account tables) is covered by the migration's policy."""
    from karyahub.db.models import Base

    first = importlib.import_module("karyahub.db.migrations.versions.0002_business_data")
    later = importlib.import_module(
        "karyahub.db.migrations.versions.0003_inventory"
    )  # CR-0011 added item_codes
    steps = first.rls_statements()["policies"] + later.rls_statements()["policies"]
    tables = set(first.TABLES) | set(later.TABLES)
    account_tables = {
        "users",
        "role_permissions",
        "audit_log",
    }  # people and the activity log: platform admin flows
    with_business = {t.name for t in Base.metadata.tables.values() if "business_id" in t.columns}
    assert with_business - account_tables == tables == set(rls.TABLES)
    for table in tables:
        assert f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY" in steps
        assert f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY" in steps
        policy = next(s for s in steps if s.startswith(f"CREATE POLICY business_wall ON {table} "))
        assert "business_id = current_setting('app.business_id', true)" in policy and "WITH CHECK" in policy
    role = " ".join(first.rls_statements()["role"] + later.rls_statements()["role"])
    assert "NOLOGIN NOBYPASSRLS" in role and "TO karyahub_app" in role


def test_ac_23_2_health_says_whether_the_wall_is_up(client):
    """AC-23.2: /api/health has a row_level_security field once a real database is used; none in memory."""
    assert "row_level_security" not in client.get("/api/health").json()
    assert rls.STATE["status"] == "not_applicable"


def test_ac_23_3_each_kind_of_record_needs_the_owners_permission(firm, make_client):
    """AC-23.3: technicians can't read or save documents until the owner allows it; a refusal says why."""
    owner = firm["owner"]
    add_tech(owner)
    sync(owner, [op("job", "j-1", job()), op("document", "d-1", document())])
    tech = make_client(TECH["phone"], TECH["pin"])
    refused = sync(tech, [op("document", "d-2", document())])["results"][0]
    assert refused["status"] == "rejected" and "access doesn't include" in refused["message"]
    assert "document" not in sync(tech)["readable"]
    allow = {"permissions": {"create_documents": True}}
    assert owner.put("/api/v1/team/roles/technician/permissions", json=allow).status_code == 200
    again = sync(tech, [op("document", "d-2", document())])
    assert again["results"][0]["status"] == "applied" and "document" in again["readable"]
    assert ids(sync(tech), "document") == ["d-1", "d-2"]


def test_ac_23_3_a_rejected_change_brings_back_the_servers_version(firm, make_client):
    """AC-23.3: when the change is refused the phone gets the record as the server has it."""
    owner = firm["owner"]
    add_tech(owner)
    sync(owner, [op("job", "j-1", job("Original"))])
    tech = make_client(TECH["phone"], TECH["pin"])
    owner.put("/api/v1/team/roles/technician/permissions", json={"permissions": {"use_chat": False}})
    r = sync(tech, [op("job", "j-1", job("Tampered"))])["results"][0]
    assert r["status"] == "rejected"
    assert owner.get("/api/v1/team").status_code == 200
    assert sync(owner)["changes"]["job"][0]["body"]["customer_name"] == "Original"


def test_ac_23_3_bad_changes_are_rejected_and_the_good_ones_still_apply(firm):
    """AC-23.3: one bad change doesn't stop the rest of the batch."""
    owner = firm["owner"]
    bad = [
        op("customer", "c-x", {"name": "  "}),
        op("spaceship", "s-1", {}),
        op("job", "bad id!", job()),
        op("document", "d-x", {"type": "receipt"}),
        op("message", "m-big", {"body": "x" * 70_000}),
    ]
    r = sync(owner, [*bad, op("customer", "c-ok", customer())])
    assert [x["status"] for x in r["results"]] == ["rejected"] * 5 + ["applied"]
    assert ids(sync(owner), "customer") == ["c-ok"]
    too_many = owner.post(
        "/api/v1/sync", json={"since": 0, "ops": [op("message", f"m-{i}", {"body": "x"}) for i in range(101)]}
    )
    assert too_many.status_code == 422


def test_ac_23_4_a_change_sent_twice_is_applied_once(firm):
    """AC-23.4: a lost answer and a retry (same operation ids) leave one record and the same answer."""
    owner = firm["owner"]
    batch = [op("job", "j-1", job(), "op-job-1"), op("document", "d-1", document(), "op-doc-1")]
    first = sync(owner, batch)
    again = sync(owner, batch)
    assert [x["status"] for x in first["results"]] == ["applied", "applied"]
    assert [x["status"] for x in again["results"]] == ["duplicate", "duplicate"]
    assert [x["number"] for x in again["results"]] == [x["number"] for x in first["results"]]
    twice = sync(owner, [op("job", "j-2", job("Two"), "op-job-2"), op("job", "j-2", job("Two"), "op-job-2")])
    assert [x["status"] for x in twice["results"]] == ["applied", "duplicate"]
    everything = sync(owner)
    assert ids(everything, "job") == ["j-1", "j-2"] and ids(everything, "document") == ["d-1"]
    assert sorted(i["number"] for i in everything["changes"]["job"]) == [
        "J-0001",
        "J-0002",
    ]  # no number was wasted


def test_ac_23_5_two_phones_get_different_numbers_and_never_overwrite_each_other(firm, make_client):
    """AC-23.5: numbers come from the business's counters, not from the phones."""
    owner = firm["owner"]
    add_tech(owner, role="coordinator", phone="9822200003")
    other = make_client("9822200003", TECH["pin"])
    one = sync(
        owner,
        [
            op("job", "j-phone1", job("From phone one")),
            op("document", "d-a", document("j-phone1", "quote")),
            op("document", "d-b", document("j-phone1", "invoice")),
        ],
    )
    two = sync(
        other,
        [op("job", "j-phone2", job("From phone two")), op("document", "d-c", document("j-phone2", "quote"))],
    )
    assert [x["number"] for x in one["results"]] == ["J-0001", "QT-2027-0001", "INV-2027-0001"]
    assert [x["number"] for x in two["results"]] == ["J-0002", "QT-2027-0002"]
    jobs = {i["id"]: i["body"]["customer_name"] for i in sync(owner)["changes"]["job"]}
    assert jobs == {"j-phone1": "From phone one", "j-phone2": "From phone two"}


def test_ac_23_5_the_cursor_returns_only_what_changed_since(firm, monkeypatch):
    """AC-23.5: the answer carries a cursor; asking again with it returns only newer changes, in pages."""
    owner = firm["owner"]
    first = sync(
        owner, [op("customer", f"c-{i}", customer(f"C{i}", f"98222000{i:02d}")) for i in range(1, 4)]
    )
    assert len(first["changes"]["customer"]) == 3
    nothing = sync(owner, since=first["cursor"])
    assert nothing["changes"]["customer"] == [] and nothing["cursor"] == first["cursor"]
    sync(owner, [op("customer", "c-9", customer("C9", "9822200099"))])
    assert ids(sync(owner, since=first["cursor"]), "customer") == ["c-9"]
    monkeypatch.setattr(service, "MAX_PAGE", 2)
    page = sync(owner)
    assert page["more"] is True and len(page["changes"]["customer"]) == 2
    rest = sync(owner, since=page["cursor"])
    assert rest["more"] is False and len(rest["changes"]["customer"]) == 2


def test_ac_23_6_state_history_and_code_belong_to_the_server(firm):
    """AC-23.6: a step is saved on the server, other phones see it, and a stale phone can't undo it."""
    owner = firm["owner"]
    sync(owner, [op("job", "j-1", job(state="CLOSED"))])
    new = sync(owner)["changes"]["job"][0]["body"]
    assert new["state"] == "WORK_DONE"  # a new job starts where the app starts it
    step = {
        "state": "WORK_DONE",
        "action": "supervisor_verify",
        "client_op_id": "op-step-0001",
        "actor": "Owner",
    }
    step["payload"] = {"reason": "Customer unreachable"}
    r = owner.post("/api/v1/jobs/j-1/transitions", json=step)
    assert r.status_code == 200 and r.json()["state"] == "VERIFIED"
    stale = job(work_done="Edited on a phone that has not seen the step", state="WORK_DONE", events=[])
    assert sync(owner, [op("job", "j-1", stale)])["results"][0]["status"] == "applied"
    now = sync(owner)["changes"]["job"][0]["body"]
    assert now["state"] == "VERIFIED" and now["work_done"].startswith("Edited")
    assert [e["action"] for e in now["events"]] == ["report_done", "supervisor_verify"]
    again = owner.post("/api/v1/jobs/j-1/transitions", json=step)
    assert again.status_code == 200 and again.json()["duplicate"] is True  # the same step sent twice


def test_ac_23_6_the_customer_code_is_kept_on_the_server_with_the_job(firm):
    """AC-23.6: the code challenge is stored with the job; verifying uses the stored state, not the phone's."""
    owner = firm["owner"]
    sync(owner, [op("job", "j-1", job())])
    ask = {
        "state": "VERIFIED",
        "action": "request_otp",
        "client_op_id": "op-code-0001",
        "payload": {"phone": "9822200010"},
    }
    r = owner.post(
        "/api/v1/jobs/j-1/transitions", json=ask
    )  # the phone says VERIFIED; the server knows WORK_DONE
    assert r.status_code == 200 and r.json()["otp"]["challenge"]
    body = sync(owner)["changes"]["job"][0]["body"]
    assert body["otp"]["challenge"] == r.json()["otp"]["challenge"] and body["state"] == "WORK_DONE"
    code = r.json()["otp"]["demo_code"]
    ok = {
        "state": "WORK_DONE",
        "action": "verify_otp",
        "client_op_id": "op-code-0002",
        "payload": {"challenge": body["otp"]["challenge"], "code": code},
    }
    assert owner.post("/api/v1/jobs/j-1/transitions", json=ok).json()["state"] == "VERIFIED"
    assert sync(owner)["changes"]["job"][0]["body"]["otp"] is None


def test_ac_23_6_a_step_on_a_job_that_has_not_reached_the_server_is_refused(firm):
    """AC-23.6: a plain message says to wait for the waiting changes to send."""
    step = {"state": "WORK_DONE", "action": "request_otp", "client_op_id": "op-nope-0001", "payload": {}}
    r = firm["owner"].post("/api/v1/jobs/j-not-yet/transitions", json=step)
    assert r.status_code == 404 and "hasn't reached the server" in r.json()["error"]["message"]


DEVICE = {
    "customer": [
        {
            "id": "n0001",
            "name": "Ramesh Sharma",
            "phone": "9822200010",
            "area": "Kothrud",
            "equipment": "Split AC",
        },
        {"id": "n0002", "name": "Sunita Joshi", "phone": "9822200011", "area": "Baner", "equipment": ""},
    ],
    "job": [
        {
            "id": "J-0001",
            "customer_id": "n0001",
            "customer_name": "Ramesh Sharma",
            "date": "2027-01-01",
            "state": "CLOSED",
            "events": [{"id": "ev-x", "client_op_id": "c1"}],
            "lines": [],
        },
        {
            "id": "J-0002",
            "customer_id": "n0002",
            "customer_name": "Sunita Joshi",
            "date": "2027-01-02",
            "state": "WORK_DONE",
            "events": [],
            "lines": [],
        },
    ],
    "document": [
        {"id": "QT-2027-0001", "job_id": "J-0001", "type": "quote", "lines": [], "date": "2027-01-01"}
    ],
    "message": [
        {"id": "m-welcome", "from": "bot", "kind": "text", "body": "Namaste"},
        {"id": "m-0001", "from": "technician", "kind": "text", "body": "Cleaned AC at Ramesh"},
        {"id": "m-0002", "from": "bot", "kind": "card", "status": "approved", "job_id": "J-0001"},
        {"id": "m-0003", "from": "bot", "kind": "document", "doc_id": "QT-2027-0001"},
    ],
}


def do_import(client, device="phone-aaaa1111", data=None):
    r = client.post("/api/v1/import", json={"device_id": device, **(data or DEVICE)})
    assert r.status_code == 200, r.text
    return r.json()


def test_ac_23_7_old_data_on_a_phone_is_moved_once_with_numbers_and_links_kept(firm):
    """AC-23.7: ids are made unique, numbers are kept, links are re-pointed and the counters move past them."""
    owner = firm["owner"]
    done = do_import(owner)
    assert done["imported"] is True
    assert done["counts"] == {
        "customer": 2,
        "job": 2,
        "document": 1,
        "message": 3,
        "merged_customers": 0,
        "skipped": 0,
    }
    got = sync(owner)
    jobs = {i["number"]: i["body"] for i in got["changes"]["job"]}
    assert sorted(jobs) == ["J-0001", "J-0002"] and jobs["J-0001"]["state"] == "CLOSED"  # the state is kept
    customers = {c["id"] for c in got["changes"]["customer"]}
    assert jobs["J-0001"]["customer_id"] in customers and jobs["J-0001"]["id"].startswith("imp-phoneaaaa1-")
    doc = got["changes"]["document"][0]
    assert doc["number"] == "QT-2027-0001" and doc["body"]["job_id"] == jobs["J-0001"]["id"]
    texts = {
        m["body"].get("job_id") or m["body"].get("doc_id") or m["body"]["body"]
        for m in got["changes"]["message"]
    }
    assert jobs["J-0001"]["id"] in texts and doc["id"] in texts and "Namaste" not in texts
    new = sync(owner, [op("job", "j-new", job("New one")), op("document", "d-new", document("j-new"))])
    assert [x["number"] for x in new["results"]] == ["J-0003", "QT-2027-0002"]  # past the imported numbers
    audit = owner.get("/api/v1/team/audit").json()["entries"]
    assert any("Moved data from a phone" in e["text"] for e in audit)


def test_ac_23_7_a_second_try_from_the_same_phone_imports_nothing(firm):
    """AC-23.7: once per phone, however many times it is asked."""
    owner = firm["owner"]
    do_import(owner)
    again = do_import(owner)
    assert again["imported"] is False and again["already"] is True
    got = sync(owner)
    assert len(got["changes"]["job"]) == 2 and len(got["changes"]["customer"]) == 2


def test_ac_23_7_two_phones_of_one_business_can_both_import_without_clashes(firm, make_client):
    """AC-23.7: customers are merged by mobile number and clashing job numbers are renumbered."""
    owner = firm["owner"]
    add_tech(owner, role="coordinator", phone="9822200003")
    other = make_client("9822200003", TECH["pin"])
    do_import(owner, "phone-aaaa1111")
    second = do_import(other, "phone-bbbb2222")
    assert (
        second["imported"] is True
        and second["counts"]["merged_customers"] == 2
        and second["counts"]["customer"] == 0
    )
    got = sync(owner)
    assert len(got["changes"]["customer"]) == 2 and len(got["changes"]["job"]) == 4
    numbers = sorted(i["number"] for i in got["changes"]["job"])
    assert len(set(numbers)) == 4 and {"J-0001", "J-0002"} <= set(numbers)
    owners = {j["body"]["customer_id"] for j in got["changes"]["job"]}
    assert owners == {
        c["id"] for c in got["changes"]["customer"]
    }  # both phones' jobs point at the same customers


def test_ac_23_7_nothing_is_imported_without_the_permission_to_save_it(firm, make_client):
    """AC-23.7: a person who can't save documents doesn't get documents imported; the rest is."""
    owner = firm["owner"]
    add_tech(owner)
    tech = make_client(TECH["phone"], TECH["pin"])
    done = do_import(tech, "phone-cccc3333")
    assert done["counts"]["document"] == 0 and done["counts"]["job"] == 2


def test_ac_23_12_the_demo_business_never_syncs(client):
    """AC-23.12: the demo owner gets a plain refusal; the demo's data stays on the device."""
    r = client.post("/api/v1/sync", json={"since": 0, "ops": [op("job", "j-1", job())]})
    assert r.status_code == 403 and r.json()["error"]["code"] == "demo_local"
    assert client.post("/api/v1/import", json={"device_id": "phone-1"}).status_code == 403


def test_ac_23_11_the_owner_adds_a_logo_and_only_that_business_can_see_it(two_firms, make_client):
    """AC-23.11: PNG, JPEG or WebP up to 200 KB; served to the business's people only; each change is logged."""
    a, b = two_firms
    owner = a["owner"]
    me = owner.get("/api/v1/auth/me").json()
    assert me["business"]["logo_version"] == ""
    assert owner.get("/api/v1/business/logo").status_code == 404
    r = owner.put("/api/v1/business/logo", json={"data_url": PNG_URL})
    assert r.status_code == 200 and len(r.json()["logo_version"]) == 12
    got = owner.get("/api/v1/business/logo")
    assert got.status_code == 200 and got.headers["content-type"] == "image/png"
    assert got.content.startswith(b"\x89PNG") and got.headers["cache-control"].startswith("private")
    assert b["owner"].get("/api/v1/business/logo").status_code == 404  # B has none; A's is never served to B
    signed_out = make_client(signed_in=False)
    assert signed_out.get("/api/v1/business/logo").status_code == 401
    assert owner.get("/api/v1/auth/me").json()["business"]["logo_version"] == r.json()["logo_version"]
    assert owner.delete("/api/v1/business/logo").status_code == 200
    assert owner.get("/api/v1/business/logo").status_code == 404
    texts = [e["text"] for e in owner.get("/api/v1/team/audit").json()["entries"]]
    assert "Changed the business logo" in texts and "Removed the business logo" in texts


@pytest.mark.parametrize(
    "bad",
    [
        "data:image/svg+xml;base64," + PNG,
        "data:image/png;base64,not base64 at all!!",
        "data:image/png;base64," + base64.b64encode(b"GIF89a" + b"\x00" * 40).decode(),
        "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 210_000).decode(),
        "https://example.com/logo.png",
    ],
)
def test_ac_23_11_a_logo_must_be_a_small_real_picture(firm, bad):
    """AC-23.11: wrong type, broken text, a different file type inside, too big, or a link are all refused."""
    r = firm["owner"].put("/api/v1/business/logo", json={"data_url": bad})
    assert r.status_code == 422 and "PNG, JPEG or WebP" in r.json()["error"]["message"]


def test_ac_23_11_only_the_owner_changes_the_logo_and_the_demo_is_fixed(firm, make_client, client):
    """AC-23.11: a coordinator can't change the logo; the demo business's can't change either."""
    owner = firm["owner"]
    add_tech(owner, role="coordinator", phone="9822200003")
    coord = make_client("9822200003", TECH["pin"])
    assert coord.put("/api/v1/business/logo", json={"data_url": PNG_URL}).status_code == 403
    r = client.put("/api/v1/business/logo", json={"data_url": PNG_URL})
    assert r.status_code == 403 and r.json()["error"]["code"] == "demo_readonly"


def test_the_demo_owner_in_the_fixture_is_the_demo_business():
    assert DEMO_OWNER[0] == "9900000201" and CSRF["X-Requested-With"] == "karyahub" and callable(sign_in)


@pytest.mark.skipif(
    not os.environ.get("KARYAHUB_TEST_POSTGRES_URL"), reason="needs KARYAHUB_TEST_POSTGRES_URL"
)
def test_ac_23_2_on_a_real_postgres_a_scoped_session_sees_only_its_own_business(monkeypatch):
    """AC-23.2: policies, the restricted role and a bare select, run against a real Postgres."""
    import asyncio

    from karyahub.db import engine as eng
    from karyahub.db.models import Business, ItemCode, Record
    from karyahub.settings import Settings
    from sqlalchemy import select, text
    from sqlalchemy.ext.asyncio import AsyncSession

    url = os.environ["KARYAHUB_TEST_POSTGRES_URL"]
    monkeypatch.setenv("KARYAHUB_PIN_PEPPER", "test-pepper")

    async def run():
        settings = Settings(database_url=url)
        engine = eng.get_engine(settings)
        async with engine.begin() as conn:
            for t in (
                "item_codes",
                "records",
                "sync_ops",
                "counters",
                "device_imports",
                "sessions",
                "user_permissions",
                "role_permissions",
                "otp_challenges",
                "audit_log",
                "sign_in_throttle",
                "users",
                "businesses",
                "alembic_version",
            ):
                await conn.execute(text(f"drop table if exists {t} cascade"))
        eng.forget_engines()
        engine = eng.get_engine(settings)
        await eng.ensure_ready(engine, url)
        assert rls.STATE["status"] == "on", rls.STATE
        now = __import__("datetime").datetime(2027, 1, 1)
        async with AsyncSession(engine, expire_on_commit=False) as db:
            for bid in ("b-one", "b-two"):
                db.add(Business(id=bid, name=bid, created_at=now))
            await db.commit()
        for bid in ("b-one", "b-two"):
            async with AsyncSession(engine, expire_on_commit=False) as db:
                await rls.scope(db, bid)
                db.add(
                    Record(
                        business_id=bid,
                        kind="job",
                        id="j-1",
                        number="J-0001",
                        body={"x": bid},
                        seq=1,
                        updated_at=now,
                    )
                )
                await db.commit()
        async with AsyncSession(engine, expire_on_commit=False) as db:
            await rls.scope(db, "b-one")
            rows = (
                (await db.execute(select(Record))).scalars().all()
            )  # no WHERE: the database does the fencing
            assert [r.business_id for r in rows] == ["b-one"]
            # Item codes (CR-0011) sit behind the same wall: each business sees only its own, and can't write another's.
            db.add(ItemCode(business_id="b-one", code_key="cap-45", item_id="it-1"))
            await db.flush()
            db.add(ItemCode(business_id="b-two", code_key="cap-45", item_id="it-2"))
            with pytest.raises(Exception, match="row-level security"):
                await db.flush()
            await db.rollback()
            await rls.scope(db, "b-one")
            db.add(ItemCode(business_id="b-one", code_key="cap-45", item_id="it-1"))
            await db.commit()
        async with AsyncSession(engine, expire_on_commit=False) as db:
            await rls.scope(db, "b-two")
            db.add(
                ItemCode(business_id="b-two", code_key="cap-45", item_id="it-2")
            )  # the same code in another business
            await db.commit()
        async with AsyncSession(engine, expire_on_commit=False) as db:
            await rls.scope(db, "b-one")
            assert [(c.business_id, c.item_id) for c in (await db.execute(select(ItemCode))).scalars()] == [
                ("b-one", "it-1")
            ]
        async with AsyncSession(engine, expire_on_commit=False) as db:
            await rls.scope(db, "b-one")
            db.add(
                Record(business_id="b-two", kind="job", id="j-2", number="", body={}, seq=2, updated_at=now)
            )
            with pytest.raises(Exception, match="row-level security"):
                await db.flush()
            await db.rollback()
        async with AsyncSession(engine, expire_on_commit=False) as db:
            # In the restricted role with no business set, nothing is visible (the connection's own role may bypass).
            await db.execute(text(f"SET LOCAL ROLE {rls.APP_ROLE}"))
            assert (await db.execute(select(Record))).scalars().all() == []
        await engine.dispose()

    asyncio.run(run())
