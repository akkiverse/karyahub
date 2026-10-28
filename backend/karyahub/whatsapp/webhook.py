"""Incoming WhatsApp Cloud API webhooks: verify, parse, de-duplicate.

Rules taken from the reference platform's gateway design:
- The GET handshake echoes `hub.challenge` only when `hub.verify_token` matches (constant-time).
- Every POST is checked against `X-Hub-Signature-256` = HMAC-SHA256 of the raw body with the app
  secret, before anything is parsed. A bad or missing signature is refused with 401.
- Messages are identified by their WhatsApp message id; a repeated id is processed once.
- Phone numbers are never echoed back: callers get a keyed hash for matching.
"""

import hashlib
import hmac
from typing import Any

from pydantic import BaseModel


class Inbound(BaseModel):
    id: str
    from_hash: str
    type: str
    text: str = ""
    media_id: str = ""
    timestamp: str = ""


def verify_handshake(mode: str | None, token: str | None, expected: str) -> bool:
    return mode == "subscribe" and bool(expected) and hmac.compare_digest(token or "", expected)


def sign(raw: bytes, secret: str) -> str:
    return "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


def valid_signature(raw: bytes, header: str | None, secret: str) -> bool:
    if not secret or not header:
        return False
    return hmac.compare_digest(sign(raw, secret), header)


def phone_hash(phone: str, secret: str) -> str:
    return hmac.new(secret.encode(), phone.encode(), hashlib.sha256).hexdigest()[:16]


def parse(payload: dict[str, Any], secret: str) -> tuple[list[Inbound], int]:
    """Return (unique messages, duplicates skipped). Status updates are ignored."""
    seen: set[str] = set()
    out: list[Inbound] = []
    dupes = 0
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            for m in value.get("messages") or []:
                mid = str(m.get("id") or "")
                if not mid:
                    continue
                if mid in seen:
                    dupes += 1
                    continue
                seen.add(mid)
                kind = str(m.get("type") or "unknown")
                media = (m.get(kind) or {}) if kind in {"audio", "image", "document"} else {}
                out.append(
                    Inbound(
                        id=mid,
                        from_hash=phone_hash(str(m.get("from") or ""), secret),
                        type=kind,
                        text=str((m.get("text") or {}).get("body") or (media.get("caption") or "")),
                        media_id=str(media.get("id") or ""),
                        timestamp=str(m.get("timestamp") or ""),
                    )
                )
    return out, dupes
