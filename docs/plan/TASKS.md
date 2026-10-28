# KaryaHub: Tasks

For CR-0002. Each task names the stories and criteria it serves. (CR-0001's tasks are in the git history of this file.)

| # | Task | Serves | Done |
|---|---|---|---|
| 1 | Read kritvo-api and kritvo-web docs (HLD, LLD, ADRs, status) and code layout; write REFERENCE-REVIEW.md | US-12 (AC-12.1) | Yes |
| 2 | Python project: pyproject, uv.lock, .python-version, requirements.txt, Ruff, pytest; `api/index.py`; `vercel.json` | US-7 | Yes |
| 3 | Settings, error handlers, tenancy, health and meta | US-7 (AC-7.1, AC-7.4, AC-7.5) | Yes |
| 4 | Port extraction and samples to the server; server adapters (mock and live) and pipeline routes | US-7 (AC-7.2, AC-7.5) | Yes |
| 5 | WhatsApp webhook: handshake, signature, parse, de-duplicate, hashed phones | US-8 (AC-8.1 to AC-8.3) | Yes |
| 6 | Workflow engine with guards, events and idempotency; transition route | US-9 (AC-9.4, AC-9.5) | Yes |
| 7 | Customer codes: issue and verify; wire into request_otp and verify_otp | US-9 (AC-9.2, AC-9.3) | Yes |
| 8 | AMC visit planner and route | US-10 (AC-10.1, AC-10.2) | Yes |
| 9 | GST totals in paise, IGST, reminder text and renewals on the server | US-11 (AC-11.2) | Yes |
| 10 | Web: API client, server adapters with fallback, default mode "server" | US-6 (AC-6.1), US-7 (AC-7.2 to AC-7.4) | Yes |
| 11 | Web: proof-of-work section, code form, history; Jobs list status | US-9 (AC-9.1 to AC-9.3, AC-9.6) | Yes |
| 12 | Web: AMC visits section | US-10 (AC-10.3) | Yes |
| 13 | Web: Settings modes and server status | US-6 (AC-6.3), US-7 (AC-7.6) | Yes |
| 14 | Data version 2 and migration from v0.1.0 | US-11 (AC-11.1) | Yes |
| 15 | Acceptance tests: pytest for the server, Vitest for the web app (fake API) | All | Yes |
| 16 | End-to-end and visual check at 375px and 1280px, light and dark; fixes | Design | Yes |
| 17 | HLD, LLD, RISKS, ADR-0005 to ADR-0009, SPEC, ARCHITECTURE, DESIGN, TEST-REPORT, CHANGELOG, README, CR-0002 | US-12, records | Yes |
