"""LLM. Interface: async extract_job(text) -> Extraction; async read_image(media) -> {text}."""

from karyahub.domain.extraction import Extraction, extract_job, sample_by_id
from karyahub.errors import READ_FAILED, AppError, not_configured


class MockLlm:
    name = "mock"

    async def extract_job(self, text: str, *, fail: bool = False) -> Extraction:
        if fail:
            raise AppError("read_failed", READ_FAILED, 422)
        return extract_job(text)

    async def read_image(self, media_id: str, *, fail: bool = False) -> dict[str, str]:
        sample = sample_by_id(media_id)
        if fail or sample is None or sample["kind"] != "photo":
            raise AppError("read_failed", READ_FAILED, 422)
        return {"text": sample["mock_transcript"]}


class LiveLlm:
    name = "live"

    def __init__(self, key: str) -> None:
        self.key = key

    async def extract_job(self, text: str, *, fail: bool = False) -> Extraction:
        if not self.key:
            raise not_configured("LLM")
        raise AppError("not_built", "The live LLM adapter isn't built yet. Use mock mode.", 501)

    async def read_image(self, media_id: str, *, fail: bool = False) -> dict[str, str]:
        if not self.key:
            raise not_configured("LLM")
        raise AppError("not_built", "The live LLM adapter isn't built yet. Use mock mode.", 501)
