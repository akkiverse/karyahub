# CR-0002: Advance Tech: KaryaHub server, secure WhatsApp webhook, proof of work and AMC visit plans

- **Status:** In review
- **Requested by:** Founder (board notes, "New feature: Advance Tech")
- **Date:** 2026-10-28
- **Release:** (set on release; planned v0.2.0, a feature release)
- **Pull request:** see the pull request for branch `cr/0002-advance-tech`

## Why
The founder asked to "advance up the application" using another application he built "with the same kind of implementation": the engineers should go through its documentation, understand its architecture, HLD and LLD, proceed with development, and analyse the risks and challenges with how to resolve them.

v0.1.0 was a browser-only demo. To become a real product KaryaHub needs a server that can hold secrets, receive WhatsApp messages, enforce business rules and prove work was done, built the way the reference platform (Kritvo) is designed.

## What changes
For viewers of the demo:
- Chat now runs through the **KaryaHub server** (Python): each processing step says "KaryaHub server". If the server can't be reached, Chat still works in the browser and says so.
- Each job has **Proof of work**: it starts as "Work done, waiting for customer check"; the owner sends the customer a one-time code (shown on screen in the demo), enters it to mark the job "Verified by customer", then closes it. A history lists every step.
- Each job with an AMC shows **AMC service visits**: a visit every 90 days, the next one due, which are overdue (and who to tell) and when KaryaHub would create the job (7 days ahead).
- **Settings** shows where messages are processed (server, in the browser, or live keys), whether the server is connected, and each service's status and server key.
- The **Jobs** list shows each job's status.

Underneath:
- A FastAPI app (`api/index.py`, `backend/karyahub/`) under `/api` on the same Vercel project: pipeline endpoints, a secure **WhatsApp Cloud API webhook** (handshake, `X-Hub-Signature-256` check on the raw body, de-duplication by message id, hashed phones), a pure **job workflow engine** (states, guards, append-only events, idempotent operation ids), **customer codes** (signed, time-limited, stateless), an **AMC visit planner**, GST totals in paise and reminder text, tenant configuration, and one error shape.
- Server adapters for speech, LLM and WhatsApp, mock or live, with keys only in `KARYAHUB_*` environment variables; live mode without a key fails closed.
- Browser data moves to version 2 with a migration, so data saved by v0.1.0 keeps working.
- Engineering documents: `docs/architecture/HLD.md`, `LLD.md`, `RISKS.md` (17 risks with resolutions) and `REFERENCE-REVIEW.md` (what we learned from the reference and what we adopt, adapt or defer).

Not in this change (recorded in RISKS.md and the HLD roadmap): a database, login, real WhatsApp/speech/LLM calls, a background queue, a React or Vue UI, Hindi.

## References
| Reference | What it is | How it was used |
|---|---|---|
| https://github.com/AbhishekKumarSingh07/kritvo-web | The founder's reference web app (React 19, Vite, TypeScript), read at `5b9d8d2` | API client, offline outbox and i18n approach; recorded in REFERENCE-REVIEW.md. Read-only, nothing copied |
| https://github.com/AbhishekKumarSingh07/kritvo-api | The founder's reference back end and its HLD v2.1, LLD v1.6 and ADRs 0001 to 0009, read at `0040b96` | Architecture, webhook security, workflow and events, customer OTP, AMC planner, tenancy and risks; recorded in REFERENCE-REVIEW.md. Read-only, nothing copied |

Both repositories are public and were read with `git clone --depth 1`; no files from them were committed here. No secrets or personal data were found in what we used.

## Spec impact
| Criterion | Change |
|---|---|
| AC-6.1 | Changed: adds server adapters; default mode is now "server" (was "mock") |
| AC-6.3 | Changed: applies to the in-browser mode; server mode is covered by AC-7.6 |
| AC-7.1 to AC-7.6 | Added (US-7 KaryaHub server) |
| AC-8.1 to AC-8.3 | Added (US-8 WhatsApp webhook) |
| AC-9.1 to AC-9.6 | Added (US-9 Proof of work) |
| AC-10.1 to AC-10.3 | Added (US-10 AMC visit plan) |
| AC-11.1, AC-11.2 | Added (US-11 Existing data keeps working) |
| AC-12.1 | Added (US-12 Engineering documentation) |

Also updated in SPEC: overview, screens, demo flow, data model (job state, events, code; tenant), non-functional requirements and out of scope.

## Architecture impact
Stack moves from "no back end" to tier R layout (FastAPI under `/api`), keeping the plain JavaScript UI for now. New ADRs: [ADR-0005](../adr/0005-python-fastapi-back-end.md) back end, [ADR-0006](../adr/0006-whatsapp-webhook-security.md) webhook security, [ADR-0007](../adr/0007-job-workflow-and-events.md) workflow and events, [ADR-0008](../adr/0008-customer-otp-proof.md) customer codes, [ADR-0009](../adr/0009-multi-tenant-ready.md) tenancy. ADR-0002 (plain JS UI), ADR-0003 (browser storage) and ADR-0004 (adapters, now also on the server) still hold. See [ARCHITECTURE.md](../architecture/ARCHITECTURE.md), [HLD.md](../architecture/HLD.md) and [LLD.md](../architecture/LLD.md).

## Verification
- Server: 16 pytest acceptance tests (`tests/api/`), Ruff lint and format clean.
- Web app: 33 Vitest acceptance tests, including all 23 from v0.1.0 (AC-6.1 and AC-6.3 updated to their changed wording) and a compatibility test that loads data saved by v0.1.0.
- End to end: the production build served by `vite preview`, proxied to `uvicorn api.index:app`, driven in Chromium through Chat, Approve, Send code, Verify, Close and Settings at 375px and 1280px in light and dark, with no console errors and no sideways scrolling.
- Result: 49 of 49 passing. See [TEST-REPORT.md](../quality/TEST-REPORT.md).

## Notes
- The browser keeps an in-browser fallback for Chat only, so a demo never stalls; proof of work and visit plans need the server (business rules stay server-side).
- Demo secrets are built in for mock mode only. Before going live, set `KARYAHUB_MODE=live` and every `KARYAHUB_*` secret in Vercel.
