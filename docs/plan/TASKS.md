# KaryaHub: Tasks

For CR-0003 (business look, Admin panel and staff logins), built on the CR-0002 branch. Each task names the stories and criteria it serves. (Earlier tasks are in the git history of this file.)

| # | Task | Serves | Done |
|---|---|---|---|
| 1 | Role table, permissions, route and action rules, guards, PIN hashing (`src/domain/access.js`) | US-13, US-14, US-15 | Yes |
| 2 | Session on the device; sign-in, sign-out and Admin actions with the access log (`src/session.js`, `src/domain/team.js`) | US-13 (AC-13.2 to AC-13.6), US-15 | Yes |
| 3 | Data version 3 with the demo team; migrations from v1 and v2; Reset demo keeps the team | AC-6.4, AC-11.1, AC-11.3 | Yes |
| 4 | Sign-in screen with demo accounts | AC-13.1, AC-13.4 | Yes |
| 5 | Shell: role-filtered sidebar and tabs, account menu, no-access page; hide paperwork and closing for technicians; name and role on job actions | US-14 (AC-14.1 to AC-14.4), AC-16.2 | Yes |
| 6 | Admin panel: counts, team, role change, access on or off, Reset PIN, Add staff, roles table, access log | US-15 (AC-15.1 to AC-15.7) | Yes |
| 7 | Business look: sidebar, top bar, KPI tiles, "Today at" row on Home, sign-in design, dark theme | US-16 (AC-16.1) | Yes |
| 8 | Server: `access.py`, `GET /api/v1/access/roles`, role check on job actions | AC-14.5 | Yes |
| 9 | Tests: Vitest for US-13 to US-16, AC-6.4 and AC-11.3; pytest for AC-14.5; test helper signs in as the owner | All | Yes |
| 10 | Visual check at 375px and 1280px, light and dark; fixes | Design | Yes |
| 11 | CR-0003, ADR-0010, SPEC, DESIGN, ARCHITECTURE, RISKS, PLAN, TEST-REPORT, CHANGELOG, README, studio.json | Records | Yes |
