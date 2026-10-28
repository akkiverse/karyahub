"""US-10: AMC visit planning."""


def plan(client, **contract):
    today = contract.pop("today", "2027-01-01")
    existing = contract.pop("existing", [])
    return client.post(
        "/api/v1/amc/plan",
        json={"contract": {"customer_id": "n0001", **contract}, "today": today, "existing_keys": existing},
    )


def test_ac_10_1_visits_every_90_days_with_overdue_escalation(client):
    """AC-10.1: a contract ending 2027-03-15 owes 4 visits; on 2027-01-01 the 2026-12-10 visit is overdue."""
    p = plan(client, ends_on="2027-03-15").json()
    assert p["starts_on"] == "2026-03-15"
    assert [v["due_on"] for v in p["visits"]] == ["2026-06-13", "2026-09-11", "2026-12-10", "2027-03-10"]
    statuses = [(v["status"], v["escalate_to"]) for v in p["visits"]]
    assert statuses == [("past", ""), ("past", ""), ("overdue", "owner"), ("upcoming", "")]
    assert p["visits"][3]["create_job_on"] == "2027-03-03"
    assert p["next_visit"]["due_on"] == "2026-12-10"
    assert p["jobs_to_create"] == ["visit:n0001:2026-12-10"]
    fresh = plan(client, ends_on="2027-03-15", today="2026-12-11").json()
    assert fresh["visits"][2]["escalate_to"] == "coordinator"


def test_ac_10_2_jobs_are_created_lead_days_ahead_and_never_twice(client):
    """AC-10.2: inside the lead time a visit says create the job now; a visit with a job is never listed again."""
    p = plan(client, ends_on="2027-03-15", today="2027-03-05").json()
    assert p["visits"][3]["status"] == "create_job_now"
    assert "visit:n0001:2027-03-10" in p["jobs_to_create"]
    done = plan(client, ends_on="2027-03-15", today="2027-03-05", existing=["visit:n0001:2027-03-10"]).json()
    assert done["visits"][3]["status"] == "job_created"
    assert "visit:n0001:2027-03-10" not in done["jobs_to_create"]
    bad = plan(client, ends_on="2027-03-15", starts_on="2027-04-01")
    assert bad.status_code == 422
    assert bad.json()["error"]["message"] == "The contract must end after it starts."
