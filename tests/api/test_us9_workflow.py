"""US-9: proof of work (job workflow with customer one-time codes)."""

from datetime import UTC, datetime, timedelta

from karyahub.domain import otp, workflow
from karyahub.settings import DEMO_OTP_SECRET
from karyahub.tenancy import DEMO_TENANT


def move(client, state, action, op, payload=None, applied=None, job="J-0001"):
    return client.post(
        f"/api/v1/jobs/{job}/transitions",
        json={
            "state": state,
            "action": action,
            "client_op_id": op,
            "payload": payload or {},
            "applied_op_ids": applied or [],
            "work_done": "Gas refill",
        },
    )


def test_ac_9_2_code_then_verify_then_close(client):
    """AC-9.2: a 6-digit code tied to the job verifies the work, then the job closes."""
    r = move(client, "WORK_DONE", "request_otp", "op-000001", {"phone": "9876543210"}).json()
    assert r["state"] == "WORK_DONE"
    code = r["otp"]["demo_code"]
    assert len(code) == 6
    assert code.isdigit()
    assert r["otp"]["sent"] == "simulated"
    v = move(
        client, "WORK_DONE", "verify_otp", "op-000002", {"code": code, "challenge": r["otp"]["challenge"]}
    ).json()
    assert v["state"] == "VERIFIED"
    assert v["event"]["detail"] == "Customer confirmed with the code"
    assert "code" not in v["event"]["payload"]
    assert "challenge" not in v["event"]["payload"]
    c = move(client, "VERIFIED", "close", "op-000003").json()
    assert c["state"] == "CLOSED"
    assert c["state_label"] == "Closed"


def test_ac_9_3_wrong_expired_or_other_job_codes_fail(client):
    """AC-9.3: a wrong code, an expired code or another job's code is refused and the state stays."""
    r = move(client, "WORK_DONE", "request_otp", "op-000010").json()
    good, challenge = r["otp"]["demo_code"], r["otp"]["challenge"]
    wrong = f"{(int(good) + 1) % 1_000_000:06d}"
    msg = "That code doesn't match or has expired. Send a new code."
    bad = move(client, "WORK_DONE", "verify_otp", "op-000011", {"code": wrong, "challenge": challenge})
    assert bad.status_code == 422
    assert bad.json() == {"error": {"code": "guard_failed", "message": msg}}
    other = move(
        client, "WORK_DONE", "verify_otp", "op-000012", {"code": good, "challenge": challenge}, job="J-0002"
    )
    assert other.status_code == 422
    past = datetime.now(UTC) - timedelta(hours=1)
    old_challenge, old_code, _ = otp.issue("J-0001", DEMO_TENANT.id, DEMO_OTP_SECRET, 600, now=past)
    expired = move(
        client, "WORK_DONE", "verify_otp", "op-000013", {"code": old_code, "challenge": old_challenge}
    )
    assert expired.json()["error"]["message"] == msg
    assert not otp.verify("garbage", "123456", "J-0001", DEMO_TENANT.id, DEMO_OTP_SECRET)


def test_ac_9_4_actions_not_allowed_in_this_state_are_refused(client):
    """AC-9.4: closing an unverified job (or any action not allowed in the state) gets 409."""
    r = move(client, "WORK_DONE", "close", "op-000020")
    assert r.status_code == 409
    assert r.json()["error"] == {
        "code": "invalid_transition",
        "message": "You can't close job while the job is work done, waiting for customer check.",
    }
    assert move(client, "CLOSED", "verify_otp", "op-000021").status_code == 409
    assert (
        move(client, "NEW", "assign", "op-000022").json()["error"]["message"]
        == "Name the technician for this job."
    )
    ok = move(client, "NEW", "assign", "op-000023", {"technician": "Santosh"}).json()
    assert ok["state"] == "ASSIGNED"
    assert [a["action"] for a in ok["next_actions"]] == ["start", "cancel"]
    assert move(client, "LOST", "close", "op-000024").json()["error"]["code"] == "unknown_state"
    assert move(client, "NEW", "fly", "op-000025").json()["error"]["code"] == "unknown_action"


def test_ac_9_5_the_same_operation_never_counts_twice(client):
    """AC-9.5: a repeated client_op_id returns duplicate with no new event; event ids are deterministic."""
    first = move(client, "IN_PROGRESS", "report_done", "op-000030").json()
    assert first["duplicate"] is False
    assert first["state"] == "WORK_DONE"
    again = move(client, "WORK_DONE", "report_done", "op-000030", applied=["op-000030"]).json()
    assert again["duplicate"] is True
    assert again["event"] is None
    assert again["state"] == "WORK_DONE"
    assert first["event"]["id"] == workflow.event_id(DEMO_TENANT.id, "J-0001", "op-000030")
