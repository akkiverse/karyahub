"""LLM. Interface: async extract_job(text) -> Extraction; async read_image(media_id, image_b64) -> {text}.

Three implementations:
- StudioAiLlm (CR-0004): the founder's own AI server through the Studio AI kit. Used whenever
  the AI settings (AI_ENDPOINTS) are present. If the AI server is offline it falls back to the
  quick reader and says so, so a technician's message is never lost.
- MockLlm: bundled demo answers and the quick reader (heuristic parser). Used when AI isn't set up.
- LiveLlm: the old key-based stub, kept for live mode without Studio AI (fails closed).
"""

import base64
import binascii
import re
from datetime import date
from typing import Any

from pydantic import ValidationError

from karyahub import prompts, studio_ai
from karyahub.domain.extraction import Extraction, JobDraft, Line, extract_job, sample_by_id
from karyahub.errors import READ_FAILED, AppError, not_configured

# Each AI call must finish well inside the 60-second Vercel function limit (vercel.json).
AI_STEP_SECONDS = 40.0
MAX_IMAGE_BYTES = 3_000_000

OFFLINE_NOTICE = "AI is offline right now, so this was read without AI. Check the details before approving."
UNREADABLE_NOTICE = (
    "The AI answer couldn't be used, so this was read without AI. Check the details before approving."
)
NO_IMAGE_NOTICE = "No photo was sent, so the sample job sheet's stored text was used."
PHOTO_UNREADABLE = "Couldn't read any text in this photo. Try a clearer photo, or type the details."
BAD_IMAGE = "That photo isn't a JPEG, PNG or WebP image."
IMAGE_TOO_BIG = "That photo is too large. Send one under 3 MB."


class MockLlm:
    name = "mock"

    async def extract_job(self, text: str, *, fail: bool = False) -> Extraction:
        if fail:
            raise AppError("read_failed", READ_FAILED, 422)
        return extract_job(text).model_copy(update={"reader": "demo"})

    async def read_image(
        self, media_id: str, *, image_b64: str | None = None, fail: bool = False
    ) -> dict[str, str]:
        sample = sample_by_id(media_id)
        if fail or sample is None or sample["kind"] != "photo":
            raise AppError("read_failed", READ_FAILED, 422)
        return {"text": sample["mock_transcript"], "reader": "demo", "notice": ""}


class LiveLlm:
    name = "live"

    def __init__(self, key: str) -> None:
        self.key = key

    async def extract_job(self, text: str, *, fail: bool = False) -> Extraction:
        if not self.key:
            raise not_configured("LLM")
        raise AppError("not_built", "The live LLM adapter isn't built yet. Use mock mode.", 501)

    async def read_image(
        self, media_id: str, *, image_b64: str | None = None, fail: bool = False
    ) -> dict[str, str]:
        if not self.key:
            raise not_configured("LLM")
        raise AppError("not_built", "The live LLM adapter isn't built yet. Use mock mode.", 501)


# ---------------- Studio AI ----------------
def _quick(text: str, notice: str) -> Extraction:
    """The quick reader (bundled answers, then the heuristic parser), labelled as read without AI."""
    return extract_job(text).model_copy(update={"reader": "quick", "notice": notice})


def _phone(value: Any) -> str:
    digits = re.sub(r"\D", "", str(value or ""))[-10:]
    return digits if len(digits) == 10 and digits[0] in "6789" else ""


def _iso_date(value: Any) -> str:
    s = str(value or "").strip()
    try:
        return date.fromisoformat(s).isoformat() if re.fullmatch(r"\d{4}-\d{2}-\d{2}", s) else ""
    except ValueError:
        return ""


def _money(value: Any) -> float:
    try:
        n = float(str(value).replace(",", "").replace("₹", "").strip() or 0)
    except ValueError:
        return 0
    if n < 0:
        return 0
    return int(n) if n.is_integer() else n


def _lines(raw: Any) -> list[Line]:
    out: list[Line] = []
    for item in raw if isinstance(raw, list) else []:
        if not isinstance(item, dict):
            continue
        desc = str(item.get("description") or "").strip()[:200]
        qty = _money(item.get("qty") or 1) or 1
        rate = _money(item.get("rate"))
        if desc:
            out.append(Line(description=desc, qty=qty, rate=rate))
    return out[:20]


