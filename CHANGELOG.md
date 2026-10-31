# Changelog

All notable changes to KaryaHub are recorded here. Each entry links to its change request, which explains why.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-11-01

### Fixed
- Chat: after a message was read, the message box and Send stayed greyed out, so a second message couldn't be sent until you left Chat and came back. They now switch back on after every reply. See [CR-0010](docs/changes/CR-0010-smooth-ai-and-chat.md).
- A model missing on the AI computer no longer makes KaryaHub say "AI is offline": the AI kit (v2) uses another model the computer has.
- `/api/health` shows the released version (it said 0.4.3 while 0.5.0 was live).

### Added
- While the AI reads, Chat says what it is doing, counts the seconds and offers **Stop**; the message stays, with **Try again**.
- A job-sheet photo's text appears as the AI reads it.
- Opening Chat gets the AI ready, so the first message is answered quickly.

### Changed
- Each AI step may take up to 90 seconds (was 40) inside a 120-second server function (was 60); photos use `AI_MODEL_VISION`; the everyday model is `gemma4:e4b` unless `AI_MODEL` says otherwise. See [ADR-0014](docs/adr/0014-smooth-ai-streaming-warm-up-and-time-budget.md).

## [0.5.0] - 2026-10-31

### Added
- Business data on the server: a real firm's customers, jobs, quotes, invoices and chat are now kept in the database for that business only (with a second wall of Postgres row-level security), so every phone of the firm sees the same work. See [CR-0009](docs/changes/CR-0009-business-data-on-server.md) and [ADR-0013](docs/adr/0013-business-data-sync-and-row-level-security.md).
- Works on a weak signal: changes are saved on the phone first, queued, shown as "waiting to send" and sent once when the signal returns, with no duplicates, even if the app is closed in between.
- The first time a phone signs in to a real business, the jobs, customers, documents and chat already on it are moved to the server once.
- Job and document numbers are given by the server per business, so two phones can never choose the same number.
- The owner can add, replace or remove a logo in Settings; it shows on quotes and invoices.
- `/api/health` reports `row_level_security`; `docs/plan/ROADMAP.md` holds the rules and the plan.

### Fixed
- The **Add a person** button at the top of Admin took you to Home. It now moves to the form and puts the cursor in the name box.

### Changed
- A proof-of-work step on a job of a real business is now saved on the server, which no longer trusts the job's state sent by the phone.

## [0.4.3] - 2026-10-30

### Fixed
- KaryaHub no longer says "AI is offline" when the AI PC is up but its connection is slow: the AI kit now allows up to 20 seconds to connect and 12 for the online check, and reuses one connection, so real AI reads are cut off far less often. See [CR-0008](docs/changes/CR-0008-ai-over-a-slow-link.md).

## [0.4.2] - 2026-10-30

### Fixed
- Signing in no longer fails with "Couldn't reach the KaryaHub server": sign-in made about a dozen database round trips and a new connection each time, taking over 8 seconds. It now makes 6 statements, reuses connections, and the app waits longer (20 seconds, 30 for opening and signing in), and the server now runs in Singapore, next to the database (it ran in US East). `/api/health` shows how long the database takes to answer. See [CR-0007](docs/changes/CR-0007-faster-sign-in.md).

## [0.4.1] - 2026-10-30

