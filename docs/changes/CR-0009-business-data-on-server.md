# CR-0009: Business data on the server

- **Status:** In progress
- **Requested by:** Founder (TASKS.md K3, 2026-10-31; the Add a person fix was reported in chat the same day)
- **Date:** 2026-10-31
- **Release:** v0.5.0 (planned)
- **Pull request:** [#9](https://github.com/akkiverse/karyahub/pull/9)

## Why
Since CR-0005 KaryaHub knows who people are and which business they belong to, but a real firm's customers, jobs, quotes, invoices and chat still live in each person's own browser. Two phones of the same firm see different work, clearing the browser loses everything, and the owner cannot see what the technicians did. The founder's goal is that a real AC-service firm can run its whole day on KaryaHub; this is step 1 of that plan (`docs/plan/ROADMAP.md`).

Technicians work on weak signal, so the data cannot simply be fetched live: changes must be written on the phone first and sent when the signal returns, without ever creating duplicates.

The founder also found that the **Add a person** button at the top of Admin sent them to Home while the form lower on the page worked. It was a link to `#admin-add`, and the app reads every `#...` address as a page and falls back to Home. It is fixed in this change.

## What changes
- **Customers, jobs, documents and chat messages of a real business are stored on the server**, in one table scoped by business, with Postgres row-level security as a second wall (ADR-0013). The demo business is unchanged: its data stays on the device and the server refuses to sync it.
- **One sync call** (`POST /api/v1/sync`): the phone sends the changes it queued, each with an operation id; the server applies each once, gives new jobs and documents their numbers, and answers with everything that changed since the phone's last call.
- **Weak signal:** the app keeps working from its on-device copy. Every change is written on the phone first and queued; the queue survives closing the app, is sent when there is signal, and shows how many changes are waiting.
- **Server-owned job fields:** a job's state, history and customer code are saved by the server when a proof-of-work step happens; a phone's older copy cannot overwrite them. A step on a job that has not synced yet is refused with a plain message.
- **One-time import:** the first time a phone signs in to a real business after this update, the jobs, customers, documents and chat already on it are moved to the server (once per phone), with a notice saying how many.
- **Numbers from the server:** job and document numbers come from per-business counters, so two phones cannot choose the same one; an item not yet synced shows as "New".
- **Business details and logo on the server:** name, address and GSTIN were already saved on the server (CR-0005); the owner can now also add, replace or remove a logo in Settings, shown on documents.
- **Permissions:** each kind of record needs a permission to read and one to change, so the owner's switches decide who sees quotes and invoices.
- **Fix: Add a person** at the top of Admin now moves to the form and puts the cursor in the name box.
- `/api/health` reports `row_level_security`. `docs/plan/ROADMAP.md` holds the seven rules and the plan.

## Spec impact
| Criterion | Change |
|---|---|
| AC-22.11 | Added: the Add a person button stays on Admin and goes to the form |
| AC-23.1 to AC-23.12 | Added (US-23): records on the server, the wall between businesses, permissions, no duplicates, server numbers, server-owned job fields, one-time import, sign-in loads from the server, offline queue, retries and rejections, logo, demo stays on the device |
| Data model, Non-functional, Out of scope | Updated |

## Architecture impact
New: migration `0002` (tables `records`, `sync_ops`, `counters`, `device_imports`; `businesses.logo_data` and `logo_version`; row-level security), the server package `karyahub/data/`, and `src/sync.js` in the web app. Decisions and alternatives are in [ADR-0013](../adr/0013-business-data-sync-and-row-level-security.md). Risks R-10, R-13 and new R-22 to R-24 are updated in `docs/architecture/RISKS.md`.

## Verification
- Server tests (`tests/api/test_us23_business_data.py`) for every AC-23: a second business cannot read or change the first's records (also by guessing ids), repeated changes apply once, concurrent phones get different numbers, a stale phone cannot overwrite a job's state, the import is once per phone and keeps numbers, the logo is checked and fenced, the demo is refused. The migration is also generated as PostgreSQL and checked for row-level security on every table. When a Postgres address is given in `KARYAHUB_TEST_POSTGRES_URL`, the same wall is tested on a real Postgres (policies, role switch, a bare `select` from another business returns nothing).
- Web tests (`tests/us23-business-data.test.js`): a real business loads from the server; changes made with the server unreachable are queued, survive a reload, and are sent once when it returns (a lost answer does not duplicate); rejections put the server's version back; the one-time import moves legacy device data and does not repeat; the demo never syncs; the logo; the Add a person button.
- Full suites, Ruff and the build are run before the pull request (numbers in `docs/quality/TEST-REPORT.md`).

## Notes
- **Not tested against the real Neon database from here.** After the preview deploys, check `/api/health`: `database: ok` and `row_level_security: on`. If it says `off`, the database refused to create the restricted role; the app is still safe (every statement is filtered by business) but the founder should be told, and ADR-0013 says what to check.
- Known limit: if two people change the same record while both are offline, the later sync wins for ordinary fields (R-22).
- Document numbers keep today's `QT-<year>-<n>` shape; per-financial-year, gap-free numbering is K5.
- Nothing here sends a message to a customer; the sender layer is K5 and K6.
