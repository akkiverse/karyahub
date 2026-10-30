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
]


@pytest.fixture(autouse=True)
def no_real_ai(monkeypatch):
    """Tests never call a real AI server: AI is "not set up" unless a test sets it up with a mock."""
    for key in AI_ENV:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(studio_ai, "TRANSPORT", None)
    studio_ai._down_until.clear()
    yield
    studio_ai._down_until.clear()


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
