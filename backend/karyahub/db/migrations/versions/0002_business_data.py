"""Business data on the server: records, applied changes, counters, device imports, logo, row-level security.

Added by CR-0009.

Revision ID: 0002
Revises: 0001
"""

import logging

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

log = logging.getLogger("karyahub")
TABLES = ("records", "sync_ops", "counters", "device_imports")
APP_ROLE = "karyahub_app"
POLICY = "business_wall"
SCOPE = "business_id = current_setting('app.business_id', true)"


def upgrade() -> None:
    op.create_table(
        "records",
        sa.Column("business_id", sa.String(40), sa.ForeignKey("businesses.id"), primary_key=True),
        sa.Column("kind", sa.String(12), primary_key=True),
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("number", sa.String(24), nullable=False, server_default=""),
        sa.Column("body", sa.JSON, nullable=False),
        sa.Column("seq", sa.BigInteger, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_records_business_seq", "records", ["business_id", "seq"])
    op.create_table(
        "sync_ops",
        sa.Column("business_id", sa.String(40), sa.ForeignKey("businesses.id"), primary_key=True),
        sa.Column("op_id", sa.String(64), primary_key=True),
        sa.Column("applied_at", sa.DateTime, nullable=False),
        sa.Column("result", sa.JSON, nullable=False),
    )
    op.create_table(
        "counters",
        sa.Column("business_id", sa.String(40), sa.ForeignKey("businesses.id"), primary_key=True),
        sa.Column("name", sa.String(20), primary_key=True),
        sa.Column("value", sa.BigInteger, nullable=False, server_default="0"),
    )
    op.create_table(
        "device_imports",
        sa.Column("business_id", sa.String(40), sa.ForeignKey("businesses.id"), primary_key=True),
        sa.Column("device_id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(40), nullable=False),
        sa.Column("imported_at", sa.DateTime, nullable=False),
        sa.Column("counts", sa.JSON, nullable=False),
    )
    op.add_column("businesses", sa.Column("logo_data", sa.Text, nullable=True))
    op.add_column("businesses", sa.Column("logo_version", sa.String(12), nullable=False, server_default=""))
    if op.get_bind().dialect.name == "postgresql":
        row_level_security()


def rls_statements() -> dict[str, list[str]]:
    """The SQL of the second wall, by step (a test checks that every business-data table is covered)."""
    policies: list[str] = []
    for t in TABLES:
        policies += [
            f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY",
            f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY",
            f"DROP POLICY IF EXISTS {POLICY} ON {t}",
            f"CREATE POLICY {POLICY} ON {t} USING ({SCOPE}) WITH CHECK ({SCOPE})",
        ]
    role = [
        f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') "
        f"THEN CREATE ROLE {APP_ROLE} NOLOGIN NOBYPASSRLS; END IF; END $$",
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON {', '.join(TABLES)} TO {APP_ROLE}",
    ]
    return {"policies": policies, "role": role}


def row_level_security() -> None:
    """The second wall between businesses. Each step runs in a savepoint and never stops the migration:
    a live app must always be able to start, and it filters every statement by business anyway (ADR-0013)."""
    bind = op.get_bind()
    steps = rls_statements()
    _attempt(bind, steps["policies"], "row-level security policies")
    _attempt(bind, steps["role"], "restricted role and grants")
    # The connection's own role must be allowed to switch to the restricted role. PostgreSQL 16 words this
    # differently from older versions, so try both.
    if not _attempt(bind, [f"GRANT {APP_ROLE} TO CURRENT_USER WITH SET TRUE"], "role membership (16+)"):
        _attempt(bind, [f"GRANT {APP_ROLE} TO CURRENT_USER"], "role membership")


def _attempt(bind, statements: list[str], what: str) -> bool:
    try:
        with bind.begin_nested():
            for statement in statements:
                bind.execute(sa.text(statement))
    except Exception as exc:  # the database said no; carry on without this step
        log.warning("Migration 0002: skipped %s (%s)", what, type(exc).__name__)
        return False
    return True


def downgrade() -> None:
    op.drop_column("businesses", "logo_version")
    op.drop_column("businesses", "logo_data")
    for t in ("device_imports", "counters", "sync_ops"):
        op.drop_table(t)
    op.drop_index("ix_records_business_seq", "records")
    op.drop_table("records")
