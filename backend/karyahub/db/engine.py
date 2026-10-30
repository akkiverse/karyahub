"""Database connection, startup migrations and the demo business (CR-0005, ADR-0012).

Neon hands out a ``postgresql://...?sslmode=require`` address. SQLAlchemy's async driver wants
``postgresql+asyncpg://`` and an ``ssl`` argument instead of ``sslmode``, so we convert it here.
Vercel Functions come and go, so connections aren't pooled in the app (Neon's own pooler does that).
"""

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool, StaticPool

from karyahub.settings import Settings

MEMORY_URL = "sqlite+aiosqlite://"
_ADVISORY_LOCK = 727_001
_engines: dict[str, AsyncEngine] = {}
_ready: dict[str, asyncio.Lock | bool] = {}


def async_url(url: str) -> tuple[str, dict]:
    """(SQLAlchemy URL, connect arguments) for whatever address the environment gives us."""
    if not url:
        return MEMORY_URL, {}
    if url.startswith("sqlite"):
        return url, {}
    parts = urlsplit(url)
    scheme = "postgresql+asyncpg"
    query = [(k, v) for k, v in parse_qsl(parts.query) if k not in {"sslmode", "channel_binding", "options"}]
    connect_args: dict = {"statement_cache_size": 0}  # Neon's pooler runs in transaction mode
    if "sslmode=disable" not in parts.query and parts.hostname not in {"localhost", "127.0.0.1"}:
        connect_args["ssl"] = True
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), "")), connect_args


def get_engine(settings: Settings) -> AsyncEngine:
    key = settings.database_url or MEMORY_URL
    if key not in _engines:
        url, args = async_url(settings.database_url)
        if url.startswith("sqlite"):
            _engines[key] = create_async_engine(
                url, poolclass=StaticPool, connect_args={"check_same_thread": False}
            )
        else:
            _engines[key] = create_async_engine(url, poolclass=NullPool, connect_args=args)
    return _engines[key]


def _upgrade(sync_conn) -> None:
    cfg = Config()
    cfg.set_main_option("script_location", str(Path(__file__).parent / "migrations"))
    cfg.attributes["connection"] = sync_conn
    command.upgrade(cfg, "head")


async def ensure_ready(engine: AsyncEngine, key: str) -> None:
    """Bring the schema up to date and make sure the demo business exists. Runs once per process."""
    if _ready.get(key) is True:
        return
    lock = _ready.setdefault(key, asyncio.Lock())
    assert isinstance(lock, asyncio.Lock)
    async with lock:
        if _ready.get(key) is True:
            return
        async with engine.begin() as conn:
            if conn.dialect.name == "postgresql":
                await conn.execute(text(f"select pg_advisory_xact_lock({_ADVISORY_LOCK})"))
            await conn.run_sync(_upgrade)
        from karyahub.accounts import demo  # imported here: demo needs the models, models need no demo

        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            await demo.ensure_demo(db)
        _ready[key] = True


def forget_engines() -> None:
    """For tests: drop cached engines so each test starts with a fresh in-memory database."""
    _engines.clear()
    _ready.clear()


async def db_session(settings: Settings) -> AsyncIterator[AsyncSession]:
    if settings.uses_real_database and not settings.pepper():
        from karyahub.errors import AppError

        raise AppError("not_configured", "Not configured: add KARYAHUB_PIN_PEPPER", 503)
    engine = get_engine(settings)
    await ensure_ready(engine, settings.database_url or MEMORY_URL)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        yield db
