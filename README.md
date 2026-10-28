# KaryaHub

Turn technicians' WhatsApp voice notes into job records, quotes and AMC renewal reminders.

**Live:** https://karyahub-akkiverse.vercel.app
**Part of:** [Idea Studio by AkkiVerse](https://idea-studio-akkiverse.vercel.app)

## What it does

KaryaHub is a demo prototype for AMC (annual maintenance contract) service firms such as AC service companies. It explains the problem owners face (lapsed renewals, re-typed job sheets, no view of field work), then plays a simulated WhatsApp conversation: a technician's voice note or job-sheet photo is transcribed, turned into a structured job record the owner can correct and approve, then into a quotation or GST-format invoice and a renewal reminder. Every outside service (WhatsApp, speech-to-text, LLM) sits behind an adapter that returns mock responses, so the demo runs with no accounts, keys or payments. All names, phone numbers and GSTINs are dummy data.

## Status

| | |
|---|---|
| Stage | Live: v0.2.0 at https://karyahub-akkiverse.vercel.app |
| Acceptance tests | 75 of 75 passing in v0.2.0 ([report](docs/quality/TEST-REPORT.md)) |
| Latest change | [CR-0003](docs/changes/CR-0003-business-look-admin-and-staff-logins.md): business look, Admin panel and staff logins (released in v0.2.0 with [CR-0002](docs/changes/CR-0002-advance-tech.md): KaryaHub server, WhatsApp webhook, proof of work, AMC visit plans) |
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

No environment variables are needed: the server runs in mock mode with built-in demo secrets. To go live, set `KARYAHUB_MODE=live` and the `KARYAHUB_*` keys listed in [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md#integrations-and-adapters); live mode refuses to run a feature whose key is missing.

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
