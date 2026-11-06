"""What kind of business this is, its packs and GST registration, and how its bills look (CR-0012).

US-26: the owner says once what the business does; Field service (jobs, Chat, renewals, AMC, proof of work)
is a pack that can be off. US-30: the bill look (layout, colour, bank, UPI ID, terms, signature) and the
number prefix (AC-28.2). Only people with ``manage_settings`` change these; every change is in the activity
log (AC-26.4), and everyone sees it at their next screen load, because ``/auth/me`` carries it.
"""

import hashlib
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from karyahub import access
from karyahub.accounts import service as accounts
from karyahub.data import logo
from karyahub.db.models import Business
from karyahub.domain import tax
from karyahub.errors import AppError

BUSINESS_TYPES = {
    "service": "Repair and service",
    "trading": "Trader or distributor",
    "shop": "Shop or counter sales",
    "other": "Other",
}
PACKS = {"field_service": "Field service", "trading": "Trading", "shop_counter": "Shop counter"}
READY_PACKS = ("field_service",)  # the others say "Coming soon" (AC-26.1)
REGISTRATION_WORDS = {"regular": "Regular", "composition": "Composition", "unregistered": "Not registered"}
LAYOUTS = ("a4_classic", "a4_modern", "receipt_80")
PICTURE_SIZES = (50, 200)  # the smallest and largest percent of the usual size (US-55)
LOGO_POSITIONS = ("left", "center", "right")  # CR-0019: where the logo goes; the receipt always centres it
# Six brand colours that keep white text and thin accents readable (WCAG AA against white).
COLOURS = ("#0F766E", "#1D4ED8", "#4338CA", "#9F1239", "#15803D", "#334155")
DEFAULT_LOOK: dict[str, Any] = {
    "layout": "a4_classic",
    "logo_position": "left",  # before CR-0019 the logo was always top left
    "logo_size": 100,  # CR-0019, US-55: the logo and the signature as a percent of their usual size
    "signature_size": 100,
    "colour": "#0F766E",
    "phone": "",
    "bank": {"account_name": "", "account_number": "", "ifsc": ""},
    "upi_id": "",
    "terms": "",
    "prefix": "",
    "due_days": 0,  # due on receipt (founder's default, F22)
    "estimate_valid_days": 15,
}
MAX_NUMBER = 16
PREFIX_RE = re.compile(r"^[A-Za-z0-9/-]{0,6}$")
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
ACCOUNT_RE = re.compile(r"^\d{9,18}$")
UPI_RE = re.compile(r"^[A-Za-z0-9._-]{2,64}@[A-Za-z]{2,64}$")
PHONE_RE = re.compile(r"^[0-9 +()-]{0,20}$")
MAX_SIGNATURE = 1024 * 1024  # as stored (CR-0019, US-52); the browser scales a bigger picture down first
BAD_SIGNATURE = "Use a PNG, JPEG or WebP picture of up to 1 MB for the signature."


def look_of(b: Business) -> dict[str, Any]:
    """The bill look with every default filled in."""
    saved = b.bill_look or {}
    look = {**DEFAULT_LOOK, **{k: v for k, v in saved.items() if k in DEFAULT_LOOK}}
    look["bank"] = {**DEFAULT_LOOK["bank"], **(saved.get("bank") or {})}
    return look


def setup_dict(b: Business) -> dict[str, Any]:
    return {
        "business_type": b.business_type or "",
        "setup_needed": b.business_type is None,
        "packs": access.packs_of(b),
        "gst_registration": b.gst_registration or "regular",
        "state_code": b.state_code,
    }


def number_sep(prefix: str) -> str:
    return "" if not prefix or prefix[-1] in "/-" else "/"


def sample_number(prefix: str, fy: str = "26-27", n: int = 1) -> str:
    return f"{prefix}{number_sep(prefix)}{fy}/{n:04d}"


