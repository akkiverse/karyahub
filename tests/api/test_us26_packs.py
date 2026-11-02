"""US-26 Business type and packs (CR-0012)."""

from conftest import CSRF, DEMO_OWNER, sync_ops
from karyahub import access


def test_ac_26_1_a_new_business_is_asked_once_and_service_gets_field_service(make_business):
    """AC-26.1: a new business has no type; saving Repair and service switches on Field service."""
    owner = make_business()["owner"]
    me = owner.get("/api/v1/auth/me").json()
    assert me["business"]["setup_needed"] is True
    r = owner.put(
        "/api/v1/business/setup",
        json={"business_type": "service", "gst_registration": "regular", "state_code": "27"},
    )
    assert r.status_code == 200, r.text
    assert r.json() == {
        "business_type": "service",
        "setup_needed": False,
        "packs": ["field_service"],
        "gst_registration": "regular",
        "state_code": "27",
    }
    assert owner.get("/api/v1/auth/me").json()["business"]["setup_needed"] is False


def test_ac_26_1_other_types_get_the_core_only(make_business):
    """AC-26.1: Trader, Shop and Other start with the core only (their packs are "Coming soon")."""
    for i, kind in enumerate(("trading", "shop", "other")):
        owner = make_business(name=f"Firm {kind}", owner_phone=f"98111000{10 + i}")["owner"]
        r = owner.put(
            "/api/v1/business/setup",
            json={"business_type": kind, "gst_registration": "composition", "state_code": "29"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["packs"] == []
        assert r.json()["gst_registration"] == "composition"


def test_ac_26_1_the_state_is_needed(make_business):
    """AC-26.1: a state that isn't real is refused with "Pick your state to work out GST."."""
    owner = make_business()["owner"]
    r = owner.put("/api/v1/business/setup", json={"business_type": "service", "state_code": "99"})
    assert r.status_code == 422
    assert r.json()["error"]["message"] == "Pick your state to work out GST."


def test_ac_26_2_the_demo_and_older_businesses_are_service_with_field_service(client):
    """AC-26.2: the demo (and every business from before v0.8.0) is Repair and service, GST Regular,
    Field service on, never asked, with every v0.7.0 permission still there."""
    me = client.get("/api/v1/auth/me").json()
    b = me["business"]
    assert (b["business_type"], b["setup_needed"], b["packs"], b["gst_registration"]) == (
        "service",
        False,
        ["field_service"],
        "regular",
    )
    assert {"use_chat", "view_jobs", "manage_renewals", "verify_work", "close_jobs"} <= set(me["permissions"])
    # A row from before the migration has no packs: that is Field service on.
    assert access.packs_of(type("Old", (), {"packs": None})()) == ["field_service"]


def test_ac_26_2_the_migration_makes_existing_businesses_service():
    """AC-26.2: migration 0004 sets every existing business to Repair and service."""
    import importlib
    import inspect

    m = importlib.import_module("karyahub.db.migrations.versions.0004_bills")
    assert "UPDATE businesses SET business_type = 'service' WHERE business_type IS NULL" in inspect.getsource(
        m.upgrade
    )


def test_ac_26_3_field_service_off_hides_and_refuses_its_routes(biller):
    """AC-26.3: with Field service off, its permissions go and its routes answer 403 pack_off; switched on
    again, everything comes back with its data."""
    made = biller()
    owner = made["owner"]
    job = {"id": "job-1", "customer_name": "Mehta", "phone": "9822000001", "lines": []}
    assert sync_ops(owner, {"kind": "job", "id": "job-1", "body": job})["results"][0]["status"] == "applied"

    r = owner.put("/api/v1/business/setup", json={"packs": []})
    assert r.status_code == 200 and r.json()["packs"] == []
    me = owner.get("/api/v1/auth/me").json()
    assert not {"use_chat", "view_jobs", "manage_renewals", "verify_work", "close_jobs", "use_parts"} & set(
        me["permissions"]
    )
    assert "create_documents" in me["permissions"]
    for method, path, body in (
        ("post", "/api/v1/pipeline/extract", {"text": "AC service"}),
        ("post", "/api/v1/renewals/due", {"customers": [], "today": "2026-11-02"}),
        (
            "post",
            "/api/v1/jobs/job-1/transitions",
            {"state": "WORK_DONE", "action": "close", "client_op_id": "op-close-1"},
        ),
        ("post", "/api/v1/amc/plan", {"customer": {"id": "c1", "name": "x"}}),
    ):
        r = getattr(owner, method)(path, json=body)
        assert r.status_code == 403, (path, r.text)
        assert r.json()["error"] == {
            "code": "pack_off",
            "message": "This part of KaryaHub is switched off for your business.",
        }
    res = sync_ops(owner, {"kind": "job", "id": "job-2", "body": {**job, "id": "job-2"}})
    assert res["results"][0]["status"] == "rejected"
    assert res["results"][0]["message"] == "This part of KaryaHub is switched off for your business."

    assert owner.put("/api/v1/business/setup", json={"packs": ["field_service"]}).status_code == 200
    back = sync_ops(owner)
    assert any(j["id"] == "job-1" for j in back["changes"]["job"])
    assert "view_jobs" in owner.get("/api/v1/auth/me").json()["permissions"]


def test_ac_26_4_only_manage_settings_changes_packs_and_it_is_logged(biller, make_client):
    """AC-26.4: switching a pack or the GST registration needs manage_settings and goes in the activity log."""
    made = biller()
    owner = made["owner"]
    r = owner.post(
        "/api/v1/team", json={"name": "Priya", "phone": "9811177777", "role": "coordinator", "pin": "4826"}
    )
    assert r.status_code == 201, r.text
    coord = make_client("9811177777", "4826")
    coord.post("/api/v1/auth/change-pin", json={"current_pin": "4826", "new_pin": "7315"})
    r = coord.put("/api/v1/business/setup", json={"packs": []})
    assert r.status_code == 403
    assert (
        owner.put("/api/v1/business/setup", json={"gst_registration": "composition", "packs": []}).status_code
        == 200
    )
    log = owner.get("/api/v1/team/audit").json()["entries"]
    text = " ".join(e["text"] for e in log if e["action"] == "business_setup")
    assert "GST registration Composition" in text and "Field service off" in text


def test_ac_26_4_the_demo_business_cannot_change_its_setup(client):
    """AC-26.4: the demo's setup is fixed, so visitors can't switch its packs off for everyone."""
    r = client.put("/api/v1/business/setup", json={"packs": []})
    assert r.status_code == 403


def test_ac_28_8_cancel_bills_is_an_owner_permission():
    """AC-28.8: cancel_bills is on for the owner only; create_documents reads "Make estimates and bills"."""
    perms = {p.id: p for p in access.PERMISSIONS}
    assert perms["cancel_bills"].roles == ["owner"]
    assert perms["create_documents"].label == "Make estimates and bills"
    assert "cancel_bills" not in access.effective_permissions("technician")
    assert "create_documents" not in access.effective_permissions("technician")
    assert "cancel_bills" in access.effective_permissions("owner")


_ = (CSRF, DEMO_OWNER)
