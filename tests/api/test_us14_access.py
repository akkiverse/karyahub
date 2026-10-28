"""US-14: roles and limited access on the KaryaHub server (CR-0003)."""

import json
import re
from pathlib import Path

JS = (Path(__file__).resolve().parents[2] / "src" / "domain" / "access.js").read_text(encoding="utf-8")


def _js_permissions() -> dict[str, list[str]]:
    out = {}
    for pid, roles in re.findall(r"\{ id: '(\w+)', label: '[^']*', roles: \[([^\]]*)\] \}", JS):
        out[pid] = re.findall(r"'(\w+)'", roles)
    return out


def _js_action_permissions() -> dict[str, str]:
    block = JS.split("export const ACTION_PERMISSION = {", 1)[1].split("};", 1)[0]
    return dict(re.findall(r"(\w+): '(\w+)'", block))


def _req(action: str, state: str, role: str | None, op: str = "op-access-0001") -> dict:
    body = {"state": state, "action": action, "client_op_id": op, "actor": "Test", "channel": "web"}
    if role is not None:
        body["actor_role"] = role
    return body


def test_ac_14_5_roles_endpoint_matches_web_app(client):
    """AC-14.5: GET /api/v1/access/roles returns the same roles and permissions as the web app."""
    r = client.get("/api/v1/access/roles")
    assert r.status_code == 200
    data = r.json()
    assert [x["id"] for x in data["roles"]] == ["owner", "coordinator", "technician"]
    server = {p["id"]: p["roles"] for p in data["permissions"]}
    assert server == _js_permissions()
    assert data["action_permissions"] == _js_action_permissions()


def test_ac_14_5_technician_cannot_close_a_job(client):
    """AC-14.5: a technician closing a job gets 403 with a plain message, and nothing changes."""
    r = client.post("/api/v1/jobs/J-0001/transitions", json=_req("close", "VERIFIED", "technician"))
    assert r.status_code == 403
    err = r.json()["error"]
    assert err["code"] == "forbidden"
    assert err["message"] == (
        "Your role (Technician) can't close or manage jobs. Ask the owner or the office coordinator."
    )


def test_ac_14_5_allowed_roles_and_system_calls_pass(client):
    """AC-14.5: coordinators may close, technicians may send the customer code, and calls without a role still work."""
    ok = client.post("/api/v1/jobs/J-0001/transitions", json=_req("close", "VERIFIED", "coordinator"))
    assert ok.status_code == 200, ok.text
    assert ok.json()["state"] == "CLOSED"
    otp = client.post(
        "/api/v1/jobs/J-0001/transitions",
        json=_req("request_otp", "WORK_DONE", "technician", "op-access-0002")
        | {"payload": {"phone": "9900000101"}},
    )
    assert otp.status_code == 200, otp.text
    system = client.post(
        "/api/v1/jobs/J-0001/transitions", json=_req("close", "VERIFIED", None, "op-access-0003")
    )
    assert system.status_code == 200


def test_ac_14_5_unknown_role_is_refused(client):
    """AC-14.5: a role the server doesn't know is refused rather than trusted."""
    r = client.post("/api/v1/jobs/J-0001/transitions", json=_req("close", "VERIFIED", "superuser"))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "unknown_role"
    assert json.dumps(r.json()).count("superuser") == 0
