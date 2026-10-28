# CR-0003: Business look, Admin panel and staff logins

- **Status:** Released
- **Requested by:** Founder (board note on the CR-0002 release: "Ask for changes")
- **Date:** 2026-10-28
- **Release:** v0.2.0 (2026-10-28)
- **Pull request:** the CR-0002 pull request ([#2](https://github.com/akkiverse/karyahub/pull/2)), on branch `cr/0002-advance-tech`

## Why
Reviewing the Advance Tech preview, the founder asked: "Make changes into UI make it look more professional and attractive towards business. There should be option for admin panel and login for other staff with limited access to them."

KaryaHub is sold to firm owners who run a team: an owner, an office coordinator and several technicians. A demo that everyone sees in the same way, with no sign-in, doesn't look like software a business can run on. Showing that each person gets only what their job needs, and that the owner controls the team, answers the first questions an owner asks.

## What changes
For people using the app:
- **Sign in** with a mobile number and PIN. The sign-in page explains KaryaHub in three points and lists four demo accounts (owner, office coordinator, two technicians) with their demo PINs; tapping one fills the form.
- **Three roles with limited access:**
  - *Owner (admin):* everything, including Admin and Settings.
  - *Office coordinator:* Home, Chat, Jobs and Renewals; quotes, invoices, reminders and closing jobs. No Admin or Settings.
  - *Technician:* Chat and Jobs only; can send the customer code and verify work; can't see money totals, make quotes or invoices, see renewals, close jobs or change settings.
  Screens a role can't use are left out of the navigation, and opening one directly shows a plain "You don't have access" page that says who you are and what to do.
- **Admin panel** (owners): staff counts by role; the team with each person's number, role, status and last sign-in; change a role; turn someone's access off or on; reset a PIN (a new 4-digit PIN is shown once); add staff; a table of what each role can do; and an access log of sign-ins and team changes. Owners can't lock themselves out or remove the last owner.
- **A more businesslike look:** a deep ink-teal sidebar with the firm's name and the signed-in person, grouped navigation (Workspace, Manage), an account menu with Sign out, a "Today at CoolCare" row of four figures on Home, and a calmer, more structured layout. Phones keep a bottom tab bar with only the screens that person can use.
- Proof-of-work history now names the person and role who did each step (for example "Santosh Pawar (Technician)").

Underneath:
- `src/domain/access.js` (roles, permissions, guards, PIN hashing), `src/domain/team.js` (sign-in and Admin actions), `src/session.js` (who is signed in on this device), `src/views/signin.js`, `src/views/admin.js`.
- Browser data version 3: adds `staff` and `access_log`; data from v0.1.0 (version 1) and the 0.2.0 preview (version 2) is upgraded on load. PINs are stored only as salted SHA-256 hashes. Reset demo keeps the team and the log.
- Server: `backend/karyahub/access.py` with the same role table, `GET /api/v1/access/roles`, and a role check on every job action (`actor_role`), answering 403 with a plain message.

## References
None attached to this change. The founder's two reference repositories (kritvo-web, kritvo-api) were attached to CR-0002 and reviewed there (`docs/architecture/REFERENCE-REVIEW.md`); this run could not open them again (GitHub access to those repositories isn't connected to the scheduled manager), and this change didn't need them.

## Spec impact
| Criterion | Change |
|---|---|
| AC-6.4 | Changed: Reset demo keeps the team, their PINs and the access log, and keeps you signed in |
| AC-11.1 | Changed: data saved by v0.1.0 now upgrades to data version 3 (adds the demo team) |
| AC-11.3 | Added: data saved by the 0.2.0 preview (version 2) keeps working |
| AC-13.1 to AC-13.6 | Added (US-13 Staff sign-in) |
| AC-14.1 to AC-14.5 | Added (US-14 Roles and limited access) |
| AC-15.1 to AC-15.7 | Added (US-15 Admin panel) |
| AC-16.1, AC-16.2 | Added (US-16 Business look) |

Also updated in SPEC: users (staff roles), screens (Sign in, Admin, no-access page), demo flow, data model (Staff, Access log entry, Session), non-functional requirements and out of scope ("Logins" moved from out of scope to demo sign-in; real server-side accounts stay out of scope).

## Architecture impact
New [ADR-0010](../adr/0010-demo-sign-in-and-roles.md): demo sign-in on the device with one role table shared by the web app and the server. The server checks the role sent with each job action, but it is not yet proof of identity: real accounts need the database (RISKS.md R-08, updated). [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) gains the access layer; [DESIGN.md](../design/DESIGN.md) gains the CR-0003 section.

## Verification
- Web app: 55 Vitest tests, including 21 new ones for sign-in, roles, Admin, the new look, the Reset demo change and loading data from the 0.2.0 preview. All 33 earlier tests still pass (the test helper now signs in as the demo owner first).
- Server: 20 pytest tests, including 4 new ones (role table matches the web app, technician refused when closing a job, allowed roles and system calls pass, unknown role refused).
- Ruff lint and format clean; `npm run build` passes.
- Visual check of the production build at 375px and 1280px in light and dark: Sign in, Home, Jobs, Admin, a technician's Chat and the no-access page. Three fixes made (see TEST-REPORT).
- Result: 75 of 75 passing. See [TEST-REPORT.md](../quality/TEST-REPORT.md).

## Notes
- **Demo sign-in, not real security yet.** Staff accounts and PINs live on the device that runs the demo, and the server trusts the role the browser sends. That is enough to show how access works; before real staff or real customer data, accounts move to the server with a database, sign-in by OTP, and the role taken from the server session (R-08).
- PIN attempts are not limited in the demo; the real version limits them on the server.
