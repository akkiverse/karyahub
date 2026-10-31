"""US-17: real AI for job notes and photos through Studio AI (CR-0004). The AI server is always mocked."""

import base64
import json

import httpx
import pytest
from karyahub import studio_ai
from karyahub.adapters.llm import OFFLINE_NOTICE, UNREADABLE_NOTICE, job_from_ai

AI = "https://ai.test.example"
PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64).decode()
SUNIL_SHEET = "26/12/26\nCust: Sunil Patil, Warje\nPh: 99000 00177\nUnit: LG 1.5T split\nPCB repair"
AI_JOB = {
    "customer_name": "Mr Anil Kumar",
    "phone": "+91 99000 00150",
    "area": "Baner",
    "equipment": "Daikin 1T split AC",
    "work_done": "Gas refill",
    "parts": "",
    "amc_expiry": "2027-05-31",
    "amc_value": "4,800",
    "lines": [{"description": "Gas refill, Daikin 1T split AC", "qty": 1, "rate": 2200}],
}


class FakeAi:
    """Answers like Ollama: /api/chat and /api/tags. Records every request."""

    def __init__(self, answer=None, *, offline=False, image_text=SUNIL_SHEET):
        self.answer = AI_JOB if answer is None else answer
        self.offline = offline
        self.image_text = image_text
        self.requests: list[dict] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if self.offline:
            raise httpx.ConnectError("off", request=request)
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "qwen3.5:9b"}]})
        body = json.loads(request.content)
        self.requests.append({"headers": dict(request.headers), "body": body})
        if any(m.get("images") for m in body["messages"]):
            content = self.image_text
        else:
            content = self.answer if isinstance(self.answer, str) else json.dumps(self.answer)
        return httpx.Response(
            200, json={"model": body["model"], "message": {"role": "assistant", "content": content}}
        )


@pytest.fixture
def ai(monkeypatch):
    def setup(fake: FakeAi) -> FakeAi:
        monkeypatch.setenv("AI_ENDPOINTS", AI)
        monkeypatch.setenv("AI_GATEWAY_KEY", "test-key")
        monkeypatch.setattr(studio_ai, "TRANSPORT", httpx.MockTransport(fake))
        return fake

    return setup


def test_ac_17_1_without_ai_settings_the_demo_reader_is_used(client):
    """AC-17.1: with no AI settings, messages are read by the bundled demo reader and nothing calls an AI server."""
    r = client.post("/api/v1/pipeline/extract", json={"text": "Gas refill for Mr Anil Kumar, 9900000150"})
    assert r.status_code == 200
    assert r.json()["reader"] == "demo"
    assert r.json()["job"]["customer_name"] == "Anil Kumar"
    assert client.get("/api/ai/status").json() == {"configured": False, "online": False}
    llm = next(s for s in client.get("/api/v1/meta").json()["services"] if s["id"] == "llm")
    assert (llm["status"], llm["key"], llm["configured"]) == ("Mock", "AI_ENDPOINTS", False)


def test_ac_17_2_ai_reads_the_job_with_a_json_schema(client, ai):
    """AC-17.2: with AI set up, the report goes to qwen3.5:9b with the job schema at temperature 0, and the validated answer is the job."""
    fake = ai(FakeAi())
    r = client.post(
        "/api/v1/pipeline/extract", json={"text": "Anil Kumar ji Baner, Daikin 1T gas refill 2200"}
    )
    assert r.status_code == 200
    out = r.json()
    assert out["reader"] == "ai" and out["found"] is True and out["notice"] == ""
    job = out["job"]
    assert job["customer_name"] == "Anil Kumar"
    assert job["phone"] == "9900000150"
    assert job["amc_expiry"] == "2027-05-31"
    assert job["amc_value"] == 4800
    assert job["lines"] == [{"description": "Gas refill, Daikin 1T split AC", "qty": 1, "rate": 2200}]
    sent = fake.requests[0]
    assert sent["body"]["model"] == "gemma4:e4b"  # kit v2 default (CR-0010)
    assert sent["body"]["options"]["temperature"] == 0
    assert sent["body"]["format"]["required"][0] == "customer_name"
    assert "Anil Kumar ji Baner" in sent["body"]["messages"][-1]["content"]
    assert sent["headers"]["authorization"] == "Bearer test-key"
    assert client.get("/api/ai/status").json() == {"configured": True, "online": True}
    llm = next(s for s in client.get("/api/v1/meta").json()["services"] if s["id"] == "llm")
    assert (llm["status"], llm["configured"]) == ("Studio AI", True)


