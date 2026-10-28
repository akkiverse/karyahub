"""US-8: the WhatsApp Cloud API webhook."""

import json

from karyahub.settings import DEMO_APP_SECRET, DEMO_VERIFY_TOKEN
from karyahub.whatsapp.webhook import sign

URL = "/api/v1/whatsapp/webhook"


def payload(*messages):
    return {
        "object": "whatsapp_business_account",
        "entry": [{"changes": [{"value": {"messages": list(messages)}}]}],
    }


def post(client, body, secret=DEMO_APP_SECRET, signature=None):
    raw = json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    sig = signature if signature is not None else sign(raw, secret)
    if sig:
        headers["X-Hub-Signature-256"] = sig
    return client.post(URL, content=raw, headers=headers)


def test_ac_8_1_handshake_needs_the_verify_token(client):
    """AC-8.1: GET echoes hub.challenge only for mode=subscribe with the right verify token; else 403."""
    ok = client.get(
        URL, params={"hub.mode": "subscribe", "hub.verify_token": DEMO_VERIFY_TOKEN, "hub.challenge": "42"}
    )
    assert ok.status_code == 200
    assert ok.text == "42"
    bad = client.get(URL, params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "42"})
    assert bad.status_code == 403
    assert bad.json()["error"]["code"] == "forbidden"


def test_ac_8_2_signature_is_checked_before_anything_runs(client):
    """AC-8.2: a missing or wrong X-Hub-Signature-256 gets 401 and nothing is processed."""
    body = payload(
        {"id": "wamid.1", "from": "919800000001", "type": "text", "text": {"body": "Visited Anil Kumar"}}
    )
    assert post(client, body, signature="").status_code == 401
    r = post(client, body, secret="someone-else")
    assert r.status_code == 401
    assert r.json() == {"error": {"code": "bad_signature", "message": "Signature check failed."}}


def test_ac_8_2_live_mode_without_app_secret_refuses(live_client):
    """AC-8.2: in live mode with no app secret configured, the webhook refuses with 503 (fails closed)."""
    body = payload({"id": "wamid.1", "from": "919800000001", "type": "text", "text": {"body": "hi"}})
    r = post(live_client, body)
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "not_configured"


def test_ac_8_3_text_voice_and_photo_become_jobs_once(client):
    """AC-8.3: text, voice and photo messages are processed; a repeated id is processed once; no phone echoed."""
    body = payload(
        {"id": "wamid.A", "from": "919800000001", "type": "audio", "audio": {"id": "s-ramesh"}},
        {"id": "wamid.B", "from": "919800000002", "type": "image", "image": {"id": "s-sunil"}},
        {
            "id": "wamid.C",
            "from": "919800000003",
            "type": "text",
            "text": {"body": "Sir, visited Anil Kumar in Baner"},
        },
        {"id": "wamid.A", "from": "919800000001", "type": "audio", "audio": {"id": "s-ramesh"}},
        {"id": "wamid.D", "from": "919800000003", "type": "sticker", "sticker": {}},
    )
    r = post(client, body)
    assert r.status_code == 200
    data = r.json()
    assert data["received"] == 4
    assert data["duplicates"] == 1
    by_id = {x["id"]: x for x in data["results"]}
    assert by_id["wamid.A"]["extraction"]["job"]["customer_name"] == "Ramesh Sharma"
    assert by_id["wamid.B"]["extraction"]["job"]["customer_name"] == "Sunil Patil"
    assert by_id["wamid.C"]["extraction"]["job"]["customer_name"] == "Anil Kumar"
    assert by_id["wamid.D"]["status"] == "failed"
    assert "9800000001" not in r.text
    assert "9800000003" not in r.text
    assert len(by_id["wamid.A"]["from_hash"]) == 16