### Fixed
- Buttons that save now show progress, ignore a second press, and bring the result (such as a new owner's PIN) into view, so pressing Create business no longer looks like nothing happened. See [CR-0006](docs/changes/CR-0006-clear-feedback-while-saving.md).

## [0.4.0] - 2026-10-30
### Added
- Accounts and businesses on the server (Neon Postgres): sign in with mobile number and PIN on any phone, a platform admin who creates businesses and their first owners, and owners who add people one by one or from a CSV, set roles, switch single permissions on or off per role or per person, reset PINs and read an activity log. See [CR-0005](docs/changes/CR-0005-accounts-and-businesses.md).
- Forgot your PIN: a 6-digit code to choose a new PIN (sent over WhatsApp once it is live; the demo shows its code on screen). People on a temporary PIN must choose their own first.
- My account (who you are, what you can do, change your PIN), Settings business details, and a first-time setup screen for the platform admin.
- `/api/health` reports the database status (and the kind of fault, never the address); the server version string now says 0.4.0. Unexpected server faults are now logged.
- If the app can't open, the opening screen says why (server not set up, server fault, or no connection) and the first requests wait up to 30 seconds for a sleeping server.

### Changed
- Sign-in no longer shows a business name; the demo accounts sit under "Explore a demo business".
- Real businesses look finished: no Demo pill, sample chips, watermark or dummy tags, and Home shows "Get started". The public demo is one business with a read-only team.
- Job, AI, paperwork and renewal routes need sign-in and the right permission; the server works out who you are and ignores the role or business sent in a request.
- The team, PINs and access log moved from the browser to the server (saved data version 4). On-device jobs and documents are kept per business.

### Removed
- The on-device demo sign-in and Admin (US-13 and US-15), replaced by server accounts.

## [0.3.0] - 2026-10-30

### Added
- Real AI for technicians' messages and job-sheet photos through Studio AI, the founder's own AI server, with the job read from a JSON schema and checked before it's shown. See [CR-0004](docs/changes/CR-0004-real-ai-studio-ai.md).
- "AI is offline right now" banner and a note on the processing panel when the AI server is off; messages are then read without AI and labelled, never lost. See [CR-0004](docs/changes/CR-0004-real-ai-studio-ai.md).
- `GET /api/ai/status`, and `image_base64` on `/api/v1/pipeline/read-image`. See [CR-0004](docs/changes/CR-0004-real-ai-studio-ai.md).

### Changed
- Processing steps and job cards say who read each message: "Read by Studio AI" or "Read without AI". Settings shows the LLM as Studio AI with `AI_ENDPOINTS`. See [CR-0004](docs/changes/CR-0004-real-ai-studio-ai.md).

## [0.2.0] - 2026-10-28

### Added
- Staff sign-in with mobile number and PIN, and three roles with limited access: owner (admin), office coordinator and technician. See [CR-0003](docs/changes/CR-0003-business-look-admin-and-staff-logins.md).
- Admin panel for owners: team, roles, access on or off, PIN resets, add staff, a roles table and an access log. See [CR-0003](docs/changes/CR-0003-business-look-admin-and-staff-logins.md).
- The server checks each job action against the person's role and publishes the role table at `/api/v1/access/roles`. See [CR-0003](docs/changes/CR-0003-business-look-admin-and-staff-logins.md).
- KaryaHub server (Python, FastAPI) under `/api`: processing pipeline, secure WhatsApp Cloud API webhook, job workflow with customer one-time codes, AMC visit planner, GST totals and reminder text. See [CR-0002](docs/changes/CR-0002-advance-tech.md).
- Proof of work on every job: send the customer a code, verify, close, with a history of each step. See [CR-0002](docs/changes/CR-0002-advance-tech.md).
- AMC service visits on the job screen: next visit, overdue escalation, job creation 7 days ahead. See [CR-0002](docs/changes/CR-0002-advance-tech.md).
- Architecture documents: HLD, LLD, risks and challenges, and a review of the reference platform. See [CR-0002](docs/changes/CR-0002-advance-tech.md).

### Changed
- A more businesslike look: dark sidebar with the firm and the signed-in person, account menu, "Today at" figures on Home, and navigation that shows only what each role can use. See [CR-0003](docs/changes/CR-0003-business-look-admin-and-staff-logins.md).
- Saved demo data moves to data version 3 (adds the team); Reset demo keeps the team and access log. See [CR-0003](docs/changes/CR-0003-business-look-admin-and-staff-logins.md).
- Chat is processed by the KaryaHub server by default, falling back to the in-browser demo if the server can't be reached; Settings shows where messages are processed and the server's status. See [CR-0002](docs/changes/CR-0002-advance-tech.md).
- Saved demo data is upgraded automatically (data version 2); nothing is lost. See [CR-0002](docs/changes/CR-0002-advance-tech.md).

## [0.1.0] - 2026-10-28

### Added
- First version (MVP), a key-free demo prototype built from the approved spec. See [CR-0001](docs/changes/CR-0001-mvp.md).
  - Home explains the problem and shows the money at stake in the next 90 days.
  - Chat simulates a WhatsApp thread: two sample voice notes, a job-sheet photo or free text become a job summary the owner can edit and approve, with each processing step visible.
  - Quotations and GST-format invoices (CGST 9% + SGST 9%) with a DEMO watermark and print-to-PDF.
  - Renewals by 30, 60 or 90 days or lapsed, with a preview of the customer's WhatsApp reminder.
  - Settings with demo mode, each service's status and key, a failure simulator, theme and Reset demo.

[0.6.0]: https://github.com/akkiverse/karyahub/pull/11
[0.5.0]: https://github.com/akkiverse/karyahub/pull/9
[0.4.3]: https://github.com/akkiverse/karyahub/pull/8
[0.4.2]: https://github.com/akkiverse/karyahub/pull/7
[0.4.1]: https://github.com/akkiverse/karyahub/pull/6
[0.4.0]: https://github.com/akkiverse/karyahub/pull/4
[0.3.0]: https://github.com/akkiverse/karyahub/pull/3
[0.2.0]: https://github.com/akkiverse/karyahub/pull/2
[0.1.0]: https://github.com/akkiverse/karyahub/pull/1
