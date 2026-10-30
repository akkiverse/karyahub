"""The demo business (CR-0005): sample data for showings, with sign-in accounts shown on the sign-in page.

It is a real business row flagged ``is_demo``, so the public demo goes through the same sign-in and
permission code as every real business. Its team can't be changed by visitors (see service.assert_editable).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from karyahub.accounts import security
from karyahub.db.models import Business, User
from karyahub.settings import DEMO_PIN_PEPPER

DEMO_BUSINESS_ID = "b-demo"
DEMO_PEPPER_NOTE = "Demo accounts are hashed like any other; their PINs are public on purpose."
# (id, name, phone, role, PIN)
DEMO_PEOPLE = [
    ("u-demo-owner", "Akash Mehta", "9900000201", "owner", "2468"),
    ("u-demo-coord", "Priya Nair", "9900000202", "coordinator", "1357"),
    ("u-demo-santosh", "Santosh Pawar", "9900000203", "technician", "8642"),
    ("u-demo-imran", "Imran Khan", "9900000204", "technician", "9753"),
]


async def ensure_demo(db: AsyncSession, pepper: str | None = None) -> None:
    from karyahub.accounts.service import utcnow
    from karyahub.settings import get_settings

    if await db.get(Business, DEMO_BUSINESS_ID):
        return
    pepper = pepper if pepper is not None else (get_settings().pepper() or DEMO_PIN_PEPPER)
    now = utcnow()
    db.add(
        Business(
            id=DEMO_BUSINESS_ID,
            name="CoolCare AC Services",
            address="Shop 4, Demo Lane, Kothrud, Pune 411038",
            gstin="27AAAAA0000A1Z5",
            state_code="27",
            vertical="ac_service",
            language="en",
            amc_visit_every_days=90,
            amc_lead_days=7,
            is_demo=True,
            active=True,
            created_at=now,
        )
    )
    await db.flush()
    for uid, name, phone, role, pin in DEMO_PEOPLE:
        db.add(
            User(
                id=uid,
                business_id=DEMO_BUSINESS_ID,
                name=name,
                phone=phone,
                role=role,
                active=True,
                pin_hash=security.hash_pin(pin, pepper),
                must_change_pin=False,
                created_at=now,
            )
        )
    await db.commit()


async def demo_accounts(db: AsyncSession) -> list[dict]:
    rows = (
        await db.execute(select(User).where(User.business_id == DEMO_BUSINESS_ID, User.active.is_(True)))
    ).scalars()
    pins = {uid: pin for uid, _, _, _, pin in DEMO_PEOPLE}
    return [
        {"name": u.name, "phone": u.phone, "role": u.role, "pin": pins[u.id]} for u in rows if u.id in pins
    ]
