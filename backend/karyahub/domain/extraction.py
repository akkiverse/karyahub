"""Turn a technician's message text into a structured job draft.

The mock LLM uses the bundled sample answers and this heuristic parser (the same rules the
browser demo used in CR-0001, so results match). The live LLM adapter replaces it.
"""

import json
import re
from functools import lru_cache
from importlib import resources

from pydantic import BaseModel, Field

MONTHS = {
    m: i
    for i, m in enumerate(
        ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1
    )
}
BRANDS = [
    "Voltas", "Daikin", "LG", "Samsung", "Blue Star", "Carrier", "Hitachi", "Lloyd",
    "Panasonic", "Whirlpool", "Godrej", "O'General", "Haier", "Mitsubishi",
]  # fmt: skip
WORK = [
    (re.compile(r"gas (refill|charging|top.?up)", re.I), "Gas refill"),
    (re.compile(r"(install|installation)", re.I), "Installation"),
    (re.compile(r"(filter )?clean(ing)?|wet service|jet wash", re.I), "Cleaning and service"),
    (re.compile(r"(pcb|repair|fix|capacitor|compressor)", re.I), "Repair"),
    (re.compile(r"(service|servicing|maintenance)", re.I), "General service"),
]
NAME_RE = re.compile(
    r"\b(?:for|at|visited|customer[:\s]+|cust[:\s]+|mr\.?|mrs\.?|ms\.?|shri|smt\.?)\s*"
    r"(?:(?:mr|mrs|ms|dr)\.?\s+)?([A-Z][a-z]+(?:\s[A-Z][a-z]+){1,2})"
)
LEADING_NAME_RE = re.compile(r"^([A-Z][a-z]+\s[A-Z][a-z]+)\b")
PHONE_RE = re.compile(r"(?:\+?91[\s-]?)?(\d[\d\s-]{8,13}\d)")


class Line(BaseModel):
    description: str
    qty: float = Field(1, gt=0)
    rate: float = Field(0, ge=0)


class JobDraft(BaseModel):
    customer_name: str
    phone: str = ""
    area: str = ""
    equipment: str = ""
    work_done: str = "Service visit"
    parts: str = ""
    amc_expiry: str = ""
    amc_value: float = 0
    lines: list[Line] = []


class Extraction(BaseModel):
    found: bool
    job: JobDraft | None = None
    missing: list[str] = []


@lru_cache
def samples() -> list[dict]:
    raw = resources.files("karyahub.data").joinpath("samples.json").read_text(encoding="utf-8")
    return json.loads(raw)


def sample_by_id(sample_id: str) -> dict | None:
    return next((s for s in samples() if s["id"] == sample_id), None)


def _num(s: str) -> float:
    n = float(s.replace(",", ""))
    return int(n) if n.is_integer() else n


def heuristic_extract(text: str) -> Extraction:
    t = str(text or "")
    m = NAME_RE.search(t) or LEADING_NAME_RE.search(t)
    name = ""
    if m:
        name = re.sub(r"^(Mr|Mrs|Ms|Dr|Shri|Smt)\.?\s+", "", m.group(1))
        name = re.sub(r"\s(Ji|Sir|Madam)$", "", name, flags=re.I)
    phone = ""
    for p in PHONE_RE.finditer(t):
        d = re.sub(r"\D", "", p.group(0))[-10:]
        if len(d) == 10 and d[0] in "6789":
            phone = d
            break
    brand = next(
        (b for b in BRANDS if re.search(r"\b" + b.replace("'", "'?") + r"\b", t, re.I)),
        None,
    )
    tons = re.search(r"(\d(?:\.\d)?)\s*(?:t\b|ton|tonne)", t, re.I)
    kind = (
        "window AC"
        if re.search("window", t, re.I)
        else "cassette AC"
        if re.search("cassette", t, re.I)
        else "split AC"
    )
    equipment = (
        " ".join(x for x in [brand, f"{tons.group(1)}T" if tons else "", kind] if x) if brand or tons else ""
    )
    work = next((label for rx, label in WORK if rx.search(t)), "")
    expiry = ""
    d1 = re.search(r"till\s+(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})", t, re.I)
    d2 = re.search(r"till\s+(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", t, re.I)
    if d1 and d1.group(2).lower() in MONTHS:
        expiry = f"{d1.group(3)}-{MONTHS[d1.group(2).lower()]:02d}-{int(d1.group(1)):02d}"
    elif d2:
        year = f"20{d2.group(3)}" if len(d2.group(3)) == 2 else d2.group(3)
        expiry = f"{year}-{int(d2.group(2)):02d}-{int(d2.group(1)):02d}"
    amc = re.search(r"amc[^.]*?(?:rs\.?|₹|value|for|,)\s*([\d,]{3,})", t, re.I)
    charge = re.search(r"(?:charge|charged|rs\.?|₹)\s*([\d,]{3,})", t, re.I)
    lines: list[Line] = []
    if work and charge:
        lines.append(
            Line(description=f"{work}, {equipment}" if equipment else work, qty=1, rate=_num(charge.group(1)))
        )
    if not name:
        return Extraction(found=False, missing=["customer_name"])
    area = re.search(r"\bin\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)", t)
    return Extraction(
        found=True,
        job=JobDraft(
            customer_name=name,
            phone=phone,
            area=area.group(1) if area else "",
            equipment=equipment,
            work_done=work or "Service visit",
            amc_expiry=expiry,
            amc_value=_num(amc.group(1)) if amc else 0,
            lines=lines or [Line(description=work or "Service visit", qty=1, rate=0)],
        ),
    )


def extract_job(text: str) -> Extraction:
    sample = next((s for s in samples() if s["mock_transcript"] == text), None)
    if sample:
        return Extraction(found=True, job=JobDraft(**sample["mock_extraction"]))
    return heuristic_extract(text)
