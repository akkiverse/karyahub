"""The tax engine for estimates and bills (CR-0012, ADR-0016). This module is the truth.

Money is whole paise. Quantities, percentages and GST rates are read as exact decimals and scaled to whole
numbers (quantity in thousandths, percent and rate in hundredths), so every step is integer maths and
"rounded" always means half up. ``src/domain/tax.js`` is a line-for-line copy for showing figures while
typing; both run ``tests/fixtures/gst_cases.json`` and must agree to the paisa (AC-27.9).

Order of work for each bill (AC-27.3 to AC-27.7):
1. line amount = quantity × rate, rounded to the paisa;
2. line discount: a % of the amount (rounded) or ₹ up to the amount;
3. bill discount: a % of all lines after line discounts (rounded) or ₹, spread over the lines in proportion,
   each share rounded down, the last line taking what is left;
4. taxable value = what is left; for a price that includes GST, × 100 ÷ (100 + rate), rounded;
5. same state: CGST and SGST each taxable × rate ÷ 2 (rounded); other state: IGST taxable × rate (rounded);
   Composition and Not registered: no tax;
6. total = all taxable values plus taxes, rounded to the rupee, with the difference as round off.
"""

import json
import re
from pathlib import Path
from typing import Any

GST_RATES = ("0", "0.25", "3", "5", "18", "40")
REGISTRATIONS = ("regular", "composition", "unregistered")
STATES: dict[str, str] = json.loads((Path(__file__).with_name("india_states.json")).read_text("utf-8"))
MAX_PAISE = 10_000_000_000_00  # ₹1,000 crore: far above any real bill, well inside exact JS numbers
MAX_QTY = 10_000_000

_DECIMAL = re.compile(r"^\d+(\.\d+)?$")
_GSTIN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
_B36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


