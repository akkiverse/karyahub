"""Tenant configuration. Onboarding a business is adding one entry here (later: one database row).

Every record the API returns carries the tenant id, so moving to a shared database with
row-level security (the pattern proven in the reference platform) needs no API change.
"""

from pydantic import BaseModel


class Tenant(BaseModel):
    id: str
    business_name: str
    address: str
    gstin: str
    state_code: str
    vertical: str
    language: str
    amc_visit_every_days: int
    amc_lead_days: int
    is_demo: bool


DEMO_TENANT = Tenant(
    id="t-coolcare-demo",
    business_name="CoolCare AC Services",
    address="Shop 4, Demo Lane, Kothrud, Pune 411038",
    gstin="27AAAAA0000A1Z5",
    state_code="27",
    vertical="ac_service",
    language="en",
    amc_visit_every_days=90,
    amc_lead_days=7,
    is_demo=True,
)

TENANTS: dict[str, Tenant] = {DEMO_TENANT.id: DEMO_TENANT}


def get_tenant(tenant_id: str | None = None) -> Tenant:
    return TENANTS.get(tenant_id or DEMO_TENANT.id, DEMO_TENANT)
