"""A business's logo (CR-0009): a small PNG, JPEG or WebP kept in the database and shown on its documents."""

import base64
import binascii
import hashlib
import io
import logging
import re
from typing import Any

from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from karyahub.accounts import service as accounts
from karyahub.db.models import Business
from karyahub.errors import AppError

log = logging.getLogger("karyahub.pictures")  # a line per refused picture, never the picture
MAX_LOGO_BYTES = 1024 * 1024  # as stored; the browser scales a bigger picture down first (CR-0019, US-52)
MAX_SIDE_PX = 4000  # a picture's longest side, so a tiny file can't hide a huge image
DATA_URL = re.compile(r"^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$")
MAGIC = {
    "image/png": lambda b: b.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/jpeg": lambda b: b.startswith(b"\xff\xd8\xff"),
    "image/webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
}
BAD_LOGO = "Use a PNG, JPEG or WebP picture of up to 1 MB for the logo."


def decode_image(
    data_url: str,
    *,
    max_bytes: int = MAX_LOGO_BYTES,
    mimes: tuple[str, ...] = tuple(MAGIC),
    message: str = BAD_LOGO,
    what: str = "logo",
    business_id: str = "",
) -> tuple[str, bytes]:
    """A data URL's picture, checked: one of ``mimes``, up to ``max_bytes``, and really that kind of file.

    Every refusal is logged (US-56) with which picture, why, and its size, never its content.
    """

    def refuse(reason: str, **info: Any) -> AppError:
        facts = " ".join(f"{k}={v}" for k, v in info.items())
        who = business_id or "-"
        log.warning("picture refused: kind=%s reason=%s business=%s %s", what, reason, who, facts)
        return AppError("validation_error", message, 422)

    match = DATA_URL.match(data_url or "")
    if not match:
        seen = re.match(r"data:([\w/+.-]{1,40})[;,]", data_url or "")  # only the kind of file is logged
        if seen and seen.group(1) not in mimes:
            raise refuse("type-not-allowed", mime=seen.group(1))
        if seen:  # an allowed kind of file whose contents are not valid base64
            raise refuse("bad-encoding", mime=seen.group(1))
        raise refuse("not-a-picture-data-url", chars=len(data_url or ""))
    if match.group(1) not in mimes:
        raise refuse("type-not-allowed", mime=match.group(1))
    mime = match.group(1)
    try:
        raw = base64.b64decode(re.sub(r"\s", "", match.group(2)), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise refuse("bad-encoding", mime=mime) from exc
    if not raw:
        raise refuse("empty", mime=mime)
    if len(raw) > max_bytes:
        raise refuse("too-big", mime=mime, bytes=len(raw), limit=max_bytes)
    if not MAGIC[mime](raw):
        raise refuse("not-really-that-type", mime=mime, bytes=len(raw))
    try:  # really a picture, not just a file that starts like one, and not a huge image in a small file
        with Image.open(io.BytesIO(raw)) as picture:
            width, height = picture.size
            picture.load()
    except Exception as exc:
        raise refuse("unreadable", mime=mime, bytes=len(raw), error=type(exc).__name__) from exc
    if not 1 <= width <= MAX_SIDE_PX or not 1 <= height <= MAX_SIDE_PX:
        raise refuse("dimensions", mime=mime, width=width, height=height)
    return mime, raw


async def set_logo(db: AsyncSession, p: accounts.Principal, data_url: str) -> dict:
    business = accounts._require_business(p)
    accounts.assert_editable(business)
    decode_image(data_url, what="logo", business_id=business.id)
    business.logo_data = data_url.strip()
    business.logo_version = hashlib.sha256(data_url.encode()).hexdigest()[:12]
    await accounts.audit(db, business.id, p.user.name, "logo_changed", "Changed the business logo")
    await db.commit()
    return accounts.business_dict(business)


async def clear_logo(db: AsyncSession, p: accounts.Principal) -> dict:
    business = accounts._require_business(p)
    accounts.assert_editable(business)
    business.logo_data = None
    business.logo_version = ""
    await accounts.audit(db, business.id, p.user.name, "logo_changed", "Removed the business logo")
    await db.commit()
    return accounts.business_dict(business)


async def get_logo(db: AsyncSession, p: accounts.Principal) -> tuple[str, bytes]:
    business = accounts._require_business(p)
    data_url = (await db.execute(select(Business.logo_data).where(Business.id == business.id))).scalar()
    if not data_url:
        raise AppError("not_found", "This business has no logo yet.", 404)
    return decode_image(data_url, what="logo", business_id=business.id)
