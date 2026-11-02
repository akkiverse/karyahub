"""Bills that are right (CR-0012): business type, packs, GST registration, bill look, signature, bill links.

Every business that exists today is a repair and service firm with Field service on and GST Regular
(AC-26.2): existing rows get ``business_type = 'service'`` here and never see the question. Empty ``packs``
means Field service on, as in v0.7.0. Businesses made after this migration start with no type, so their
owner is asked once (AC-26.1); until then nothing they had is hidden.

``doc_links`` finds a bill from its public link without signing in (AC-30.3). It holds only the SHA-256
of the token, the business and the document id, so it has no row-level security: the public page reads the
bill itself under that business's scope.

Revision ID: 0004
Revises: 0003
"""

import logging

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

log = logging.getLogger("karyahub")
APP_ROLE = "karyahub_app"


def upgrade() -> None:
    with op.batch_alter_table("businesses") as t:
        t.add_column(sa.Column("business_type", sa.String(12), nullable=True))
        t.add_column(sa.Column("packs", sa.JSON, nullable=True))
        t.add_column(sa.Column("gst_registration", sa.String(14), nullable=False, server_default="regular"))
        t.add_column(sa.Column("bill_look", sa.JSON, nullable=True))
        t.add_column(sa.Column("signature_data", sa.Text, nullable=True))
        t.add_column(sa.Column("signature_version", sa.String(12), nullable=False, server_default=""))
    op.execute("UPDATE businesses SET business_type = 'service' WHERE business_type IS NULL")
    op.create_table(
        "doc_links",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("business_id", sa.String(40), sa.ForeignKey("businesses.id"), nullable=False),
        sa.Column("doc_id", sa.String(64), nullable=False),
    )
    op.create_index("ix_doc_links_doc", "doc_links", ["business_id", "doc_id"])
    if op.get_bind().dialect.name == "postgresql":
        grant_app_role()


def grant_app_role() -> None:
    """A bill is saved while the request runs as the restricted role, so that role may write its link.
    Like migration 0003, a refusal never stops the migration."""
    bind = op.get_bind()
    try:
        with bind.begin_nested():
            bind.execute(sa.text(f"GRANT SELECT, INSERT, UPDATE, DELETE ON doc_links TO {APP_ROLE}"))
    except Exception as exc:  # no restricted role on this database
        log.warning("Migration 0004: skipped grants (%s)", type(exc).__name__)


def downgrade() -> None:
    op.drop_index("ix_doc_links_doc", "doc_links")
    op.drop_table("doc_links")
    with op.batch_alter_table("businesses") as t:
        for name in ("signature_version", "signature_data", "bill_look", "gst_registration", "packs"):
            t.drop_column(name)
        t.drop_column("business_type")
