"""Settings read from environment variables (never from the browser).

In "mock" mode (the default) every outside service answers with bundled demo data and
built-in demo secrets are used, so the demo runs with no accounts or keys. In "live" mode
every secret must be set, or the feature that needs it refuses to run (fails closed).
"""

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# Demo-only secrets. They protect nothing real: mock mode stores nothing and sends nothing.
DEMO_APP_SECRET = "karyahub-demo-app-secret"
DEMO_VERIFY_TOKEN = "karyahub-demo-verify-token"
DEMO_OTP_SECRET = "karyahub-demo-otp-secret"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KARYAHUB_", extra="ignore")

    mode: Literal["mock", "live"] = "mock"
    whatsapp_app_secret: str = ""
    whatsapp_verify_token: str = ""
    whatsapp_access_token: str = ""
    speech_api_key: str = ""
    llm_api_key: str = ""
    otp_secret: str = ""
    otp_ttl_seconds: int = 600

    def secret(self, name: str) -> str:
        """Return a secret, falling back to the demo value only in mock mode."""
        value = getattr(self, name)
        if value:
            return value
        if self.mode == "mock":
            return {
                "whatsapp_app_secret": DEMO_APP_SECRET,
                "whatsapp_verify_token": DEMO_VERIFY_TOKEN,
                "otp_secret": DEMO_OTP_SECRET,
            }.get(name, "")
        return ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
