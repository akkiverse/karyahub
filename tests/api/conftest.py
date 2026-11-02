import pytest
from fastapi.testclient import TestClient
from karyahub import studio_ai
from karyahub.app import create_app
from karyahub.db.engine import forget_engines
from karyahub.settings import get_settings

AI_ENV = [
    "AI_ENDPOINTS",
    "AI_GATEWAY_KEY",
    "AI_MODEL",
    "AI_MODEL_LARGE",
    "AI_API",
    "AI_TIMEOUT",
    "AI_CONTEXT",
    "AI_MODEL_VISION",
    "AI_MODEL_FALLBACK",
    "KARYAHUB_AI_STEP_SECONDS",
]


@pytest.fixture(autouse=True)
def no_real_ai(monkeypatch):
    """Tests never call a real AI server: AI is "not set up" unless a test sets it up with a mock."""
    for key in AI_ENV:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(studio_ai, "TRANSPORT", None)
    studio_ai._down_until.clear()
    studio_ai._model_on.clear()
    studio_ai._warmed.clear()
    yield
    studio_ai._down_until.clear()
    studio_ai._model_on.clear()
    studio_ai._warmed.clear()


DB_ENV = [
    "KARYAHUB_DATABASE_URL",
    "DATABASE_URL",
    "POSTGRES_URL",
    "KARYAHUB_PIN_PEPPER",
    "KARYAHUB_BOOTSTRAP_TOKEN",
]
CSRF = {"X-Requested-With": "karyahub"}
DEMO_OWNER = ("9900000201", "2468")


@pytest.fixture(autouse=True)
def fresh_database(monkeypatch):
    """Every test gets its own throwaway in-memory database. Tests never reach a real one."""
    for key in DB_ENV:
        monkeypatch.delenv(key, raising=False)
    forget_engines()
    get_settings.cache_clear()
    yield
    forget_engines()
    get_settings.cache_clear()


def sign_in(client, phone, pin):
    return client.post("/api/v1/auth/sign-in", json={"phone": phone, "pin": pin}, headers=CSRF)


@pytest.fixture
def make_client():
    clients = []

    def make(phone=None, pin=None, signed_in=True):
        c = TestClient(create_app(), headers=CSRF)
        c.__enter__()
        clients.append(c)
        if signed_in and phone:
            assert sign_in(c, phone, pin).status_code == 200
        return c

    yield make
    for c in clients:
        c.__exit__(None, None, None)


@pytest.fixture
def client(monkeypatch, make_client):
    """The API, signed in as the demo owner (all rights). Use make_client for other people."""
    for key in [
        "KARYAHUB_MODE",
        "KARYAHUB_WHATSAPP_APP_SECRET",
        "KARYAHUB_WHATSAPP_VERIFY_TOKEN",
        "KARYAHUB_OTP_SECRET",
        "KARYAHUB_WHATSAPP_ACCESS_TOKEN",
        "KARYAHUB_SPEECH_API_KEY",
        "KARYAHUB_LLM_API_KEY",
    ]:
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    yield make_client(*DEMO_OWNER)
    get_settings.cache_clear()


@pytest.fixture
def live_client(monkeypatch, make_client):
    monkeypatch.setenv("KARYAHUB_MODE", "live")
    for key in [
        "KARYAHUB_WHATSAPP_APP_SECRET",
        "KARYAHUB_OTP_SECRET",
        "KARYAHUB_LLM_API_KEY",
        "KARYAHUB_SPEECH_API_KEY",
    ]:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("KARYAHUB_DATABASE_URL", "")
    get_settings.cache_clear()
    yield make_client(*DEMO_OWNER)
    get_settings.cache_clear()


@pytest.fixture
def platform(monkeypatch, make_client):
    """A client signed in as the platform admin (the founder), created with the setup token."""
    monkeypatch.setenv("KARYAHUB_BOOTSTRAP_TOKEN", "setup-token-for-tests")
    get_settings.cache_clear()
    c = make_client(signed_in=False)
    body = {"token": "setup-token-for-tests", "name": "Abhishek", "phone": "9800000001", "pin": "8143"}
    assert c.post("/api/v1/auth/bootstrap", json=body).status_code == 200
    assert sign_in(c, "9800000001", "8143").status_code == 200
    return c


@pytest.fixture
def make_business(platform, make_client):
    """Create a business with its owner (who has already chosen their own PIN) and return a signed-in owner client."""

    def make(name="Shree Cool AC", owner_phone="9811100001", final_pin="5826"):
        r = platform.post(
            "/api/v1/platform/businesses",
            json={
                "name": name,
                "owner_name": f"Owner of {name}",
                "owner_phone": owner_phone,
                "owner_pin": "7391",
            },
        )
        assert r.status_code == 201, r.text
        owner = make_client(signed_in=False)
        assert sign_in(owner, owner_phone, "7391").status_code == 200
        r2 = owner.post("/api/v1/auth/change-pin", json={"current_pin": "7391", "new_pin": final_pin})
        assert r2.status_code == 200, r2.text
        return {"business": r.json()["business"], "owner": owner, "phone": owner_phone, "pin": final_pin}

    return make


# ---------- bills (CR-0012) ----------
@pytest.fixture
def fixed_today(monkeypatch):
    """The Spec's test date: 2 Nov 2026, financial year 2026-27."""
    from datetime import date

    from karyahub.data import bills

    monkeypatch.setattr(bills, "today", lambda: date(2026, 11, 2))
    return date(2026, 11, 2)


@pytest.fixture
def biller(make_business, fixed_today):
    """A real business, set up as Repair and service, GST Regular in Maharashtra, with a GSTIN."""

    def make(name="Shree Cool AC", owner_phone="9811100001", **setup):
        made = make_business(name=name, owner_phone=owner_phone)
        owner = made["owner"]
        r = owner.put(
            "/api/v1/business/profile",
            json={
                "name": name,
                "address": "12 MG Road, Pune",
                "gstin": "27AAPFU0939F1ZV",
                "state_code": "27",
            },
        )
        assert r.status_code == 200, r.text
        body = {"business_type": "service", "gst_registration": "regular", "state_code": "27", **setup}
        r = owner.put("/api/v1/business/setup", json=body)
        assert r.status_code == 200, r.text
        return made

    return make


_ops = iter(range(1, 10**9))


def sync_ops(c, *ops, since=0):
    """Send changes as a phone does; each gets its own operation id."""
    sent = [{"op_id": f"op-t-{next(_ops)}", **op} for op in ops]
    r = c.post("/api/v1/sync", json={"since": since, "ops": sent})
    assert r.status_code == 200, r.text
    return r.json()


def put_doc(c, doc_id, *, save=False, **fields):
    """A version-2 estimate or bill as the phone sends it; returns (result, stored body or None)."""
    body = {"doc_version": 2, "type": "invoice", "lines": [], **fields}
    if save:
        body["save"] = True
    res = sync_ops(c, {"kind": "document", "id": doc_id, "body": body})
    return res["results"][0], stored(c, "document", doc_id)


def stored(c, kind, rid):
    found = None
    since = 0
    while True:
        res = sync_ops(c, since=since)
        for rec in res["changes"][kind]:
            if rec["id"] == rid:
                found = rec["body"]
        if not res["more"]:
            return found
        since = res["cursor"]


def line(description="AC service", qty=1, rate=100000, gst_rate=18, **extra):
    return {"description": description, "qty": qty, "rate": rate, "gst_rate": gst_rate, **extra}
