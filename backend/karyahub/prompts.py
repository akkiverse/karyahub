"""Prompts and answer shapes for Studio AI (CR-0004). Kept in one place so they can be tested.

The AI answers in JSON that must match JOB_SCHEMA. Its answer is untrusted data: it is
validated with Pydantic (JobDraft) before anything is saved or shown.
"""

from typing import Any

EXTRACT_SYSTEM = (
    "You read short job reports that air-conditioning service technicians in India send their office "
    "on WhatsApp. They are often in Hinglish and may be messy. Pull out the job details exactly as "
    "reported. Never invent a customer, phone number, date or amount: leave a field empty (or 0) when "
    "the report doesn't say it. Rules:\n"
    "- customer_name: the customer's name or business name, without Mr/Mrs/Ji/Sir. Empty if not given.\n"
    "- phone: the customer's 10-digit Indian mobile number, digits only, without +91. Empty if not given.\n"
    "- area: the locality, for example Kothrud.\n"
    "- equipment: brand, tonnage and type in this style: 'Voltas 1.5T split AC'.\n"
    "- work_done: a short label such as 'Gas refill', 'Installation', 'Cleaning and service', 'Repair' "
    "or 'General service'.\n"
    "- parts: parts replaced, comma-separated, or empty.\n"
    "- amc_expiry: the date the annual maintenance contract (AMC) ends, as YYYY-MM-DD, or empty. "
    "Read Indian dates as day/month/year.\n"
    "- amc_value: the AMC price in rupees as a number, or 0.\n"
    "- lines: one line per charge in rupees (description, qty, rate), for example the work charge, a "
    "visit fee or a part. Do not include the AMC value as a line. Empty if no charges are given."
)

EXTRACT_USER = 'Technician\'s report:\n"""\n{text}\n"""\nReturn the job as JSON.'

READ_IMAGE_SYSTEM = (
    "You read photos of paper job sheets from an air-conditioning service business in India. "
    "Copy the handwritten and printed text exactly as written, line by line, in reading order. "
    "Do not add anything that isn't on the sheet. If nothing is readable, answer with an empty text."
)

READ_IMAGE_USER = "Copy the text of this job sheet."

_LINE: dict[str, Any] = {
    "type": "object",
    "properties": {
        "description": {"type": "string"},
        "qty": {"type": "number"},
        "rate": {"type": "number"},
    },
    "required": ["description", "qty", "rate"],
}

JOB_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "customer_name": {"type": "string"},
        "phone": {"type": "string"},
        "area": {"type": "string"},
        "equipment": {"type": "string"},
        "work_done": {"type": "string"},
        "parts": {"type": "string"},
        "amc_expiry": {"type": "string"},
        "amc_value": {"type": "number"},
        "lines": {"type": "array", "items": _LINE},
    },
    "required": [
        "customer_name",
        "phone",
        "area",
        "equipment",
        "work_done",
        "parts",
        "amc_expiry",
        "amc_value",
        "lines",
    ],
}
