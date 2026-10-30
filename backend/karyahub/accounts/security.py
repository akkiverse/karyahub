"""PIN hashing, phone and PIN rules, and tokens (CR-0005). Nothing here touches the database."""

import hashlib
import hmac
import re
import secrets
from itertools import pairwise

_SCRYPT = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}
_PHONE = re.compile(r"^[6-9]\d{9}$")


def normalise_phone(value: object) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    return digits[2:] if len(digits) == 12 and digits.startswith("91") else digits


def valid_phone(phone: str) -> bool:
    return bool(_PHONE.match(phone))


def pin_problem(pin: object) -> str | None:
    """Why a PIN can't be used, in plain words, or None when it is fine."""
    p = str(pin or "")
    if not re.fullmatch(r"\d{4,6}", p):
        return "Use a PIN of 4 to 6 digits."
    if len(set(p)) == 1:
        return "Pick a PIN that isn't the same digit repeated."
    steps = {int(b) - int(a) for a, b in pairwise(p)}
    if steps in ({1}, {-1}):
        return "Pick a PIN that isn't a simple run like 1234 or 4321."
    return None


def generate_pin() -> str:
    while True:
        pin = f"{secrets.randbelow(900000) + 100000}"
        if pin_problem(pin) is None:
            return pin


def _prehash(pin: str, pepper: str) -> bytes:
    return hmac.new(pepper.encode(), pin.encode(), hashlib.sha256).digest()


def hash_pin(pin: str, pepper: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(_prehash(pin, pepper), salt=salt, **_SCRYPT)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_pin(pin: str, stored: str | None, pepper: str) -> bool:
    """Constant-time check. A missing account still costs a hash, so timing doesn't reveal who exists."""
    try:
        _, salt_hex, digest_hex = (stored or "scrypt$00$00").split("$")
        salt, want = bytes.fromhex(salt_hex), bytes.fromhex(digest_hex)
    except ValueError:
        salt, want = b"\x00", b"\x00"
        stored = None
    got = hashlib.scrypt(_prehash(pin, pepper), salt=salt, **_SCRYPT)
    return bool(stored) and hmac.compare_digest(got, want)


def new_token() -> tuple[str, str]:
    """(cookie value, what we store). Only the hash is kept, so a database leak can't sign anyone in."""
    token = secrets.token_urlsafe(32)
    return token, token_hash(token)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_id(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(8)}"
