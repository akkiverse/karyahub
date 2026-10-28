# Reference review: Kritvo (kritvo-api and kritvo-web)

Written for CR-0002. The founder asked the engineers to read the documentation of a similar product he built, understand its architecture, HLD and LLD, and use it to take KaryaHub forward. This page records what we read, what we understood, and what KaryaHub adopts, adapts or leaves for later.

**Sources (read-only, public):**
- https://github.com/AbhishekKumarSingh07/kritvo-api at `0040b96` (2026-10-09): `docs/architecture/HLD.md` (v2.1), `LLD.md` (v1.6), `ARCHITECTURE.md`, `docs/product/PROJECT_CONTEXT.md`, `docs/adr/0001` to `0009`, `docs/status/STATUS.md`, `docs/planning/TASKS.md`, code in `src/kritvo/`, `migrations/`, `tests/`.
- https://github.com/AbhishekKumarSingh07/kritvo-web at `5b9d8d2` (2026-09-18): `README.md`, `src/api-client/`, `src/i18n/`, `src/offline/`.

Nothing was copied from those repositories; KaryaHub's code is its own. Paths below point into kritvo-api unless marked.

## What Kritvo is

A multi-tenant, WhatsApp-first field-service SaaS for contractors who install and maintain equipment under AMC: assets, jobs, attendance, parts, AMC visits and proof of work. Design partner: a DG-set contractor in Delhi NCR. Positioning: "runs your field team on WhatsApp and proves every job was done" (`docs/product/PROJECT_CONTEXT.md`, HLD sections 1 to 6).

KaryaHub serves a neighbouring segment (AC and similar AMC service firms) with a narrower promise: a technician's WhatsApp voice note or job-sheet photo becomes a job record, paperwork and a renewal reminder. The two overlap on WhatsApp intake, jobs, AMC visits and customer proof.

## Architecture as we understood it

### HLD (high level)
- **Modular monolith** in Python (FastAPI, Pydantic v2, SQLAlchemy 2 async, Alembic) on PostgreSQL 16, run as three processes from one codebase: **API**, **WhatsApp gateway** and **worker/scheduler** (HLD 8.1, 12; ADR-0007).
- **Web**: one React + TypeScript + Vite app with three route trees (office, technician PWA, client portal) and an offline outbox in IndexedDB (kritvo-web README; LLD 7).
- **Tenancy**: one shared schema, `tenant_id` on every table, PostgreSQL row-level security forced on, tenant set per transaction (ADR-0001; LLD 2).
- **WhatsApp**: Cloud API directly. The gateway verifies the signature, stores the raw event and answers 200 fast; a worker does the rest. One shared number by default, own number optional (ADR-0002; HLD 7).
- **Background work**: a Postgres-backed queue with a single scheduler leader (ADR-0003, still proposed); daily AMC job creation, escalations, sweeps.
- **Hosting**: AWS Mumbai, Docker images, Terraform planned; S3 for photos and PDFs with short-lived presigned URLs (HLD 12).
- **Compliance**: DPDP Rules 2025 (full obligations from 13 May 2027), CERT-In log retention, GST invoice rules (HLD 11).