def test_ac_17_3_no_customer_name_keeps_the_ask_for_a_name_behaviour(client, ai):
    """AC-17.3: when the AI finds no customer name, the answer is found=false with customer_name missing."""
    ai(FakeAi({**AI_JOB, "customer_name": ""}))
    out = client.post("/api/v1/pipeline/extract", json={"text": "did gas refill, 2200"}).json()
    assert out["found"] is False
    assert out["missing"] == ["customer_name"]
    assert out["reader"] == "ai"


def test_ac_17_4_ai_answers_are_validated_and_bad_ones_fall_back(client, ai):
    """AC-17.4: AI answers are untrusted: bad phone and date values are dropped, and an unusable answer falls back to the quick reader."""
    cleaned = job_from_ai(
        {**AI_JOB, "phone": "12345", "amc_expiry": "31/05/2027", "amc_value": -5, "lines": "x"}
    )
    assert (
        cleaned.found
        and cleaned.job.phone == ""
        and cleaned.job.amc_expiry == ""
        and cleaned.job.amc_value == 0
    )
    assert [ln.description for ln in cleaned.job.lines] == ["Gas refill"]
    ai(FakeAi("this is not json"))
    out = client.post(
        "/api/v1/pipeline/extract", json={"text": "Gas refill for Mr Anil Kumar, 9900000150"}
    ).json()
    assert out["reader"] == "quick"
    assert out["notice"] == UNREADABLE_NOTICE
    assert out["job"]["customer_name"] == "Anil Kumar"


def test_ac_17_5_ai_reads_the_job_sheet_photo(client, ai):
    """AC-17.5: a photo sent with the request is read by the AI (image attached) and the text comes back labelled as AI."""
    fake = ai(FakeAi())
    r = client.post(
        "/api/v1/pipeline/read-image",
        json={"media_id": "s-sunil", "image_base64": f"data:image/png;base64,{PNG}"},
    )
    assert r.status_code == 200
    assert r.json()["text"] == SUNIL_SHEET
    assert r.json()["reader"] == "ai"
    assert fake.requests[0]["body"]["messages"][-1]["images"] == [PNG]
    bad = client.post(
        "/api/v1/pipeline/read-image",
        json={"media_id": "s-sunil", "image_base64": base64.b64encode(b"GIF89a").decode()},
    )
    assert bad.status_code == 422
    assert bad.json()["error"]["message"] == "That photo isn't a JPEG, PNG or WebP image."
    no_image = client.post("/api/v1/pipeline/read-image", json={"media_id": "s-sunil"}).json()
    assert no_image["reader"] == "demo"
    ai(FakeAi(image_text="  "))
    blank = client.post("/api/v1/pipeline/read-image", json={"media_id": "x-upload", "image_base64": PNG})
    assert blank.status_code == 422
    assert "Couldn't read any text in this photo" in blank.json()["error"]["message"]


def test_ac_17_6_ai_offline_falls_back_and_everything_else_works(client, ai):
    """AC-17.6: with the AI server off, messages are read without AI (labelled), unknown photos answer 503 ai_unavailable, and non-AI features still work."""
    ai(FakeAi(offline=True))
    out = client.post(
        "/api/v1/pipeline/extract", json={"text": "Gas refill for Mr Anil Kumar, 9900000150"}
    ).json()
    assert out["reader"] == "quick"
    assert out["notice"] == OFFLINE_NOTICE
    assert out["job"]["customer_name"] == "Anil Kumar"
    photo = client.post(
        "/api/v1/pipeline/read-image", json={"media_id": "s-sunil", "image_base64": PNG}
    ).json()
    assert photo["reader"] == "quick" and photo["notice"] == OFFLINE_NOTICE and "Sunil Patil" in photo["text"]
    unknown = client.post("/api/v1/pipeline/read-image", json={"media_id": "x-upload", "image_base64": PNG})
    assert unknown.status_code == 503
    assert unknown.json()["error"]["code"] == "ai_unavailable"
    assert "offline" in unknown.json()["error"]["message"]
    assert client.get("/api/ai/status").json() == {"configured": True, "online": False}
    totals = client.post(
        "/api/v1/documents/totals", json={"lines": [{"description": "Gas refill", "qty": 1, "rate": 1000}]}
    )
    assert totals.status_code == 200
    assert client.post("/api/v1/pipeline/transcribe", json={"media_id": "s-ramesh"}).status_code == 200
