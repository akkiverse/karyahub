"""The second wall between businesses: Postgres row-level security (ADR-0013).

Every business-data table has a policy ``business_id = current_setting('app.business_id', true)``. A request
that touches those tables calls :func:`scope` first, which sets that value for the current transaction and,
where the database allows it, switches to the restricted role ``karyahub_app`` (the connection's
role may bypass
policies, as Neon's default owner does). Both effects end with the transaction, as the pooler needs.
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

APP_ROLE = "karyahub_app"
TABLES = ("records", "sync_ops", "counters", "device_imports")
POLICY = "business_wall"

# What this server process found out when it started (see probe).
STATE: dict = {"role": False, "status": "not_applicable"}


def reset() -> None:
    STATE.update(role=False, status="not_applicable")


def _postgres(db: AsyncSession) -> bool:
    return db.get_bind().dialect.name == "postgresql"


async def scope(db: AsyncSession, business_id: str) -> None:
    """From here to the end of the transaction, this session sees only this business's rows."""
    if not _postgres(db):
        return
    await db.execute(text("select set_config('app.business_id', :b, true)"), {"b": business_id})
    if STATE["role"]:
        await db.execute(text(f"SET LOCAL ROLE {APP_ROLE}"))


async def unscope(db: AsyncSession) -> None:
    """Back to the connection's own role, for statements on other tables (the activity log)."""
    if _postgres(db) and STATE["role"]:
        await db.execute(text("RESET ROLE"))


async def probe(engine: AsyncEngine) -> None:
    """Find out, once per process, whether the wall is really up. Never raises."""
    if engine.dialect.name != "postgresql":
        reset()
        return
    status, use_role = "off: policies are missing", False
    try:
        async with engine.connect() as conn:
            listed = ", ".join(f"'{t}'" for t in TABLES)
            policies = (
                await conn.execute(
                    text(
                        f"select count(*) from pg_policies where policyname = '{POLICY}' "
                        f"and tablename in ({listed})"
                    )
                )
            ).scalar()
            if policies == len(TABLES):
                try:
                    await conn.execute(text(f"SET LOCAL ROLE {APP_ROLE}"))
                    await conn.execute(text("select count(*) from records"))
                    use_role = True
                    status = "on"
                except Exception:
                    await conn.rollback()
                    bypass = (
                        await conn.execute(
                            text("select rolbypassrls or rolsuper from pg_roles where rolname = current_user")
                        )
                    ).scalar()
                    status = (
                        "off: the connection role bypasses policies and the restricted role is not usable"
                        if bypass
                        else "on"
                    )
            await conn.rollback()
    except Exception as exc:  # health must still answer
        status = f"unknown: {type(exc).__name__}"
    STATE.update(role=use_role, status=status)
