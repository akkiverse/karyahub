"""US-24: Chat works and AI is smooth (CR-0010). The AI server is always mocked."""

import asyncio
import base64
import json
import logging
from pathlib import Path

import httpx
import karyahub
from conftest import CSRF
from karyahub import studio_ai
from karyahub.adapters.llm import OFFLINE_NOTICE, ai_step_seconds

AI = "https://studio-ai-mac.test.example"
KEY = "test-key-0123456789"
PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64).decode()
MAC_MODELS = ("gemma4:e4b", "qwen3-vl:8b", "qwen3-coder:30b")  # what the founder's Mac has (1 Nov 2026)
NOTE = "Gas refill for Mr Anil Kumar in Baner, 9900000150. Charge 2200."
JOB = {
    "customer_name": "Anil Kumar",
    "phone": "9900000150",
    "area": "Baner",
    "equipment": "",
    "work_done": "Gas refill",
    "parts": "",
    "amc_expiry": "",
    "amc_value": 0,
    "lines": [{"description": "Gas refill", "qty": 1, "rate": 2200}],
}
SHEET_WORDS = ["Cust: Sunil Patil, Warje\n", "Ph: 99000 00177\n", "Unit: LG 1.5T split"]


class Mac:
    """Answers like Ollama on the founder's Mac: only the models it has, streaming when asked."""

    def __init__(self, models=MAC_MODELS, *, offline=False, delay=0.0, timeout=False):
        self.models = models
        self.offline = offline
        self.delay = delay
        self.timeout = timeout
        self.requests: list[dict] = []

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        if self.offline:
            raise httpx.ConnectError("off", request=request)
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": m} for m in self.models]})
        body = json.loads(request.content)
        self.requests.append({"body": body, "headers": dict(request.headers)})
        if body["model"] not in self.models:
            return httpx.Response(
                404, json={"error": f'model "{body["model"]}" not found, try pulling it first'}
            )
        if self.timeout:
            raise httpx.ReadTimeout("no answer in time", request=request)
        if self.delay:
            await asyncio.sleep(self.delay)
        if not body["messages"]:
            return httpx.Response(200, json={"model": body["model"], "done": True, "done_reason": "load"})
        if body.get("stream"):
            lines = [json.dumps({"message": {"content": w}, "done": False}) for w in SHEET_WORDS]
            lines.append(json.dumps({"message": {"content": ""}, "done": True}))
            return httpx.Response(200, content=("\n".join(lines) + "\n").encode())
        has_image = any(m.get("images") for m in body["messages"])
        content = "".join(SHEET_WORDS) if has_image else json.dumps(JOB)
        return httpx.Response(200, json={"model": body["model"], "message": {"content": content}})


def use(monkeypatch, mac: Mac, **env: str) -> Mac:
    monkeypatch.setenv("AI_ENDPOINTS", AI)
    monkeypatch.setenv("AI_GATEWAY_KEY", KEY)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(studio_ai, "TRANSPORT", httpx.MockTransport(mac))
    return mac


def stream_lines(r: httpx.Response) -> list[dict]:
    return [json.loads(line) for line in r.text.splitlines() if line.strip()]


def test_ac_24_1_health_shows_the_released_version(client):
    """AC-24.1: /api/health and meta show the version in studio.json, and the copy bundled with the server matches it."""
    released = json.loads(Path("studio.json").read_text())["version"]
    assert client.get("/api/health").json()["version"] == released
    assert client.get("/api/v1/meta").json()["version"] == released
    assert (
        released == karyahub._VERSION
    )  # the value the Vercel function uses, where studio.json isn't bundled


def test_ac_24_2_a_model_the_mac_lacks_is_not_offline(client, monkeypatch):
    """AC-24.2: if AI_MODEL names a model the AI computer doesn't have, the message is still read by AI with one it has."""
    mac = use(monkeypatch, Mac(), AI_MODEL="qwen3.5:9b")
    out = client.post("/api/v1/pipeline/extract", json={"text": NOTE}).json()
    assert out["reader"] == "ai" and out["notice"] == "" and out["job"]["customer_name"] == "Anil Kumar"
    assert [r["body"]["model"] for r in mac.requests] == ["qwen3.5:9b", "gemma4:e4b"]
    mac.requests.clear()
    client.post("/api/v1/pipeline/extract", json={"text": NOTE})
    assert [r["body"]["model"] for r in mac.requests] == ["gemma4:e4b"]  # remembered: no second 404


