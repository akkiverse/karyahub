"""US-14: roles and limited access on the KaryaHub server (CR-0003, changed CR-0005).

Since CR-0005 the server works out what a person may do from its own records. A role sent in the
request body is ignored.
"""

import re
from pathlib import Path

JS = (Path(__file__).resolve().parents[2] / "src" / "domain" / "access.js").read_text(encoding="utf-8")
COORDINATOR = ("9900000202", "1357")
TECHNICIAN = ("9900000203", "8642")


def _js_permissions() -> dict[str, list[str]]:
    out = {}
    for pid, roles in re.findall(r"\{ id: '(\w+)', label: '[^']*', roles: \[([^\]]*)\] \}", JS):
        out[pid] = re.findall(r"'(\w+)'", roles)
    return out


def _js_action_permissions() -> dict[str, str]:
    block = JS.split("export const ACTION_PERMISSION = {", 1)[1].split("};", 1)[0]
    return dict(re.findall(r"(\w+): '(\w+)'", block))


def _req(action: str, state: str, op: str = "op-access-0001") -> dict:
    return {"state": state, "action": action, "client_op_id": op, "actor": "Test", "channel": "web"}


def test_ac_14_5_roles_endpoint_matches_web_app(client):
    """AC-14.5: GET /api/v1/access/roles returns the same roles and permissions as the web app."""
    r = client.get("/api/v1/access/roles")
    assert r.status_code == 200
    data = r.json()
    assert [x["id"] for x in data["roles"]] == ["owner", "coordinator", "technician"]
    server = {p["id"]: p["roles"] for p in data["permissions"]}
    assert server == _js_permissions()
    assert data["action_permissions"] == _js_action_permissions()


def test_ac_14_5_technician_cannot_close_a_job(make_client):
    """AC-14.5: a technician closing a job gets 403 with a plain message, and nothing changes."""
    tech = make_client(*TECHNICIAN)
    r = tech.post("/api/v1/jobs/J-0001/transitions", json=_req("close", "VERIFIED"))
    assert r.status_code == 403
    err = r.json()["error"]
    assert err["code"] == "forbidden"
    assert err["message"] == (
        "Your access doesn't include permission to close or manage jobs. Ask your business owner."
    )


def test_ac_14_5_allowed_roles_pass(make_client):
    """AC-14.5: coordinators may close, and technicians may send the customer code."""
    coord = make_client(*COORDINATOR)
    ok = coord.post("/api/v1/jobs/J-0001/transitions", json=_req("close", "VERIFIED"))
    assert ok.status_code == 200, ok.text
    assert ok.json()["state"] == "CLOSED"
    tech = make_client(*TECHNICIAN)
    otp = tech.post(
        "/api/v1/jobs/J-0001/transitions",
        json=_req("request_otp", "WORK_DONE", "op-access-0002") | {"payload": {"phone": "9900000101"}},
    )
    assert otp.status_code == 200, otp.text


def test_ac_18_7_a_role_sent_in_the_request_is_ignored(make_client):
    """AC-18.7: a technician who claims to be the owner in the request body is still a technician."""
    tech = make_client(*TECHNICIAN)
    body = _req("close", "VERIFIED") | {"actor_role": "owner"}
    r = tech.post("/api/v1/jobs/J-0001/transitions", json=body)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "forbidden"


def test_ac_18_5_job_and_ai_routes_need_sign_in(make_client):
    """AC-18.5: without signing in, job, AI and paperwork routes answer 401."""
    anon = make_client(signed_in=False)
    for method, path, body in [
        ("post", "/api/v1/jobs/J-0001/transitions", _req("close", "VERIFIED")),
        ("post", "/api/v1/pipeline/extract", {"text": "hello"}),
        ("post", "/api/v1/messages/send", {"to": "9900000101", "body": "hi"}),
        ("post", "/api/v1/documents/totals", {"lines": []}),
        ("get", "/api/v1/meta", None),
    ]:
        r = getattr(anon, method)(path, **({"json": body} if body is not None else {}))
        assert r.status_code == 401, path
        assert r.json()["error"]["code"] == "signin_required"


def test_ac_14_5_the_tenant_header_is_ignored(client):
    """AC-14.5: X-Tenant-Id can't pick another business; the signed-in person's business is used."""
    r = client.get("/api/v1/meta", headers={"X-Tenant-Id": "b-someone-else"})
    assert r.status_code == 200
    assert r.json()["tenant"]["id"] == "b-demo"
