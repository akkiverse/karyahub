"""Speech-to-text. Interface: async transcribe(media) -> {text, language}."""

from karyahub.domain.extraction import sample_by_id
from karyahub.errors import READ_FAILED, AppError, not_configured


class MockSpeech:
    name = "mock"

    async def transcribe(self, media_id: str, *, fail: bool = False) -> dict[str, str]:
        sample = sample_by_id(media_id)
        if fail or sample is None or sample["kind"] != "voice":
            raise AppError("read_failed", READ_FAILED, 422)
        return {"text": sample["mock_transcript"], "language": "hi-en"}


class LiveSpeech:
    name = "live"

    def __init__(self, key: str) -> None:
        self.key = key

    async def transcribe(self, media_id: str, *, fail: bool = False) -> dict[str, str]:
        if not self.key:
            raise not_configured("Speech-to-text")
        raise AppError("not_built", "The live speech adapter isn't built yet. Use mock mode.", 501)