# ---------- type, packs, registration (US-26) ----------
async def put_setup(db: AsyncSession, p: accounts.Principal, fields: dict[str, Any]) -> dict[str, Any]:
    business = accounts._require_business(p)
    accounts.assert_editable(business)
    first_time = business.business_type is None
    kind = fields.get("business_type") or business.business_type
    if kind not in BUSINESS_TYPES:
        raise AppError("validation_error", "Pick what kind of business you run.", 422)
    registration = fields.get("gst_registration") or business.gst_registration or "regular"
    if registration not in REGISTRATION_WORDS:
        raise AppError("validation_error", tax.MESSAGES["bad_registration"], 422)
    state = str(fields.get("state_code") or business.state_code or "")
    if state not in tax.STATES:
        raise AppError("validation_error", "Pick your state to work out GST.", 422)
    if fields.get("packs") is not None:
        packs = [x for x in fields["packs"] if x in READY_PACKS]
    elif first_time:
        packs = ["field_service"] if kind == "service" else []
    else:
        packs = access.packs_of(business)

    said: list[str] = []
    if first_time or kind != business.business_type:
        said.append(f"business type {BUSINESS_TYPES[kind]}")
    if registration != business.gst_registration:
        said.append(f"GST registration {REGISTRATION_WORDS[registration]}")
    if state != business.state_code:
        said.append(f"state {tax.state_label(state)}")
    before = access.packs_of(business)
    for pack in READY_PACKS:
        if (pack in packs) != (pack in before) or (first_time and pack in packs):
            said.append(f"{PACKS[pack]} {'on' if pack in packs else 'off'}")
    business.business_type = kind
    business.gst_registration = registration
    business.state_code = state
    business.packs = sorted(packs)
    if said:
        await accounts.audit(db, business.id, p.user.name, "business_setup", "Set " + ", ".join(said))
    await db.commit()
    return setup_dict(business)


