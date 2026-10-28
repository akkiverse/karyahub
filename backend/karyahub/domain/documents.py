"""GST totals for quotations and invoices.

Money is computed in paise (integers) to avoid rounding drift, then returned in rupees.
Intra-state supply: GST 18% shown as CGST 9% + SGST 9%; inter-state: IGST 18%.
The total is rounded to the rupee with the round-off shown.
"""

from pydantic import BaseModel, Field


class DocLine(BaseModel):
    description: str = ""
    qty: float = 0
    rate: float = 0


class Totals(BaseModel):
    subtotal: float
    cgst: float
    sgst: float
    igst: float = 0
    roundOff: float = Field(serialization_alias="roundOff")
    total: int
    invalid: int


def _valid(line: DocLine) -> bool:
    return line.qty > 0 and line.rate >= 0


def _half_up(n: float) -> int:
    return int(n + 0.5) if n >= 0 else -int(-n + 0.5)


def compute_totals(lines: list[DocLine], *, inter_state: bool = False) -> Totals:
    valid = [ln for ln in lines if _valid(ln)]
    sub_p = _half_up(sum(ln.qty * ln.rate for ln in valid) * 100)
    if inter_state:
        igst_p, cgst_p, sgst_p = _half_up(sub_p * 0.18), 0, 0
    else:
        igst_p, cgst_p, sgst_p = 0, _half_up(sub_p * 0.09), _half_up(sub_p * 0.09)
    exact_p = sub_p + cgst_p + sgst_p + igst_p
    total = _half_up(exact_p / 100)
    return Totals(
        subtotal=sub_p / 100,
        cgst=cgst_p / 100,
        sgst=sgst_p / 100,
        igst=igst_p / 100,
        roundOff=(total * 100 - exact_p) / 100,
        total=total,
        invalid=len(lines) - len(valid),
    )
