"""Customer one-time codes: proof that the customer saw the finished work.

Stateless: the challenge carries the job, tenant and expiry, signed together with the code by a
server secret (HMAC-SHA256), so nothing is stored and the code itself never travels back to the
browser in live mode. Attempt limits need storage and come with the database (see RISKS.md R-07).
"""

import base64
import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta

from karyahub.errors import AppError


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _mac(secret: str, body: str, code: str) -> str:
    return _b64(hmac.new(secret.encode(), f"{body}.{code}".encode(), hashlib.sha256).digest())


def issue(
    job_id: str, tenant_id: str, secret: str, ttl_seconds: int, now: datetime | None = None
) -> tuple[str, str, str]:
    """Return (challenge, code, expires_at)."""
    if not secret:
        raise AppError("not_configured", "Not configured: add OTP secret", 503)
    now = now or datetime.now(UTC)
    expires = now + timedelta(seconds=ttl_seconds)
    body = _b64(
        json.dumps(
            {"j": job_id, "t": tenant_id, "e": int(expires.timestamp()), "n": secrets.token_hex(4)}
        ).encode()
    )
    code = f"{secrets.randbelow(1_000_000):06d}"
    return f"{body}.{_mac(secret, body, code)}", code, expires.isoformat(timespec="seconds")


def verify(
    challenge: str, code: str, job_id: str, tenant_id: str, secret: str, now: datetime | None = None
) -> bool:
    try:
        body, mac = challenge.split(".", 1)
        data = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return False
    if data.get("j") != job_id or data.get("t") != tenant_id:
        return False
    if int(data.get("e", 0)) < int((now or datetime.now(UTC)).timestamp()):
        return False
    code = "".join(ch for ch in str(code) if ch.isdigit())
    return len(code) == 6 and hmac.compare_digest(mac, _mac(secret, body, code))
