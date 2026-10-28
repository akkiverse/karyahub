"""Outside services behind one interface each, with mock and live implementations.

The mode comes from server settings (KARYAHUB_MODE), never from the browser, and keys live
only in server environment variables. The LLM uses Studio AI (the founder's own AI server)
whenever its settings are present, in either mode (CR-0004).
"""

from dataclasses import dataclass

from karyahub import studio_ai
from karyahub.adapters.llm import LiveLlm, MockLlm, StudioAiLlm
from karyahub.adapters.speech import LiveSpeech, MockSpeech
from karyahub.adapters.whatsapp import LiveWhatsApp, MockWhatsApp
from karyahub.settings import Settings


@dataclass
class Adapters:
    mode: str
    speech: MockSpeech | LiveSpeech
    llm: MockLlm | LiveLlm | StudioAiLlm
    whatsapp: MockWhatsApp | LiveWhatsApp


def get_adapters(settings: Settings) -> Adapters:
    ai = StudioAiLlm() if studio_ai.configured() else None
    if settings.mode == "live":
        return Adapters(
            "live",
            LiveSpeech(settings.speech_api_key),
            ai or LiveLlm(settings.llm_api_key),
            LiveWhatsApp(settings.whatsapp_access_token),
        )
    return Adapters("mock", MockSpeech(), ai or MockLlm(), MockWhatsApp())
