"""Inventory (CR-0011): item codes that are unique inside a business, behind row-level security.

Items and stock moves are ordinary rows of the ``records`` table (kinds ``item`` and ``stock_move``), which
already carries ``business_id`` and its policy. The one new table keeps item codes unique per business at the
database, so two phones adding the same code at once cannot both succeed.

Revision ID: 0003
Revises: 0002
"""

import logging

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

log = logging.getLogger("karyahub")
TABLES = ("item_codes",)
APP_ROLE = "karyahub_app"
POLICY = "business_wall"
SCOPE = "business_id = current_setting('app.business_id', true)"


def upgrade() -> None:
    op.create_table(
        "item_codes",
        sa.Column("business_id", sa.String(40), sa.ForeignKey("businesses.id"), primary_key=True),
        sa.Column("code_key", sa.String(24), primary_key=True),
        sa.Column("item_id", sa.String(64), nullable=False),
    )
    op.create_index("ix_item_codes_item", "item_codes", ["business_id", "item_id"])
    if op.get_bind().dialect.name == "postgresql":
        row_level_security()


def rls_statements() -> dict[str, list[str]]:
    """The same second wall as migration 0002, for this migration's table."""
    policies: list[str] = []
    for t in TABLES:
        policies += [
            f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY",
            f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY",
            f"DROP POLICY IF EXISTS {POLICY} ON {t}",
            f"CREATE POLICY {POLICY} ON {t} USING ({SCOPE}) WITH CHECK ({SCOPE})",
        ]
    role = [f"GRANT SELECT, INSERT, UPDATE, DELETE ON {', '.join(TABLES)} TO {APP_ROLE}"]
    return {"policies": policies, "role": role}


def row_level_security() -> None:
    """Each step runs in a savepoint and never stops the migration: a live app must always be able to start,
    and it filters every statement by business anyway (ADR-0013)."""
    bind = op.get_bind()
    steps = rls_statements()
    for statements, what in ((steps["policies"], "row-level security policy"), (steps["role"], "grants")):
        try:
            with bind.begin_nested():
                for statement in statements:
                    bind.execute(sa.text(statement))
        except Exception as exc:  # the database said no; carry on without this step
            log.warning("Migration 0003: skipped %s (%s)", what, type(exc).__name__)


def downgrade() -> None:
    op.drop_index("ix_item_codes_item", "item_codes")
    op.drop_table("item_codes")
