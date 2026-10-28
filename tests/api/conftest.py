import pytest
from fastapi.testclient import TestClient
from karyahub.app import create_app
from karyahub.settings import get_settings


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
