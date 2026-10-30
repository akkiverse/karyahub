"""Database tables (CR-0005): businesses, their people, sessions and the audit log.

One shared database ("karyahub_master_db") for every business. Each business-owned row carries
``business_id`` and every query is filtered by it (ADR-0012). All times are naive UTC.
"""

from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Business(Base):
    __tablename__ = "businesses"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    address: Mapped[str] = mapped_column(String(200), default="")
    gstin: Mapped[str] = mapped_column(String(15), default="")
    state_code: Mapped[str] = mapped_column(String(2), default="27")
    vertical: Mapped[str] = mapped_column(String(40), default="ac_service")
    language: Mapped[str] = mapped_column(String(8), default="en")
    amc_visit_every_days: Mapped[int] = mapped_column(Integer, default=90)
    amc_lead_days: Mapped[int] = mapped_column(Integer, default=7)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    # None for the platform admin, who runs KaryaHub itself and sees no business data.
    business_id: Mapped[str | None] = mapped_column(ForeignKey("businesses.id"), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(60))
    phone: Mapped[str] = mapped_column(String(10), unique=True)
    role: Mapped[str] = mapped_column(String(20))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    pin_hash: Mapped[str] = mapped_column(String(200))
    must_change_pin: Mapped[bool] = mapped_column(Boolean, default=False)
    last_sign_in: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class RolePermission(Base):
    """A business owner's switch for one permission of one role (coordinator or technician)."""

    __tablename__ = "role_permissions"

    business_id: Mapped[str] = mapped_column(ForeignKey("businesses.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(20), primary_key=True)
    permission: Mapped[str] = mapped_column(String(40), primary_key=True)
    allowed: Mapped[bool] = mapped_column(Boolean)


class UserPermission(Base):
    """An override for one person: allowed or blocked regardless of their role."""

    __tablename__ = "user_permissions"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    permission: Mapped[str] = mapped_column(String(40), primary_key=True)
    allowed: Mapped[bool] = mapped_column(Boolean)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # SHA-256 of the cookie value
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class SignInThrottle(Base):
    """Wrong-PIN counter per phone number, kept whether or not the number has an account."""

    __tablename__ = "sign_in_throttle"

    phone: Mapped[str] = mapped_column(String(10), primary_key=True)
    failures: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class OtpChallenge(Base):
    __tablename__ = "otp_challenges"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    phone: Mapped[str] = mapped_column(String(10), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used: Mapped[bool] = mapped_column(Boolean, default=False)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True
    )
    business_id: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    actor_name: Mapped[str] = mapped_column(String(60))
    action: Mapped[str] = mapped_column(String(40))
    detail: Mapped[str] = mapped_column(Text, default="")
    at: Mapped[datetime] = mapped_column(DateTime)
