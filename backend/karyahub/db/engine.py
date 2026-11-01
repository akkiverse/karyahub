"""Database connection, startup migrations and the demo business (CR-0005, ADR-0012).

Neon hands out a ``postgresql://...?sslmode=require`` address. SQLAlchemy's async driver wants
``postgresql+asyncpg://`` and an ``ssl`` argument instead of ``sslmode``, so we convert it here.
Vercel Functions come and go, so connections aren't pooled in the app (Neon's own pooler does that).
"""

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from karyahub.settings import Settings

MEMORY_URL = "sqlite+aiosqlite://"
# The newest migration. A test keeps this equal to the migrations folder. When the database is already there,
# starting up costs one cheap query instead of loading Alembic.
SCHEMA_HEAD = "0003"
_ADVISORY_LOCK = 727_001
_engines: dict[str, AsyncEngine] = {}
_loops: dict[str, asyncio.AbstractEventLoop] = {}
_ready: dict[str, asyncio.Lock | bool] = {}


def async_url(url: str) -> tuple[str, dict]:
    """(SQLAlchemy URL, connect arguments) for whatever address the environment gives us."""
    if not url:
        return MEMORY_URL, {}
    if url.startswith("sqlite"):
        return url, {}
    parts = urlsplit(url)
    scheme = "postgresql+asyncpg"
    # Neon and Vercel add options (sslmode, channel_binding, pgbouncer, connect_timeout...). asyncpg rejects
    # the ones it doesn't know, so none are passed on; SSL is set through connect_args below.
    connect_args: dict = {"statement_cache_size": 0}  # Neon's pooler runs in transaction mode
    if "sslmode=disable" not in parts.query and parts.hostname not in {"localhost", "127.0.0.1"}:
        connect_args["ssl"] = True
    return urlunsplit((scheme, parts.netloc, parts.path, "", "")), connect_args


def get_engine(settings: Settings) -> AsyncEngine:
    """The engine for this database. For Postgres, connections are kept and reused between requests.

    A connection can only be used on the event loop that opened it. If the server ever runs a request on a
    different loop, the old pool is dropped (without touching the dead loop) and a fresh one is made, so
    reuse is a speed-up that can never turn into an error.
    """
    key = settings.database_url or MEMORY_URL
    url, args = async_url(settings.database_url)
    if url.startswith("sqlite"):
        if key not in _engines:
            _engines[key] = create_async_engine(
                url, poolclass=StaticPool, connect_args={"check_same_thread": False}
            )
        return _engines[key]
    loop = asyncio.get_running_loop()
    if key in _engines and _loops.get(key) is loop:
        return _engines[key]
    if key in _engines:
        _engines[key].sync_engine.dispose(close=False)
    _engines[key] = create_async_engine(
        url,
        connect_args=args,
        pool_size=3,
        max_overflow=2,
        pool_pre_ping=True,  # a connection that went stale while the server slept is replaced, not failed on
        pool_recycle=240,
        pool_timeout=15,
    )
    _loops[key] = loop
    return _engines[key]


def _upgrade(sync_conn) -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config()
    cfg.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    cfg.attributes["connection"] = sync_conn
    command.upgrade(cfg, "head")


async def _schema_current(engine: AsyncEngine) -> bool:
    try:
        async with engine.connect() as conn:
            return (
                await conn.execute(text("select version_num from alembic_version"))
            ).scalar() == SCHEMA_HEAD
    except Exception:
        return False


async def ensure_ready(engine: AsyncEngine, key: str) -> None:
    """Bring the schema up to date and make sure the demo business exists. Runs once per process."""
    if _ready.get(key) is True:
        return
    lock = _ready.setdefault(key, asyncio.Lock())
    assert isinstance(lock, asyncio.Lock)
    async with lock:
        if _ready.get(key) is True:
            return
        if not await _schema_current(engine):
            async with engine.begin() as conn:
                if conn.dialect.name == "postgresql":
                    await conn.execute(text(f"select pg_advisory_xact_lock({_ADVISORY_LOCK})"))
                await conn.run_sync(_upgrade)
        from karyahub.accounts import demo  # imported here: demo needs the models, models need no demo

        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            await demo.ensure_demo(db)
        from karyahub.data import rls  # same reason: keeps this module free of the data package

        await rls.probe(engine)
        _ready[key] = True


def forget_engines() -> None:
    """For tests: drop cached engines so each test starts with a fresh in-memory database."""
    from karyahub.data import rls

    _engines.clear()
    _loops.clear()
    _ready.clear()
    rls.reset()


async def db_session(settings: Settings) -> AsyncIterator[AsyncSession]:
    if settings.uses_real_database and not settings.pepper():
        from karyahub.errors import AppError

        raise AppError("not_configured", "Not configured: add KARYAHUB_PIN_PEPPER", 503)
    engine = get_engine(settings)
    await ensure_ready(engine, settings.database_url or MEMORY_URL)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        yield db
