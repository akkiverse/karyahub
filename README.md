# KaryaHub

Turn technicians' WhatsApp voice notes into job records, quotes and AMC renewal reminders.

**Live:** https://karyahub-akkiverse.vercel.app
**Part of:** [Idea Studio by AkkiVerse](https://idea-studio-akkiverse.vercel.app)

## What it does

KaryaHub is a portal for AMC (annual maintenance contract) service firms such as AC service companies. Each firm is a separate business with its own people, who sign in with a mobile number and PIN; a public demo business shows how it works. It explains the problem owners face (lapsed renewals, re-typed job sheets, no view of field work), then plays a simulated WhatsApp conversation: a technician's voice note or job-sheet photo is transcribed, turned into a structured job record the owner can correct and approve, then into a quotation or GST-format invoice and a renewal reminder. Every outside service (WhatsApp, speech-to-text, LLM) sits behind an adapter; WhatsApp and speech-to-text return mock responses, and the LLM uses Studio AI (the founder's own AI server) when it's connected, so the demo runs with no accounts, keys or payments. All names, phone numbers and GSTINs are dummy data.

## Status

| | |
|---|---|
| Stage | Live: v0.4.3 at https://karyahub-akkiverse.vercel.app |
| Acceptance tests | 170 of 170 passing in v0.4.3 ([report](docs/quality/TEST-REPORT.md)) |
| Latest release | [CR-0008](docs/changes/CR-0008-ai-over-a-slow-link.md): AI over a slow link (v0.4.3). Before that, [CR-0007](docs/changes/CR-0007-faster-sign-in.md): faster sign-in (v0.4.2). Before that, [CR-0006](docs/changes/CR-0006-clear-feedback-while-saving.md): clear feedback while saving (v0.4.1). Before that, [CR-0005](docs/changes/CR-0005-accounts-and-businesses.md): accounts and businesses on the server (mobile-and-PIN sign-in, platform admin, owners' team and access, forgot-PIN codes, real-business look) (v0.4.0). Before that, [CR-0004](docs/changes/CR-0004-real-ai-studio-ai.md): real AI for job notes and photos through Studio AI, with a labelled "Read without AI" fallback (v0.3.0). Before that, [CR-0003](docs/changes/CR-0003-business-look-admin-and-staff-logins.md): business look, Admin panel and staff logins (released in v0.2.0 with [CR-0002](docs/changes/CR-0002-advance-tech.md): KaryaHub server, WhatsApp webhook, proof of work, AMC visit plans) |
| In review | [CR-0009](docs/changes/CR-0009-business-data-on-server.md): business data on the server (planned v0.5.0). Plan and rules: [docs/plan/ROADMAP.md](docs/plan/ROADMAP.md) |
| Demo sign-in | Owner 99000 00201 / PIN 2468 · Coordinator 99000 00202 / 1357 · Technicians 99000 00203 / 8642 and 99000 00204 / 9753 (sample accounts) |

## Stack

- **Web app:** plain JavaScript modules built with Vite, tested with Vitest ([ADR-0002](docs/adr/0002-vanilla-js-and-vite.md)).
- **KaryaHub server:** Python 3.12, FastAPI, Pydantic v2, managed with uv, tested with pytest, linted with Ruff ([ADR-0005](docs/adr/0005-python-fastapi-back-end.md)). All routes are under `/api`; docs at `/api/docs`.
- **Hosting:** one Vercel project: the Vite build as static files and `api/index.py` as a Python function (`vercel.json`).

## Run it locally

```bash
npm install
uv sync                                        # Python 3.12 and server dependencies
uv run uvicorn api.index:app --port 8000       # the KaryaHub server
npm run dev                                    # the app at http://localhost:5173 (proxies /api to :8000)

npm test                                       # web app acceptance tests
uv run pytest                                  # server acceptance tests
uv run ruff check . && uv run ruff format --check .
npm run build                                  # production build into dist/
```

No environment variables are needed to run locally: the server runs in mock mode with built-in demo secrets and a throwaway in-memory database (so accounts you create disappear when it stops). Sign in with a demo account, or set `KARYAHUB_BOOTSTRAP_TOKEN=anything` and use **First-time setup** to create a platform admin. To go live, set `KARYAHUB_MODE=live` and the `KARYAHUB_*` keys listed in [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md#integrations-and-adapters); live mode refuses to run a feature whose key is missing.

**Accounts and businesses (CR-0005).** On Vercel the server needs these variables (Settings > Environment Variables, Production and Preview):
- `DATABASE_URL`: the Neon database `karyahub_master_db`; the Neon integration sets it. (`KARYAHUB_DATABASE_URL` or `POSTGRES_URL` also work.) Never commit it.
- `KARYAHUB_PIN_PEPPER`: a long random secret mixed into every PIN hash. Required with a real database; keep it, because changing it makes every PIN fail.
- `KARYAHUB_BOOTSTRAP_TOKEN`: another random secret, used once on the **First-time setup** screen to create the platform admin (and to recover that admin's PIN).

Then open the live address, choose **First-time setup**, create the platform admin, sign in, and add a business under **Businesses**: you give the business owner their temporary PIN, and they add their own team in **Admin**. `/api/health` shows `"database": "ok"` when the connection works. Schema changes run automatically when the server starts (Alembic).

**Studio AI (CR-0004):** messages and job-sheet photos are read by the founder's own AI server when the shared Vercel variables `AI_ENDPOINTS` and `AI_GATEWAY_KEY` are linked to this project (see the hub's `templates/product/studio-ai/README.md`). Without them the demo reader is used; when the AI server is off, messages are read without AI and labelled, and a banner says AI is offline. `GET /api/ai/status` reports `{configured, online}`.

## How this repo is organised

This product is built with **spec-driven development**: the spec is the source of truth, every acceptance criterion has an automated test, and every change is recorded with its reason.

| Document | What it answers |
|---|---|
| [docs/product/BRIEF.md](docs/product/BRIEF.md) | Why this product exists, who pays, the business case |
| [docs/spec/SPEC.md](docs/spec/SPEC.md) | What it must do: user stories and acceptance criteria (`AC-x.y`) |
| [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | How it is built: components, data, integrations |
| [docs/architecture/HLD.md](docs/architecture/HLD.md), [LLD.md](docs/architecture/LLD.md) | High-level and low-level design: flows, API, workflow, webhook, deployment |
| [docs/architecture/RISKS.md](docs/architecture/RISKS.md) | Risks and challenges, and how each is resolved |
| [docs/architecture/REFERENCE-REVIEW.md](docs/architecture/REFERENCE-REVIEW.md) | What we learned from the founder's reference platform |
| [docs/adr/](docs/adr/) | Why each significant technical decision was made |
| [docs/changes/](docs/changes/) | Every change request: what changed, why, and its effect on the spec |
| [docs/design/DESIGN.md](docs/design/DESIGN.md) | Visual identity: palette, type, layout |
| [docs/plan/](docs/plan/) | The build plan and task list |
| [docs/quality/TEST-REPORT.md](docs/quality/TEST-REPORT.md) | Each acceptance criterion, its test, and the result |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to make changes, by hand or through Idea Studio |

## Deployment

Hosted on Vercel (one project: static UI plus the Python API function). Every pull request gets a preview; merging to `main` deploys to production at https://karyahub-akkiverse.vercel.app.
