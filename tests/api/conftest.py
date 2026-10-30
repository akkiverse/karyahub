import pytest
from fastapi.testclient import TestClient
from karyahub import studio_ai
from karyahub.app import create_app
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


@pytest.fixture
def client(monkeypatch):
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
    yield TestClient(create_app())
    get_settings.cache_clear()


@pytest.fixture
def live_client(monkeypatch):
    monkeypatch.setenv("KARYAHUB_MODE", "live")
    for key in [
        "KARYAHUB_WHATSAPP_APP_SECRET",
        "KARYAHUB_OTP_SECRET",
        "KARYAHUB_LLM_API_KEY",
        "KARYAHUB_SPEECH_API_KEY",
    ]:
        monkeypatch.delenv(key, raising=False)
    get_settings.cache_clear()
    yield TestClient(create_app())
    get_settings.cache_clear()