# ---------- bill look (US-30) and number prefix (AC-28.2) ----------
def _clean_look(raw: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    look = {**current, **{k: v for k, v in raw.items() if k in DEFAULT_LOOK and v is not None}}
    if look["layout"] not in LAYOUTS:
        raise AppError("validation_error", "Pick a layout: A4 classic, A4 modern or small receipt.", 422)
    if look["logo_position"] not in LOGO_POSITIONS:
        raise AppError(
            "validation_error", "Pick where the logo goes: top left, top centre or top right.", 422
        )
    for key, name in (("logo_size", "logo"), ("signature_size", "signature")):
        size = look[key]
        if (
            isinstance(size, bool)
            or not isinstance(size, int)
            or not PICTURE_SIZES[0] <= size <= PICTURE_SIZES[1]
        ):
            raise AppError(
                "validation_error",
                f"Pick a size for the {name} from {PICTURE_SIZES[0]}% to {PICTURE_SIZES[1]}%.",
                422,
            )
    look["colour"] = str(look["colour"]).upper()
    if look["colour"] not in COLOURS:
        raise AppError("validation_error", "Pick one of the six colours.", 422)
    prefix = str(look["prefix"] or "").strip().upper()
    if not PREFIX_RE.match(prefix):
        raise AppError("validation_error", "A prefix has up to 6 letters, digits, / or -.", 422)
    if len(sample_number(prefix)) > MAX_NUMBER:
        raise AppError(
            "validation_error",
            f"That prefix makes numbers like {sample_number(prefix)}, longer than 16 characters. "
            "Use a shorter one.",
            422,
        )
    look["prefix"] = prefix
    bank = {**current["bank"], **(raw.get("bank") or {})}
    bank = {k: str(bank.get(k) or "").strip() for k in DEFAULT_LOOK["bank"]}
    bank["ifsc"] = bank["ifsc"].upper()
    if bank["account_number"] and not ACCOUNT_RE.match(bank["account_number"]):
        raise AppError("validation_error", "An account number has 9 to 18 digits.", 422)
    if bank["ifsc"] and not IFSC_RE.match(bank["ifsc"]):
        raise AppError("validation_error", "An IFSC has 11 characters, like SBIN0001234.", 422)
    if len(bank["account_name"]) > 60:
        raise AppError("validation_error", "Keep the account name under 60 characters.", 422)
    look["bank"] = bank
    look["upi_id"] = str(look["upi_id"] or "").strip()
    if look["upi_id"] and not UPI_RE.match(look["upi_id"]):
        raise AppError("validation_error", "A UPI ID looks like name@bank.", 422)
    look["phone"] = str(look["phone"] or "").strip()
    if not PHONE_RE.match(look["phone"]):
        raise AppError("validation_error", "Use digits, spaces, + or - for the phone number.", 422)
    look["terms"] = str(look["terms"] or "").strip()
    if len(look["terms"]) > 500:
        raise AppError("validation_error", "Keep the terms under 500 characters.", 422)
    for key, low, high, words in (
        ("due_days", 0, 365, "Bills are due 0 to 365 days after their date."),
        ("estimate_valid_days", 1, 365, "Estimates are valid for 1 to 365 days."),
    ):
        value = look[key]
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise AppError("validation_error", words, 422)
    return look


async def put_look(db: AsyncSession, p: accounts.Principal, raw: dict[str, Any]) -> dict[str, Any]:
    business = accounts._require_business(p)
    accounts.assert_editable(business)
    before = look_of(business)
    look = _clean_look(raw, before)
    business.bill_look = look
    changed = [k for k in DEFAULT_LOOK if before.get(k) != look.get(k)]
    if changed:
        detail = "Changed the bill look"
        if "logo_position" in changed:
            detail += f"; the logo now goes at the top {look['logo_position']}".replace("center", "centre")
        for key, name in (("logo_size", "logo"), ("signature_size", "signature")):
            if key in changed:
                detail += f"; the {name} size is now {look[key]}%"
        if "prefix" in changed:
            detail += f"; numbers from the next bill look like {sample_number(look['prefix'])}"
        await accounts.audit(db, business.id, p.user.name, "bill_look", detail)
    await db.commit()
    return look


async def set_signature(db: AsyncSession, p: accounts.Principal, data_url: str) -> dict[str, Any]:
    business = accounts._require_business(p)
    accounts.assert_editable(business)
    logo.decode_image(
        data_url, max_bytes=MAX_SIGNATURE, message=BAD_SIGNATURE, what="signature", business_id=business.id
    )
    business.signature_data = data_url.strip()
    business.signature_version = hashlib.sha256(data_url.encode()).hexdigest()[:12]
    await accounts.audit(db, business.id, p.user.name, "bill_look", "Changed the signature on bills")
    await db.commit()
    return accounts.business_dict(business)


async def clear_signature(db: AsyncSession, p: accounts.Principal) -> dict[str, Any]:
    business = accounts._require_business(p)
    accounts.assert_editable(business)
    business.signature_data = None
    business.signature_version = ""
    await accounts.audit(db, business.id, p.user.name, "bill_look", "Removed the signature from bills")
    await db.commit()
    return accounts.business_dict(business)


async def signature_bytes(db: AsyncSession, business_id: str) -> tuple[str, bytes] | None:
    data_url = (await db.execute(select(Business.signature_data).where(Business.id == business_id))).scalar()
    if not data_url:
        return None
    try:
        return logo.decode_image(
            data_url,
            max_bytes=MAX_SIGNATURE,
            message=BAD_SIGNATURE,
            what="signature",
            business_id=business_id,
        )
    except AppError:  # a damaged picture is left out (and logged by decode_image); it must never stop a bill
        return None


async def logo_bytes(db: AsyncSession, business_id: str) -> tuple[str, bytes] | None:
    data_url = (await db.execute(select(Business.logo_data).where(Business.id == business_id))).scalar()
    if not data_url:
        return None
    try:
        return logo.decode_image(data_url, what="logo", business_id=business_id)
    except AppError:  # as above
        return None
