# ADR-0005: Add a Python FastAPI back end; keep the plain JavaScript UI for now

- **Status:** Accepted
- **Date:** 2026-10-28
- **Change request:** CR-0002

## Context
v0.1 ran entirely in the browser (no back end), with live adapters as stubs. The founder asked to "advance" KaryaHub using the architecture of his reference platform (Kritvo), which runs on Python and FastAPI. The Idea Studio stack policy says Python on the back end, always, and that business rules belong on the server once there is one. Real WhatsApp, speech and LLM calls need secrets that must never reach the browser, and WhatsApp needs a public webhook.

## Decision
Move KaryaHub from "no back end" to the tier R layout: a FastAPI app in `api/index.py` (code in `backend/karyahub/`), all routes under `/api`, one Vercel project with the static UI. Python 3.12 with uv, Pydantic v2, pydantic-settings, Ruff and pytest. The web app calls the API through `src/api/client.js`.

The UI stays plain JavaScript (ADR-0002) for this change instead of moving to React or Vue with TypeScript. Rewriting six working screens in the same change would put the live demo at risk for no visible gain; the move to a framework gets its own change request when the screens grow (technician view, Hindi).

## Options considered
| Option | Pros | Cons |
|---|---|---|
| FastAPI under /api, keep plain JS UI (chosen) | Small, safe step; secrets server-side; webhook possible; matches reference stack | UI is not yet TypeScript; small duplication for the offline Chat fallback |
| FastAPI plus rewrite UI in React + TS now | Fully matches tier R | Large change, high regression risk to the live demo |
| Keep no back end | Nothing new to run | Keys can't be used safely; no webhook; business rules stay in the browser |

## Consequences
- Easier: real services are configuration plus a live adapter; the webhook exists; rules are tested once in Python.
- Harder: two test suites (pytest and Vitest) and two toolchains in CI.
- Watch: Vercel Python cold starts (keep dependencies small), and the browser fallback drifting from the server (RISKS R-14).
