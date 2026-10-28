# ADR-0010: Demo sign-in on the device, one role table shared with the server

- **Status:** Accepted
- **Date:** 2026-10-28
- **Change request:** CR-0003

## Context
The founder asked for an admin panel and logins for staff with limited access. KaryaHub's server is stateless (ADR-0007, ADR-0009): there is no database to hold accounts, and the founder hasn't added one. Real sign-in (phone OTP, server sessions, tokens) needs both a database and an SMS or WhatsApp sender with keys.

## Decision
- Staff accounts (name, mobile, role, active, salted SHA-256 PIN hash, last sign-in) and an access log live in the demo's browser data (version 3). The signed-in person is a separate small session record (`karyahub.session.v1`), so Reset demo doesn't sign anyone out.
- Three roles (owner, office coordinator, technician) and nine permissions are defined once in `src/domain/access.js` and mirrored in `backend/karyahub/access.py`; a pytest test fails if they differ. `GET /api/v1/access/roles` publishes the table.
- The web app hides what a role can't use and refuses screens it can't open. Every job action also sends `actor_role`, and the server refuses actions the role may not take (403 `forbidden`), so the rule is enforced in the place that will own it later.
- Owners can't change their own role, turn off their own access, or remove the last active owner.

## Consequences
- The demo shows real access control without any account, key or cost.
- It is not security: anyone with the device could edit browser storage, and the server trusts the role it is sent. Recorded as R-08 in RISKS.md. Moving to real accounts means: a `staff` table with `tenant_id` and row-level security, OTP sign-in, a server session or short-lived token carrying the staff id and role, attempt limits, and the server reading the role from the session instead of the request. The role table and the checks stay as they are.
