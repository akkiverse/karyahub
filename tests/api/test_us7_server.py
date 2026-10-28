"""US-7: the KaryaHub server (Python API)."""

RAMESH = {
    "customer_name": "Ramesh Sharma",
    "phone": "9876543210",
    "equipment": "Voltas 1.5T split AC",
    "work_done": "Gas refill",
    "amc_expiry": "2027-03-15",
    "amc_value": 6500,
}


def test_ac_7_1_health_and_meta(client):
    """AC-7.1: /api/health answers ok and /api/v1/meta lists the tenant, mode and three services."""
    h = client.get("/api/health")
    assert h.status_code == 200
    assert h.json()["status"] == "ok"
    assert h.json()["service"] == "karyahub-api"
    m = client.get("/api/v1/meta").json()
    assert m["mode"] == "mock"
    assert m["tenant"]["business_name"] == "CoolCare AC Services"
    assert [s["id"] for s in m["services"]] == ["whatsapp", "speech", "llm"]
    assert {s["status"] for s in m["services"]} == {"Mock"}
    assert client.get("/api/docs").status_code == 200


def test_ac_7_2_pipeline_matches_the_demo_extraction(client):
    """AC-7.2: transcribe and extract on the server give the AC-3.2 fields for the Ramesh sample."""
    t = client.post("/api/v1/pipeline/transcribe", json={"media_id": "s-ramesh"})
    assert t.status_code == 200
    assert t.json()["adapter"] == "mock"
    e = client.post("/api/v1/pipeline/extract", json={"text": t.json()["text"]}).json()
    assert e["found"] is True
    for k, v in RAMESH.items():
        assert e["job"][k] == v
    img = client.post("/api/v1/pipeline/read-image", json={"media_id": "s-sunil"}).json()
    assert "Sunil Patil" in img["text"]
    free = client.post(
        "/api/v1/pipeline/extract",
        json={
            "text": "Sir, visited Anil Kumar in Baner, LG 1 ton split AC filter cleaning, number 9812345678"
        },
    ).json()
    assert free["job"]["customer_name"] == "Anil Kumar"
    assert free["job"]["phone"] == "9812345678"
    none = client.post("/api/v1/pipeline/extract", json={"text": "gas refill done, all ok"}).json()
    # CR-0004 added "reader" and "notice"; the earlier fields are unchanged.
    assert {k: none[k] for k in ("found", "job", "missing", "adapter")} == {
        "found": False,
        "job": None,
        "missing": ["customer_name"],
        "adapter": "mock",
    }
    assert none["reader"] == "demo"


def test_ac_7_4_errors_have_one_plain_shape(client):
    """AC-7.4: errors are {"error": {"code", "message"}} with plain-English messages."""
    r = client.get("/api/v1/nothing-here")
    assert r.status_code == 404
    assert r.json() == {
        "error": {"code": "not_found", "message": "That address doesn't exist in the KaryaHub API."}
    }
    r = client.post("/api/v1/pipeline/extract", json={"text": ""})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
    assert r.json()["error"]["message"].startswith("Check text")
    r = client.post("/api/v1/pipeline/transcribe", json={"media_id": "s-ramesh", "simulate_failure": True})
    assert r.status_code == 422
    assert r.json() == {"error": {"code": "read_failed", "message": "Couldn't read this message. Try again."}}


def test_ac_7_5_live_mode_without_keys_fails_closed(live_client):
    """AC-7.5: in live mode with no keys, services answer 503 "Not configured: add <SERVICE> key"."""
    r = live_client.post("/api/v1/pipeline/transcribe", json={"media_id": "s-ramesh"})
    assert r.status_code == 503
    assert r.json()["error"]["message"] == "Not configured: add Speech-to-text key"
    r = live_client.post("/api/v1/pipeline/extract", json={"text": "Visited Anil Kumar"})
    assert r.json()["error"]["message"] == "Not configured: add LLM key"
    r = live_client.post("/api/v1/messages/send", json={"to": "9876543210", "body": "hi"})
    assert r.json()["error"]["message"] == "Not configured: add WhatsApp key"
    statuses = {s["id"]: s["status"] for s in live_client.get("/api/v1/meta").json()["services"]}
    assert statuses == {"whatsapp": "Missing key", "speech": "Missing key", "llm": "Missing key"}
