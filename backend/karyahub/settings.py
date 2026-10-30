"""Settings read from environment variables (never from the browser).

In "mock" mode (the default) every outside service answers with bundled demo data and
built-in demo secrets are used, so the demo runs with no accounts or keys. In "live" mode
every secret must be set, or the feature that needs it refuses to run (fails closed).
"""

from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Demo-only secrets. They protect nothing real: mock mode stores nothing and sends nothing.
DEMO_APP_SECRET = "karyahub-demo-app-secret"
DEMO_VERIFY_TOKEN = "karyahub-demo-verify-token"
DEMO_OTP_SECRET = "karyahub-demo-otp-secret"
DEMO_PIN_PEPPER = "karyahub-demo-pin-pepper"


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

    # Accounts and businesses (CR-0005). The Neon database "karyahub_master_db" is reached through
    # DATABASE_URL (set by the Neon integration in Vercel) or KARYAHUB_DATABASE_URL. Without one,
    # KaryaHub uses a throwaway in-memory database, which is only for local runs and tests.
    database_url: str = Field(
        "", validation_alias=AliasChoices("KARYAHUB_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL")
    )
    pin_pepper: str = (
        ""  # KARYAHUB_PIN_PEPPER: secret mixed into every PIN hash; required with a real database
    )
    bootstrap_token: str = (
        ""  # KARYAHUB_BOOTSTRAP_TOKEN: lets the founder create (or recover) the platform admin
    )
    session_hours: int = 12
    lockout_failures: int = 5
    lockout_minutes: int = 15

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

    @property
    def uses_real_database(self) -> bool:
        return bool(self.database_url)

    def pepper(self) -> str:
        """Secret for PIN hashes. Required with a real database; the demo value is for local runs only."""
        if self.pin_pepper:
            return self.pin_pepper
        return "" if self.uses_real_database else DEMO_PIN_PEPPER


@lru_cache
def get_settings() -> Settings:
    return Settings()