def test_ac_24_3_photos_use_the_vision_model(client, monkeypatch):
    """AC-24.3: notes use AI_MODEL (default gemma4:e4b); photos use AI_MODEL_VISION when it is set."""
    mac = use(monkeypatch, Mac())
    client.post("/api/v1/pipeline/extract", json={"text": NOTE})
    client.post("/api/v1/pipeline/read-image", json={"media_id": "x-upload", "image_base64": PNG})
    assert [r["body"]["model"] for r in mac.requests] == ["gemma4:e4b", "gemma4:e4b"]
    mac.requests.clear()
    monkeypatch.setenv("AI_MODEL_VISION", "qwen3-vl:8b")
    photo = client.post(
        "/api/v1/pipeline/read-image", json={"media_id": "x-upload", "image_base64": PNG}
    ).json()
    assert photo["reader"] == "ai" and "Sunil Patil" in photo["text"]
    assert mac.requests[0]["body"]["model"] == "qwen3-vl:8b"


def test_ac_24_4_time_limits_fit_inside_the_server_function(monkeypatch):
    """AC-24.4: each AI step may take 90 s by default (KARYAHUB_AI_STEP_SECONDS), always 10 s inside maxDuration 120."""
    config = json.loads(Path("vercel.json").read_text())
    assert config["functions"]["api/index.py"]["maxDuration"] == 120
    assert ai_step_seconds() == 90
    monkeypatch.setenv("KARYAHUB_AI_STEP_SECONDS", "45")
    assert ai_step_seconds() == 45
    monkeypatch.setenv("KARYAHUB_AI_STEP_SECONDS", "500")
    assert ai_step_seconds() == 110
    monkeypatch.setenv("KARYAHUB_AI_STEP_SECONDS", "soon")
    assert ai_step_seconds() == 90


def test_ac_24_5_a_slow_answer_is_waited_for(client, monkeypatch):
    """AC-24.5: an answer that takes a while (but less than the step limit) is used, not replaced."""
    use(monkeypatch, Mac(delay=0.3))
    out = client.post("/api/v1/pipeline/extract", json={"text": NOTE}).json()
    assert out["reader"] == "ai" and out["job"]["customer_name"] == "Anil Kumar"


def test_ac_24_6_too_slow_falls_back_and_nothing_is_lost(client, monkeypatch):
    """AC-24.6: past the step limit the note is read without AI (labelled), with every detail the quick reader finds."""
    use(monkeypatch, Mac(timeout=True), KARYAHUB_AI_STEP_SECONDS="5")
    out = client.post("/api/v1/pipeline/extract", json={"text": NOTE}).json()
    assert out["reader"] == "quick" and out["notice"] == OFFLINE_NOTICE
    assert out["job"]["customer_name"] == "Anil Kumar" and out["job"]["phone"] == "9900000150"


def test_ac_24_7_opening_chat_warms_the_models(client, monkeypatch):
    """AC-24.7: POST /api/v1/ai/warm loads the everyday and photo models without answering, at most once a minute."""
    mac = use(monkeypatch, Mac(), AI_MODEL_VISION="qwen3-vl:8b")
    first = client.post("/api/v1/ai/warm").json()
    assert first["configured"] is True
    assert first["everyday"]["ok"] and first["everyday"]["model"] == "gemma4:e4b"
    assert first["photos"]["ok"] and first["photos"]["model"] == "qwen3-vl:8b"
    assert sorted(r["body"]["model"] for r in mac.requests) == ["gemma4:e4b", "qwen3-vl:8b"]
    assert all(r["body"]["messages"] == [] and r["body"]["keep_alive"] == "30m" for r in mac.requests)
    again = client.post("/api/v1/ai/warm").json()
    assert again["everyday"]["skipped"] and len(mac.requests) == 2