class TaxInputError(ValueError):
    """A figure the engine can't work with. ``line`` is the 0-based line, or None for the whole bill."""

    def __init__(self, code: str, message: str, line: int | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.line = line


MESSAGES = {
    "bad_qty": "Give a quantity above 0.",
    "bad_rate": "Give a price of 0 or more.",
    "bad_gst_rate": "Pick a GST rate: 0, 0.25, 3, 5, 18 or 40 %.",
    "bad_discount": "A discount is 0 to 100 %, or up to the line's amount.",
    "bad_bill_discount": "The bill discount is 0 to 100 %, or up to the bill's amount.",
    "bad_registration": "Pick the GST registration: Regular, Composition or Not registered.",
    "bad_place": "Pick the place of supply.",
}


def _fail(code: str, line: int | None = None) -> TaxInputError:
    return TaxInputError(code, MESSAGES[code], line)


def half_up(num: int, den: int) -> int:
    """num ÷ den rounded half up, for num ≥ 0 and den > 0."""
    return (2 * num + den) // (2 * den)


def scaled(value: Any, places: int) -> int | None:
    """An exact decimal (a number or text such as "1.5") as a whole number of 10^-places, or None."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, float):
        text = repr(value)
        text = text[:-2] if text.endswith(".0") else text
    else:
        text = str(value).strip()
    if not _DECIMAL.match(text):
        return None
    whole, _, frac = text.partition(".")
    if len(frac) > places:
        return None
    return int(whole + frac.ljust(places, "0"))


def rate_text(rate_centi: int) -> str:
    """18 → "18", 25 hundredths → "0.25"."""
    whole, frac = divmod(rate_centi, 100)
    return str(whole) if frac == 0 else f"{whole}.{frac:02d}".rstrip("0")


def _gst_rate(value: Any, line: int) -> int:
    rate = scaled(value, 2)
    if rate is None or rate_text(rate) not in GST_RATES:
        raise _fail("bad_gst_rate", line)
    return rate


def _discount(discount: Any, amount: int, code: str, line: int | None) -> int:
    """The discount in paise: a % of ``amount`` (rounded), or ₹ (paise) up to ``amount``."""
    if not discount:
        return 0
    if not isinstance(discount, dict) or discount.get("kind") not in {"percent", "amount"}:
        raise _fail(code, line)
    if discount["kind"] == "percent":
        pct = scaled(discount.get("value", 0), 2)
        if pct is None or pct > 10_000:
            raise _fail(code, line)
        return half_up(amount * pct, 10_000)
    paise = scaled(discount.get("value", 0), 0)
    if paise is None or paise > amount:
        raise _fail(code, line)
    return paise


def _spread(total: int, amounts: list[int]) -> list[int]:
    """Spread ``total`` paise over ``amounts`` in proportion: each share rounded down, the last line with an
    amount taking what is left; a share never passes its line's amount (any excess moves to earlier lines)."""
    shares = [0] * len(amounts)
    base = sum(amounts)
    if total == 0 or base == 0:
        return shares
    with_amount = [i for i, a in enumerate(amounts) if a > 0]
    for i in with_amount[:-1]:
        shares[i] = total * amounts[i] // base
    shares[with_amount[-1]] = total - sum(shares)
    excess = 0
    for i in reversed(with_amount):
        shares[i] += excess
        excess = max(0, shares[i] - amounts[i])
        shares[i] -= excess
    return shares


def tax_mode(registration: str, business_state: str, place_of_supply: str) -> str:
    if registration == "composition":
        return "composition"
    if registration == "unregistered":
        return "none"
    return "intra" if place_of_supply == business_state else "inter"


def compute(bill: dict[str, Any]) -> dict[str, Any]:
    """Work out a bill's figures. Raises :class:`TaxInputError` for a figure that can't be used."""
    registration = bill.get("registration", "regular")
    if registration not in REGISTRATIONS:
        raise _fail("bad_registration")
    business_state = str(bill.get("business_state") or "")
    place = str(bill.get("place_of_supply") or business_state)
    if registration == "regular" and (place not in STATES or business_state not in STATES):
        raise _fail("bad_place")
    mode = tax_mode(registration, business_state, place)
    taxed = mode in {"intra", "inter"}

    lines_in = bill.get("lines") or []
    work: list[dict[str, int]] = []
    for i, line in enumerate(lines_in):
        qty = scaled(line.get("qty"), 3)
        if qty is None or qty <= 0 or qty > MAX_QTY * 1000:
            raise _fail("bad_qty", i)
        rate = scaled(line.get("rate"), 0)
        if rate is None or rate > MAX_PAISE:
            raise _fail("bad_rate", i)
        gst = _gst_rate(line.get("gst_rate", 0), i)
        amount = half_up(qty * rate, 1000)
        line_discount = _discount(line.get("discount"), amount, "bad_discount", i)
        work.append(
            {
                "amount": amount,
                "discount": line_discount,
                "gst": gst,
                "mrp": int(bool(line.get("price_includes_gst"))),
            }
        )

    after = [w["amount"] - w["discount"] for w in work]
    bill_discount = _discount(bill.get("bill_discount"), sum(after), "bad_bill_discount", None)
    shares = _spread(bill_discount, after)

    lines_out: list[dict[str, Any]] = []
    summary: dict[int, dict[str, Any]] = {}
    for w, net_before, share in zip(work, after, shares, strict=True):
        net = net_before - share
        taxable = half_up(net * 10_000, 10_000 + w["gst"]) if taxed and w["mrp"] else net
        cgst = sgst = igst = 0
        if mode == "intra":
            cgst = sgst = half_up(taxable * w["gst"], 20_000)
        elif mode == "inter":
            igst = half_up(taxable * w["gst"], 10_000)
        lines_out.append(
            {
                "amount": w["amount"],
                "discount": w["discount"],
                "bill_discount": share,
                "taxable": taxable,
                "gst_rate": rate_text(w["gst"]),
                "cgst": cgst,
                "sgst": sgst,
                "igst": igst,
            }
        )
        if taxed:
            row = summary.setdefault(
                w["gst"], {"gst_rate": rate_text(w["gst"]), "taxable": 0, "cgst": 0, "sgst": 0, "igst": 0}
            )
            row["taxable"] += taxable
            row["cgst"] += cgst
            row["sgst"] += sgst
            row["igst"] += igst

    totals = {key: sum(ln[key] for ln in lines_out) for key in ("taxable", "cgst", "sgst", "igst")}
    exact = totals["taxable"] + totals["cgst"] + totals["sgst"] + totals["igst"]
    total = half_up(exact, 100) * 100
    totals.update(
        bill_discount=bill_discount,
        round_off=total - exact,
        total=total,
        in_words=rupees_in_words(total // 100),
    )
    return {
        "tax_mode": mode,
        "place_of_supply": place,
        "lines": lines_out,
        "summary": [summary[k] for k in sorted(summary)],
        "totals": totals,
    }


# ---------- words, states and GSTIN ----------
_ONES = [
    "Zero",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
]
_TENS = ["_", "_", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _below_hundred(n: int) -> str:
    if n < 20:
        return _ONES[n]
    tens, ones = divmod(n, 10)
    return _TENS[tens] + (f"-{_ONES[ones]}" if ones else "")


def _below_thousand(n: int) -> str:
    hundreds, rest = divmod(n, 100)
    parts = [f"{_ONES[hundreds]} Hundred"] if hundreds else []
    if rest:
        parts.append(_below_hundred(rest))
    return " ".join(parts)


def number_in_words(n: int) -> str:
    """Indian style: 2,655 → "Two Thousand Six Hundred Fifty-Five"; 1,00,000 → "One Lakh"."""
    if n == 0:
        return "Zero"
    parts = []
    crore, n = divmod(n, 10_000_000)
    lakh, n = divmod(n, 100_000)
    thousand, n = divmod(n, 1000)
    if crore:
        parts.append(f"{number_in_words(crore)} Crore")
    if lakh:
        parts.append(f"{_below_hundred(lakh)} Lakh")
    if thousand:
        parts.append(f"{_below_hundred(thousand)} Thousand")
    if n:
        parts.append(_below_thousand(n))
    return " ".join(parts)


def rupees_in_words(rupees: int) -> str:
    return f"Rupees {number_in_words(rupees)} only"


def state_label(code: str) -> str:
    """ "Maharashtra (27)", as a bill prints the place of supply."""
    return f"{STATES[code]} ({code})" if code in STATES else ""


def gstin_ok(gstin: str) -> bool:
    """15 characters in the GSTIN pattern, a known state and the right check character."""
    text = (gstin or "").strip().upper()
    if not _GSTIN.match(text) or text[:2] not in STATES:
        return False
    total = 0
    for i, ch in enumerate(text[:14]):
        product = _B36.index(ch) * (2 if i % 2 else 1)
        total += product // 36 + product % 36
    return text[14] == _B36[(36 - total % 36) % 36]


def state_of_gstin(gstin: str) -> str:
    return gstin.strip()[:2] if gstin_ok(gstin) else ""
