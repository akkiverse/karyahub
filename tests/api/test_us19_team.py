"""US-19: team and access for a business (CR-0005)."""

import pytest
from conftest import sign_in

TECH = {
    "name": "Ravi Kale",
    "phone": "9822200002",
    "role": "technician",
    "pin": "6402",
    "must_change_pin": False,
}


def _add(owner, **over):
    return owner.post("/api/v1/team", json={**TECH, **over})


def test_ac_19_1_owner_adds_a_person_and_the_pin_is_shown_once(make_business, make_client):
    """AC-19.1: the owner adds name, mobile and role; a generated PIN is shown once and works for sign-in."""
    owner = make_business()["owner"]
    r = owner.post(
        "/api/v1/team", json={"name": "Sunita Das", "phone": "98 222 00003", "role": "coordinator"}
    )
    assert r.status_code == 201, r.text
    pin = r.json()["pin"]
    assert len(pin) == 6 and r.json()["member"]["phone"] == "9822200003"
    assert "pin" not in str(owner.get("/api/v1/team").json()["members"]).replace("must_change_pin", "")
    person = make_client(signed_in=False)
    login = sign_in(person, "9822200003", pin).json()
    assert login["user"]["role"] == "coordinator" and login["user"]["must_change_pin"] is True


def test_ac_19_1_a_mobile_number_belongs_to_one_account_everywhere(make_business):
    """AC-19.1: the same number can't be added twice, in one business or across businesses."""
    one = make_business("Business One", "9811100001")
    two = make_business("Business Two", "9811100002")
    assert _add(one["owner"]).status_code == 201
    dup = _add(one["owner"])
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "phone_in_use"
    assert _add(two["owner"]).status_code == 409
    assert _add(two["owner"], phone="9811100001").status_code == 409


def test_ac_19_1_bad_details_are_refused_in_plain_words(make_business):
    """AC-19.1: names, numbers, roles and PINs are checked."""
    owner = make_business()["owner"]
    assert "10-digit" in _add(owner, phone="12345").json()["error"]["message"]
    assert "name" in _add(owner, name="A").json()["error"]["message"]
    assert "4 to 6 digits" in _add(owner, pin="12").json()["error"]["message"]
    assert _add(owner, role="boss").status_code == 422


def test_ac_19_2_csv_import_adds_good_rows_and_reports_bad_ones(make_business):
    """AC-19.2: good rows are added (PIN generated when blank); bad rows come back with row and reason."""
    owner = make_business()["owner"]
    csv = (
        "name,phone,role,pin\n"
        "Asha Menon,9833300011,technician,6402\n"
        "Bala Iyer,9833300012,Office Coordinator,\n"
        "Chitra,98,technician,\n"
        "Dev Rao,9833300011,technician,\n"
        "Esha Rao,9833300013,manager,\n"
    )
    r = owner.post("/api/v1/team/import", json={"csv": csv})
    assert r.status_code == 200, r.text
    body = r.json()
    assert [c["name"] for c in body["created"]] == ["Asha Menon", "Bala Iyer"]
    assert body["created"][0]["pin"] == "6402" and len(body["created"][1]["pin"]) == 6
    assert body["created"][1]["role"] == "coordinator"
    assert [e["row"] for e in body["errors"]] == [4, 5, 6]
    assert "10-digit" in body["errors"][0]["message"] and "already" in body["errors"][1]["message"]
    names = [m["name"] for m in owner.get("/api/v1/team").json()["members"]]
    assert "Asha Menon" in names and "Chitra" not in names


def test_ac_19_2_csv_needs_the_right_columns_and_a_sane_size(make_business):
    """AC-19.2: a file without the needed columns, or an empty one, is refused."""
    owner = make_business()["owner"]
    assert (
        "missing the column"
        in owner.post("/api/v1/team/import", json={"csv": "name,role\nA B,technician"}).json()["error"][
            "message"
        ]
    )
    assert owner.post("/api/v1/team/import", json={"csv": ""}).status_code == 422
    big = "name,phone,role\n" + "".join(f"Person {i},98{i:08d},technician\n" for i in range(201))
    assert "at most 200" in owner.post("/api/v1/team/import", json={"csv": big}).json()["error"]["message"]


def test_ac_19_3_owner_changes_roles_access_and_pins(make_business, make_client):
    """AC-19.3: role change, turning access off (ends sessions), and a PIN reset that works."""
    owner = make_business()["owner"]
    member = _add(owner).json()["member"]
    tech = make_client("9822200002", "6402")
    assert tech.get("/api/v1/meta").status_code == 200
    changed = owner.patch(f"/api/v1/team/{member['id']}", json={"role": "coordinator"})
    assert changed.json()["role"] == "coordinator"
    assert owner.patch(f"/api/v1/team/{member['id']}", json={"active": False}).status_code == 200
    assert tech.get("/api/v1/meta").status_code == 401  # their session ended at once
    assert sign_in(make_client(signed_in=False), "9822200002", "6402").status_code == 401
    assert owner.patch(f"/api/v1/team/{member['id']}", json={"active": True}).status_code == 200
    reset = owner.post(f"/api/v1/team/{member['id']}/reset-pin", json={"pin": "9051"})
    assert reset.json()["pin"] == "9051"
    assert sign_in(make_client(signed_in=False), "9822200002", "9051").status_code == 200