### LLD (low level)
- **Modules** (`identity, tenancy, catalog, customers, assets, jobs, dispatch, attendance, evidence, inventory, contracts, billing, notifications, whatsapp, reports, portal, audit`), each with `api / service / models / schemas / events / tasks`, talking only through service interfaces (LLD 1.2).
- **Jobs**: a versioned JSON workflow with four locked states (NEW, WORK_DONE, VERIFIED, CLOSED), **guards** that must pass (checklist complete, evidence, verification) and **effects** run through a transactional outbox. Field actions are **append-only events** with a client operation id for idempotency; office edits use version numbers and `If-Match` (LLD 4; ADR-0004).
- **Proof of work**: customer one-time code is the strongest proof; a 0 to 100 risk score from location, device and photo signals sends doubtful items to review (LLD 8; ADR-0005).
- **WhatsApp gateway**: `X-Hub-Signature-256` HMAC over the raw body with constant-time compare, raw payload stored, de-duplicated by message id, per-phone conversation state, signed short-lived action ids, Flows encryption (LLD 6).
- **AMC**: maintenance plans every N days or N running hours; planned visits with a unique key; jobs created `lead_days` (7) ahead at 06:00; overdue escalation to the coordinator, then the owner after 2 days (LLD 10.3).
- **Auth**: OTP for field staff, password + TOTP for owners, 15-minute access tokens, rotating refresh tokens with family revocation, Postgres rate limits (LLD 12; ADR-0009).
- **Errors**: one problem-details shape with stable codes translated on the client (`src/kritvo/core/errors.py`).
- **Status** (`docs/status/STATUS.md`): foundations, RLS and identity are built and tested (39 tests); jobs, WhatsApp gateway, worker, AMC and the web screens are designed but not yet built. The WhatsApp gateway is blocked on Meta business verification, which needs a registered company.

## What KaryaHub adopts, adapts or defers

| Kritvo idea | KaryaHub decision in CR-0002 | Where |
|---|---|---|
| Python FastAPI back end, Pydantic models, one error shape | **Adopted.** KaryaHub now has a FastAPI API under `/api`; errors use the Idea Studio shape `{"error": {"code", "message"}}` | ADR-0005, `backend/karyahub/` |
| Gateway verifies `X-Hub-Signature-256` on raw bytes before parsing; GET handshake with verify token | **Adopted** | ADR-0006, `backend/karyahub/whatsapp/webhook.py` |
| De-duplicate inbound messages by WhatsApp message id | **Adapted**: within one delivery today; across deliveries once there is a database (RISKS R-04) | ADR-0006 |
| Store raw event, answer 200, process in a worker | **Deferred.** Demo processing is synchronous and fast; a queue comes with the database | RISKS R-05 |
| Workflow with locked states, guards, append-only events, client op ids | **Adopted, smaller**: 7 states, 9 actions, 4 guards, deterministic event ids | ADR-0007, `domain/workflow.py` |
| Customer one-time code as proof of work | **Adopted**, stateless (signed challenge), demo code shown in mock mode | ADR-0008, `domain/otp.py` |
| Risk score from GPS, selfie, photo hash | **Deferred**: KaryaHub has no technician app or camera capture yet | RISKS R-09 |
| AMC planned visits, `lead_days`, unique visit key, escalation | **Adopted** (calendar-based; running hours deferred) | `domain/amc.py` |
| Shared schema with `tenant_id` and forced RLS | **Adapted**: every response carries a tenant id and tenants are configuration today; RLS arrives with the database | ADR-0009 |
| Phones hashed for lookup, never logged | **Adopted** for the webhook: only a keyed hash is returned | `whatsapp/webhook.py` |
| Fail closed when a real secret or sender is missing (Kritvo ADR-0008 startup guard) | **Adopted**: live mode without a secret refuses with 503; demo secrets work only in mock mode | `settings.py` |
| OTP and TOTP login, refresh token rotation | **Deferred**: the demo has no accounts | RISKS R-08 |
| React + TypeScript web app, offline outbox, Hindi strings | **Deferred** to a later CR; the current UI stays plain JavaScript | ADR-0005 |
| Inventory, attendance, billing, client portal | **Out of scope** for KaryaHub's promise | SPEC Out of scope |

## Gaps we noticed in the reference (for the founder)
These do not block KaryaHub; they are worth knowing if Kritvo continues.
- The documented per-IP rate limit and the `Idempotency-Key` table are not in the code yet.
- ADR-0003 (queue) and ADR-0005 (risk score) are still proposed, and most of the build depends on them.
- Several documents disagree with each other (HLD 6.3 vs 7.2 on own numbers, Python 3.12 vs 3.13, a stale README status line).
- WhatsApp, the core differentiator, is the least proven part (no gateway code yet) and waits on company registration.