def job_from_ai(data: Any) -> Extraction:
    """Validate the AI's JSON (untrusted) into an Extraction. Raises ValueError if it isn't usable."""
    if not isinstance(data, dict):
        raise ValueError("not an object")
    text = {k: str(data.get(k) or "").strip()[:200] for k in ("customer_name", "area", "equipment", "parts")}
    name = re.sub(r"^(Mr|Mrs|Ms|Dr|Shri|Smt)\.?\s+", "", text["customer_name"], flags=re.I)
    name = re.sub(r"\s(Ji|Sir|Madam)$", "", name, flags=re.I).strip()
    if not name:
        return Extraction(found=False, missing=["customer_name"], reader="ai")
    work = str(data.get("work_done") or "").strip()[:120] or "Service visit"
    try:
        job = JobDraft(
            customer_name=name,
            phone=_phone(data.get("phone")),
            area=text["area"],
            equipment=text["equipment"],
            work_done=work,
            parts=text["parts"],
            amc_expiry=_iso_date(data.get("amc_expiry")),
            amc_value=_money(data.get("amc_value")),
            lines=_lines(data.get("lines")) or [Line(description=work, qty=1, rate=0)],
        )
    except ValidationError as exc:
        raise ValueError("invalid job") from exc
    return Extraction(found=True, job=job, reader="ai")


def _decode_image(image_b64: str) -> bytes:
    raw = image_b64.split(",", 1)[1] if image_b64.startswith("data:") else image_b64
    try:
        data = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise AppError("bad_image", BAD_IMAGE, 422) from exc
    if len(data) > MAX_IMAGE_BYTES:
        raise AppError("image_too_large", IMAGE_TOO_BIG, 413)
    is_jpeg = data[:3] == b"\xff\xd8\xff"
    is_png = data[:8] == b"\x89PNG\r\n\x1a\n"
    is_webp = data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    if not (is_jpeg or is_png or is_webp):
        raise AppError("bad_image", BAD_IMAGE, 422)
    return data


class StudioAiLlm:
    """The founder's own AI server (qwen3.5:9b) through the Studio AI kit."""

    name = "studio-ai"

    async def extract_job(self, text: str, *, fail: bool = False) -> Extraction:
        if fail:
            raise AppError("read_failed", READ_FAILED, 422)
        messages = [
            {"role": "system", "content": prompts.EXTRACT_SYSTEM},
            {"role": "user", "content": prompts.EXTRACT_USER.format(text=text)},
        ]
        try:
            reply = await studio_ai.chat(
                messages, json_schema=prompts.JOB_SCHEMA, temperature=0, timeout=AI_STEP_SECONDS
            )
        except studio_ai.AIUnavailable:
            return _quick(text, OFFLINE_NOTICE)
        except studio_ai.AIError:
            return _quick(text, UNREADABLE_NOTICE)
        try:
            return job_from_ai(reply.data)
        except ValueError:
            return _quick(text, UNREADABLE_NOTICE)

    async def read_image(
        self, media_id: str, *, image_b64: str | None = None, fail: bool = False
    ) -> dict[str, str]:
        sample = sample_by_id(media_id)
        sample_text = sample["mock_transcript"] if sample and sample["kind"] == "photo" else ""
        if fail:
            raise AppError("read_failed", READ_FAILED, 422)
        if not image_b64:
            if sample_text:
                return {"text": sample_text, "reader": "demo", "notice": NO_IMAGE_NOTICE}
            raise AppError("read_failed", READ_FAILED, 422)
        image = _decode_image(image_b64)
        messages = [
            {"role": "system", "content": prompts.READ_IMAGE_SYSTEM},
            {"role": "user", "content": prompts.READ_IMAGE_USER},
        ]
        try:
            reply = await studio_ai.chat(
                messages, images=[studio_ai.image_b64(image)], temperature=0, timeout=AI_STEP_SECONDS
            )
        except studio_ai.AIUnavailable:
            if sample_text:
                return {"text": sample_text, "reader": "quick", "notice": OFFLINE_NOTICE}
            raise
        except studio_ai.AIError:
            if sample_text:
                return {"text": sample_text, "reader": "quick", "notice": UNREADABLE_NOTICE}
            raise
        text = reply.text.strip()[:4000]
        if not text:
            raise AppError("read_failed", PHOTO_UNREADABLE, 422)
        return {"text": text, "reader": "ai", "notice": ""}
