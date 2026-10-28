"""Outside services behind one interface each, with mock and live implementations.

The mode comes from server settings (KARYAHUB_MODE), never from the browser, and keys live
only in server environment variables.
"""

from dataclasses import dataclass

from karyahub.adapters.llm import LiveLlm, MockLlm
from karyahub.adapters.speech import LiveSpeech, MockSpeech
from karyahub.adapters.whatsapp import LiveWhatsApp, MockWhatsApp
from karyahub.settings import Settings


@dataclass
class Adapters:
    mode: str
    speech: MockSpeech | LiveSpeech
    llm: MockLlm | LiveLlm
    whatsapp: MockWhatsApp | LiveWhatsApp


def get_adapters(settings: Settings) -> Adapters:
    if settings.mode == "live":
        return Adapters(
            "live",
            LiveSpeech(settings.speech_api_key),
            LiveLlm(settings.llm_api_key),
            LiveWhatsApp(settings.whatsapp_access_token),
        )
    return Adapters("mock", MockSpeech(), MockLlm(), MockWhatsApp())
