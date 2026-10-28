# KaryaHub: Build plan

For CR-0002 (Advance Tech). The CR-0001 plan is in the git history of this file.

## Stack
- **Web app:** plain JavaScript ES modules, Vite 8, Vitest 5 with jsdom, Noto Sans self-hosted (unchanged, ADR-0002).
- **Server (new):** Python 3.12 with uv, FastAPI, Pydantic v2, pydantic-settings; Ruff; pytest with FastAPI's test client (ADR-0005). One Vercel Python function at `api/index.py`; `vercel.json` rewrites `/api/*` to it and keeps the Vite build as the static site.
- **Local run:** `uv run uvicorn api.index:app --port 8000` and `npm run dev` (Vite proxies `/api` to port 8000).

## Approach
1. Read the reference repositories (kritvo-api, kritvo-web) and write REFERENCE-REVIEW.md: what to adopt, adapt or defer.
2. Build the server domain as pure, tested functions first (extraction, workflow, OTP, AMC, documents, renewals), then the routes and the webhook.
3. Point the web app's adapters at the server with an in-browser fallback for Chat; add proof of work and visit plan to the job screen; add server status to Settings.
4. Upgrade saved browser data (v1 to v2) and prove it with a test.
5. Write HLD, LLD, RISKS, ADRs; update SPEC, ARCHITECTURE, DESIGN, TEST-REPORT, CHANGELOG, README.

## How each new story is met
| Story | Approach | Files |
|---|---|---|
| US-7 KaryaHub server | FastAPI app, settings, error handlers, server adapters, meta; browser server adapters and API client | `backend/karyahub/app.py`, `settings.py`, `errors.py`, `adapters/`; `src/api/client.js`, `src/adapters/server.js`, `src/views/settings.js` |
| US-8 WhatsApp webhook | Handshake, raw-body signature, parse, de-duplicate, process each message | `backend/karyahub/whatsapp/webhook.py`, `app.py` |
| US-9 Proof of work | Pure workflow engine, signed customer codes, job screen controls and history | `domain/workflow.py`, `domain/otp.py`, `src/views/jobs.js`, `src/domain/actions.js` |
| US-10 AMC visit plan | Planner with visit keys, lead days and escalation; job screen section | `domain/amc.py`, `src/views/jobs.js` |
| US-11 Existing data | Data version 2 and a migration; server GST and reminder rules equal to v0.1.0 | `src/migrations.js`, `src/store.js`, `domain/documents.py`, `domain/renewals.py` |
| US-12 Documentation | HLD, LLD, RISKS, REFERENCE-REVIEW, ADR-0005 to ADR-0009 | `docs/architecture/`, `docs/adr/` |

## How existing users' data keeps working
- The localStorage key stays `karyahub.demo.v1`; the data inside moves from version 1 to 2 through `src/migrations.js` on load. Jobs gain `state: WORK_DONE`, one history entry and `otp: null`; customers, documents, chat, reminder marks and settings (including the chosen mode) are untouched. Tested by AC-11.1.
- No API existed before, so there is nothing to keep compatible on the server; new routes are versioned under `/api/v1`.
- If the server is unreachable (for example on an old cached page), Chat keeps working in the browser.

## Risks for this change
See [RISKS.md](../architecture/RISKS.md) for the product risks. For the build itself:
- **Vercel routing of the Python function next to a Vite site:** `vercel.json` sets the framework, output and rewrite; checked on the preview with `/api/health`.
- **Regressions in the 23 existing criteria:** the full Vitest suite runs unchanged except for the two criteria this CR changes.
- **Demo stalls if the server is cold or down:** Chat falls back; proof of work shows a clear message.