def test_ac_19_3_owners_cannot_demote_or_switch_off_themselves(make_business, make_client):
    """AC-19.3: no one changes their own role or access; a second owner can step in."""
    owner = make_business()["owner"]
    me = owner.get("/api/v1/auth/me").json()["user"]
    assert owner.patch(f"/api/v1/team/{me['id']}", json={"active": False}).status_code == 403
    assert owner.patch(f"/api/v1/team/{me['id']}", json={"role": "technician"}).status_code == 403
    second = _add(owner, name="Co Owner", phone="9822200005", role="owner").json()["member"]
    co = make_client("9822200005", "6402")
    assert co.patch(f"/api/v1/team/{me['id']}", json={"active": False}).status_code == 200
    assert owner.get("/api/v1/auth/me").json() == {"signed_in": False}  # their session ended at once
    assert co.patch(f"/api/v1/team/{second['id']}", json={"role": "technician"}).status_code == 403


def test_ac_19_3_a_delegate_cannot_make_or_change_owners(make_business, make_client):
    """AC-19.3: someone given 'manage team' who isn't an owner can't add owners or touch them."""
    owner = make_business()["owner"]
    coord = _add(owner, name="Sunita Das", phone="9822200003", role="coordinator").json()["member"]
    owner.put(f"/api/v1/team/{coord['id']}/permissions", json={"overrides": {"manage_team": "allow"}})
    delegate = make_client("9822200003", "6402")
    assert delegate.get("/api/v1/team").status_code == 200
    assert _add(delegate, phone="9822200009", role="owner").status_code == 403
    me = owner.get("/api/v1/auth/me").json()["user"]
    assert delegate.patch(f"/api/v1/team/{me['id']}", json={"active": False}).status_code == 403
    assert _add(delegate, phone="9822200009", role="technician").status_code == 201


def test_ac_19_4_owner_switches_permissions_for_a_role(make_business, make_client):
    """AC-19.4: switching 'close jobs' on for technicians lets them close; switching it off takes it away."""
    owner = make_business()["owner"]
    _add(owner)
    tech = make_client("9822200002", "6402")
    # Since CR-0009 a real business's job lives on the server, so the job has to be there first (and verified).
    job = {"customer_id": "c", "customer_name": "Ramesh", "date": "2027-01-01", "lines": [], "events": []}
    owner.post(
        "/api/v1/sync",
        json={"since": 0, "ops": [{"op_id": "op-seed-1", "kind": "job", "id": "J-1", "body": job}]},
    )
    verify = {"state": "WORK_DONE", "action": "supervisor_verify", "client_op_id": "op-seed-0002"}
    assert (
        owner.post(
            "/api/v1/jobs/J-1/transitions", json=verify | {"payload": {"reason": "Seen on site"}}
        ).status_code
        == 200
    )
    close = {
        "state": "VERIFIED",
        "action": "close",
        "client_op_id": "op-role-0001",
        "actor": "T",
        "channel": "web",
    }
    assert tech.post("/api/v1/jobs/J-1/transitions", json=close).status_code == 403
    r = owner.put("/api/v1/team/roles/technician/permissions", json={"permissions": {"close_jobs": True}})
    assert r.status_code == 200 and r.json()["role_permissions"]["technician"]["close_jobs"] is True
    assert tech.post("/api/v1/jobs/J-1/transitions", json=close).status_code == 200
    owner.put(
        "/api/v1/team/roles/technician/permissions",
        json={"permissions": {"close_jobs": False, "use_chat": False}},
    )
    assert (
        tech.post("/api/v1/jobs/J-1/transitions", json=close | {"client_op_id": "op-role-0002"}).status_code
        == 403
    )
    assert tech.post("/api/v1/pipeline/extract", json={"text": "hi"}).status_code == 403


def test_ac_19_4_owner_overrides_one_person(make_business, make_client):
    """AC-19.4: allow or block one permission for one person, then go back to the role default."""
    owner = make_business()["owner"]
    one = _add(owner).json()["member"]
    _add(owner, name="Other Tech", phone="9822200004")
    tech, other = make_client("9822200002", "6402"), make_client("9822200004", "6402")
    path = f"/api/v1/team/{one['id']}/permissions"
    assert owner.put(path, json={"overrides": {"manage_renewals": "allow"}}).json()["overrides"] == {
        "manage_renewals": "allow"
    }
    body = {"customers": [], "today": "2027-01-01", "days": 30}
    assert tech.post("/api/v1/renewals/due", json=body).status_code == 200
    assert other.post("/api/v1/renewals/due", json=body).status_code == 403  # only that person changed
    owner.put(path, json={"overrides": {"manage_renewals": "default", "use_chat": "deny"}})
    assert tech.post("/api/v1/renewals/due", json=body).status_code == 403
    assert tech.post("/api/v1/pipeline/extract", json={"text": "hi"}).status_code == 403
    assert owner.put(path, json={"overrides": {"made_up": "allow"}}).status_code == 422


