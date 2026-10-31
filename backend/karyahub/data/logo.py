"""A business's logo (CR-0009): a small PNG, JPEG or WebP kept in the database and shown on its documents."""

import base64
import binascii
import hashlib
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from karyahub.accounts import service as accounts
from karyahub.db.models import Business
from karyahub.errors import AppError

MAX_LOGO_BYTES = 200 * 1024
DATA_URL = re.compile(r"^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$")
MAGIC = {
    "image/png": lambda b: b.startswith(b"\x89PNG\r\n\x1a\n"),
    "image/jpeg": lambda b: b.startswith(b"\xff\xd8\xff"),
    "image/webp": lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP",
}
BAD_LOGO = "Use a PNG, JPEG or WebP picture of up to 200 KB for the logo."


def _decode(data_url: str) -> tuple[str, bytes]:
    match = DATA_URL.match(data_url or "")
    if not match:
        raise AppError("validation_error", BAD_LOGO, 422)
    mime = match.group(1)
    try:
        raw = base64.b64decode(re.sub(r"\s", "", match.group(2)), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise AppError("validation_error", BAD_LOGO, 422) from exc
    if not raw or len(raw) > MAX_LOGO_BYTES or not MAGIC[mime](raw):
        raise AppError("validation_error", BAD_LOGO, 422)
    return mime, raw


async def set_logo(db: AsyncSession, p: accounts.Principal, data_url: str) -> dict:
    business = accounts._require_business(p)
    accounts.assert_editable(business)
    _decode(data_url)
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
    return _decode(data_url)
