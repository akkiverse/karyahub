"""Businesses, people, roles, sessions, sign-in throttle, OTP challenges and the audit log (CR-0005).

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "businesses",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("address", sa.String(200), nullable=False, server_default=""),
        sa.Column("gstin", sa.String(15), nullable=False, server_default=""),
        sa.Column("state_code", sa.String(2), nullable=False, server_default="27"),
        sa.Column("vertical", sa.String(40), nullable=False, server_default="ac_service"),
        sa.Column("language", sa.String(8), nullable=False, server_default="en"),
        sa.Column("amc_visit_every_days", sa.Integer, nullable=False, server_default="90"),
        sa.Column("amc_lead_days", sa.Integer, nullable=False, server_default="7"),
        sa.Column("is_demo", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("business_id", sa.String(40), sa.ForeignKey("businesses.id"), nullable=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("phone", sa.String(10), nullable=False, unique=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("pin_hash", sa.String(200), nullable=False),
        sa.Column("must_change_pin", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("last_sign_in", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_users_business_id", "users", ["business_id"])
    op.create_table(
        "role_permissions",
        sa.Column("business_id", sa.String(40), sa.ForeignKey("businesses.id"), primary_key=True),
        sa.Column("role", sa.String(20), primary_key=True),
        sa.Column("permission", sa.String(40), primary_key=True),
        sa.Column("allowed", sa.Boolean, nullable=False),
    )
    op.create_table(
        "user_permissions",
        sa.Column("user_id", sa.String(40), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("permission", sa.String(40), primary_key=True),
        sa.Column("allowed", sa.Boolean, nullable=False),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(40), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("expires_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_table(
        "sign_in_throttle",
        sa.Column("phone", sa.String(10), primary_key=True),
        sa.Column("failures", sa.Integer, nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime, nullable=True),
    )
    op.create_table(
        "otp_challenges",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("phone", sa.String(10), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("expires_at", sa.DateTime, nullable=False),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("used", sa.Boolean, nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_otp_challenges_phone", "otp_challenges", ["phone"])
    op.create_table(
        "audit_log",
        sa.Column(
            "id", sa.BigInteger().with_variant(sa.Integer, "sqlite"), primary_key=True, autoincrement=True
        ),
        sa.Column("business_id", sa.String(40), nullable=True),
        sa.Column("actor_name", sa.String(60), nullable=False),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("detail", sa.Text, nullable=False, server_default=""),
        sa.Column("at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_audit_log_business_id", "audit_log", ["business_id"])