def test_ac_19_4_an_owner_always_keeps_team_and_settings(make_business):
    """AC-19.4: owners can't lose access to the team or settings, and only coordinator/technician rows are editable."""
    owner = make_business()["owner"]
    me = owner.get("/api/v1/auth/me").json()["user"]
    assert (
        owner.put(
            f"/api/v1/team/{me['id']}/permissions", json={"overrides": {"manage_team": "deny"}}
        ).status_code
        == 403
    )
    assert (
        owner.put(
            "/api/v1/team/roles/owner/permissions", json={"permissions": {"manage_team": False}}
        ).status_code
        == 403
    )
    matrix = owner.get("/api/v1/team").json()["role_permissions"]
    assert all(matrix["owner"].values())
    assert matrix["technician"]["manage_team"] is False and matrix["coordinator"]["create_documents"] is True


def test_ac_19_5_a_business_only_ever_sees_its_own_people(make_business):
    """AC-19.5: another business's team can't be listed, changed, reset or read in the audit log."""
    one = make_business("Business One", "9811100001")
    two = make_business("Business Two", "9811100002")
    theirs = _add(two["owner"]).json()["member"]
    assert [m["name"] for m in one["owner"].get("/api/v1/team").json()["members"]] == [
        "Owner of Business One"
    ]
    assert one["owner"].patch(f"/api/v1/team/{theirs['id']}", json={"active": False}).status_code == 404
    assert one["owner"].post(f"/api/v1/team/{theirs['id']}/reset-pin", json={}).status_code == 404
    assert (
        one["owner"]
        .put(f"/api/v1/team/{theirs['id']}/permissions", json={"overrides": {"use_chat": "deny"}})
        .status_code
        == 404
    )
    log = one["owner"].get("/api/v1/team/audit").json()["entries"]
    assert all("Ravi" not in e["text"] for e in log)
    assert one["owner"].get("/api/v1/auth/me").json()["business"]["name"] == "Business One"


def test_ac_19_6_team_changes_are_in_the_audit_log(make_business):
    """AC-19.6: who did what, newest first."""
    owner = make_business()["owner"]
    member = _add(owner).json()["member"]
    owner.patch(f"/api/v1/team/{member['id']}", json={"role": "coordinator"})
    owner.post(f"/api/v1/team/{member['id']}/reset-pin", json={})
    entries = owner.get("/api/v1/team/audit").json()["entries"]
    actions = [e["action"] for e in entries]
    assert actions[:3] == ["pin_reset", "member_updated", "member_added"]
    assert entries[1]["who"] == "Owner of Shree Cool AC" and "coordinator" in entries[1]["text"]
    assert "6402" not in str(entries)  # PINs never go into the log


def test_ac_19_7_the_demo_business_team_is_read_only(make_client):
    """AC-19.7: visitors can't add people to, or change, the public demo business."""
    demo = make_client("9900000201", "2468")
    team = demo.get("/api/v1/team").json()
    assert team["editable"] is False and len(team["members"]) == 4
    r = _add(demo)
    assert r.status_code == 403 and r.json()["error"]["code"] == "demo_readonly"
    assert (
        demo.post(
            "/api/v1/team/import", json={"csv": "name,phone,role\nA B,9833300011,technician"}
        ).status_code
        == 403
    )
    one = team["members"][1]["id"]
    assert demo.patch(f"/api/v1/team/{one}", json={"active": False}).status_code == 403
    assert demo.post(f"/api/v1/team/{one}/reset-pin", json={}).status_code == 403
    assert demo.put("/api/v1/business/profile", json={"name": "Hacked"}).status_code == 403


def test_ac_19_8_owner_edits_the_business_details(make_business):
    """AC-19.8: name, address, GSTIN and state are saved on the server and checked."""
    owner = make_business()["owner"]
    r = owner.put(
        "/api/v1/business/profile",
        json={
            "name": "Shree Cool Services",
            "address": "12 MG Road, Nashik",
            "gstin": "27AAAAA0000A1Z5",
            "state_code": "27",
        },
    )
    assert r.status_code == 200 and r.json()["name"] == "Shree Cool Services"
    assert owner.get("/api/v1/auth/me").json()["business"]["address"] == "12 MG Road, Nashik"
    assert owner.get("/api/v1/meta").json()["tenant"]["business_name"] == "Shree Cool Services"
    assert "GSTIN" in owner.put("/api/v1/business/profile", json={"gstin": "BAD"}).json()["error"]["message"]
    assert owner.put("/api/v1/business/profile", json={"name": "X"}).status_code == 422


@pytest.mark.parametrize("path", ["/api/v1/team", "/api/v1/team/audit"])
def test_ac_19_4_people_without_manage_team_cannot_open_it(make_business, make_client, path):
    """AC-19.4: coordinators and technicians don't get the team screens unless the owner allows it."""
    owner = make_business()["owner"]
    _add(owner)
    tech = make_client("9822200002", "6402")
    assert tech.get(path).status_code == 403