def test_ac_24_7_warming_never_fails_and_needs_sign_in(client, monkeypatch, make_client):
    """AC-24.7: with AI not set up or offline, warming answers calmly; signed out it is refused."""
    assert client.post("/api/v1/ai/warm").json() == {"configured": False, "everyday": None, "photos": None}
    use(monkeypatch, Mac(offline=True))
    out = client.post("/api/v1/ai/warm")
    assert out.status_code == 200 and out.json()["everyday"]["ok"] is False
    assert make_client(signed_in=False).post("/api/v1/ai/warm", headers=CSRF).status_code == 401


def test_ac_24_8_photo_text_streams_as_it_is_read(client, monkeypatch):
    """AC-24.8: the photo's text comes back in pieces as the AI writes it, then a final line with all of it."""
    mac = use(monkeypatch, Mac())
    r = client.post("/api/v1/pipeline/read-image/stream", json={"media_id": "x-upload", "image_base64": PNG})
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/x-ndjson")
    lines = stream_lines(r)
    assert [x["text"] for x in lines[:-1]] == SHEET_WORDS
    assert lines[-1] == {"done": True, "text": "".join(SHEET_WORDS).strip(), "reader": "ai", "notice": ""}
    assert mac.requests[0]["body"]["stream"] is True and mac.requests[0]["body"]["messages"][-1][
        "images"
    ] == [PNG]


def test_ac_24_8_streaming_falls_back_like_before(client, monkeypatch):
    """AC-24.8: offline, the sample photo's stored text comes back labelled; an unknown photo says AI is offline."""
    use(monkeypatch, Mac(offline=True))
    sample = stream_lines(
        client.post("/api/v1/pipeline/read-image/stream", json={"media_id": "s-sunil", "image_base64": PNG})
    )
    assert len(sample) == 1 and sample[0]["reader"] == "quick" and sample[0]["notice"] == OFFLINE_NOTICE
    assert "Sunil Patil" in sample[0]["text"]
    unknown = stream_lines(
        client.post("/api/v1/pipeline/read-image/stream", json={"media_id": "x-upload", "image_base64": PNG})
    )
    assert unknown == [
        {"done": True, "error": {"code": "ai_unavailable", "message": studio_ai.OFFLINE_MESSAGE}}
    ]


def test_ac_24_8_bad_photos_are_refused_before_streaming(client, monkeypatch):
    """AC-24.8: a file that isn't a photo answers 422 at once; with no AI set up the demo text comes as one line."""
    use(monkeypatch, Mac())
    bad = client.post(
        "/api/v1/pipeline/read-image/stream",
        json={"media_id": "x-upload", "image_base64": base64.b64encode(b"GIF89a").decode()},
    )
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "bad_image"
    failed = client.post(
        "/api/v1/pipeline/read-image/stream", json={"media_id": "s-sunil", "simulate_failure": True}
    )
    assert failed.status_code == 422
    monkeypatch.delenv("AI_ENDPOINTS")
    demo = stream_lines(client.post("/api/v1/pipeline/read-image/stream", json={"media_id": "s-sunil"}))
    assert (
        len(demo) == 1
        and demo[0]["done"]
        and demo[0]["reader"] == "demo"
        and "Sunil Patil" in demo[0]["text"]
    )


def test_ac_24_9_every_ai_call_is_logged_without_secrets(client, monkeypatch, caplog):
    """AC-24.9: each AI call writes one log line (model, server, seconds) for the runtime logs; never the key or note."""
    use(monkeypatch, Mac(), AI_MODEL="qwen3.5:9b")
    with caplog.at_level(logging.INFO, logger="studio_ai"):
        client.post("/api/v1/pipeline/extract", json={"text": NOTE})
    text = caplog.text
    assert "qwen3.5:9b isn't there" in text and "gemma4:e4b on Main server: answered in" in text
    assert KEY not in text and "Anil Kumar" not in text and AI not in text
