# CR-0005: Accounts and businesses on the server

- **Status:** In review
- **Requested by:** Founder (chat, 2026-10-30: "KaryaHub login is not fixed yet... it should not look like only a prototype")
- **Date:** 2026-10-30
- **Release:** v0.4.0 (once released)
- **Pull request:** (added when opened)

## Why
KaryaHub is a portal many firms will use, like Outlook is used by many companies: each business has its own staff and its own stock, and a person who signs in with their mobile number sees only the business they belong to. Until now accounts and PINs lived in one browser, so an owner could "add staff" but the person couldn't sign in from their own phone, and nothing separated one firm from another. The founder also asked for an admin who can add users one by one or from a CSV and switch what each role or person may do, a platform admin who creates businesses, a forgot-PIN code, no "CoolCare AC Services" line on the sign-in card, and a product that no longer looks like a prototype.

This change replaces the queued CR-0005 "Studio sign-in with KaryaHub roles" (board item P2), which the founder cancelled on 2026-10-30 in favour of KaryaHub's own number-and-PIN sign-in on a server database. It is the first of three steps: this CR (accounts, businesses, team, access), CR-0006 (inventory per business) and CR-0007 (jobs, customers and documents stored per business on the server).

## What changes
For people using the app:
- **Sign in on any phone** with mobile number and PIN. The card says "Sign in to KaryaHub" (no business name). Wrong answers read the same; 5 wrong PINs lock a number for 15 minutes. "Forgot your PIN?" sends a 6-digit code to choose a new PIN. People on a temporary PIN must choose their own first.
- **Platform admin (the founder)** gets a Businesses screen: create a business with its first owner, see every business, turn one off or on, reset an owner's PIN. The first platform admin is created once with a setup token.
- **Business owners** get a real Admin: add people one by one or from a CSV, see each new PIN once (with a CSV download), change roles, turn access off and on, reset PINs, switch single permissions on or off per role in a table and per person, and read an activity log. Settings has the business details (name, address, GSTIN) used on documents.
- **My account** shows who you are and what you can do, and changes your PIN.
- **Real businesses look finished:** no Demo pill, sample chips, watermark or "dummy" tags; Home shows "Get started" instead of the sales story; they start with no sample customers.
- **The demo** is one flagged business whose team is read-only (its PINs are public); its accounts sit under "Explore a demo business" on the sign-in page.

Underneath:
- **Database:** one shared Postgres (Neon `karyahub_master_db`, set up by the founder; the address comes from `DATABASE_URL`) with SQLAlchemy 2 (async) and Alembic migrations that run once at server start. Tables: businesses, users, role and user permission switches, sessions, sign-in throttle, OTP challenges, audit log. Every business-owned row has `business_id` and every query filters by it (ADR-0012).
- **Sessions:** random token in an HttpOnly cookie, only its SHA-256 stored; requests with the cookie must also carry `X-Requested-With: karyahub`.
- **PINs:** scrypt with a per-person salt and a server secret (`KARYAHUB_PIN_PEPPER`, required with a real database).
- **Permissions:** the starting role table plus the owner's switches, worked out on the server for every request. Job, AI, paperwork and renewal routes now require sign-in and the right permission; `actor_role` in a request and the `X-Tenant-Id` header are ignored.
- **Web app:** the app asks the server who is signed in; the on-device team and access log are gone (data version 4); on-device data is kept per business.
- `/api/health` reports `database: ok | memory | error | not_configured` and never the address.

## References
None attached. The founder's description of the multi-business model is in the chat; the earlier review of the Kritvo reference platform is in [REFERENCE-REVIEW.md](../architecture/REFERENCE-REVIEW.md) (shared schema with a business id, OTP login, inventory as its own module).

## Spec impact
| Criterion | Change |
|---|---|
| AC-13.1 to AC-13.6 | Retired in CR-0005 (replaced by US-18 and US-22) |
| AC-15.1 to AC-15.7 | Retired in CR-0005 (replaced by US-19 and US-22) |
| AC-14.2, AC-14.4, AC-14.5 | Changed: permissions come from the server; no role in the request |
| AC-18.1 to AC-18.7 | Added (sign-in on the server) |
| AC-19.1 to AC-19.8 | Added (team and access for a business) |
| AC-20.1 to AC-20.5 | Added (businesses and the platform admin) |
| AC-21.1, AC-21.2 | Added (forgot PIN with a code) |
| AC-22.1 to AC-22.9 | Added (screens) |
| Non-functional, out of scope | Updated: database, sessions, PIN secret; accounts no longer out of scope |

## Architecture impact
New [ADR-0012](../adr/0012-accounts-businesses-and-a-shared-database.md), which supersedes [ADR-0010](../adr/0010-demo-sign-in-and-roles.md) and completes [ADR-0009](../adr/0009-multi-tenant-ready.md). [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) gains the database and sign-in flow; [RISKS.md](../architecture/RISKS.md) updates R-08 and R-10 and adds R-19 to R-21.

## Verification
- Server: 74 pytest tests (26 earlier, 48 new) against an in-memory database: sign-in, lock-out, hashing, CSRF, temporary PINs, team add and CSV import, role and person switches, business isolation, the read-only demo, the platform admin, forgot-PIN codes, and the Neon address conversion. No test reaches a real database or the real AI server.
- Web: 82 Vitest tests (61 earlier, 21 new or rewritten) with the accounts API stood in by a fake; the on-device team tests were replaced.
- Compatibility: data saved by v0.1.0, v0.2.0 and v0.3.0 (with its on-device team) loads; each business's on-device data stays separate.
- Real run: the production build with the real server and an in-memory database, driven by curl (create the platform admin, create a business, temporary-PIN gate, CSV import, isolation, demo read-only) and by a headless browser at 375px and 1280px in light and dark (48 screenshots, no console errors, no horizontal overflow).
- Not run here: the app against the real Neon database (the founder's connection string isn't, and shouldn't be, on this machine). It is checked on the Vercel preview through `/api/health`.

## Notes
- **Founder steps before the first use** (Vercel > karyahub > Settings > Environment Variables, Production and Preview): add `KARYAHUB_PIN_PEPPER` (a long random secret; keep it, changing it later makes every PIN fail) and `KARYAHUB_BOOTSTRAP_TOKEN` (another random secret). The Neon integration should already provide `DATABASE_URL`. Then open the live address, choose "First-time setup", create the platform admin, sign in and add the first business.
- **Forgot-PIN codes** reach real numbers only when WhatsApp is live (the code goes through the WhatsApp adapter). Until then owners reset PINs in Admin and the platform admin resets owners'.
- **Jobs, customers and documents** of real businesses still live on the device until CR-0007. The sign-in, team and access parts are server-side and shared across devices.
- Version string: `/api/health` and `__version__` now say 0.4.0.
