# CR-0007: Faster sign-in

- **Status:** Released
- **Requested by:** Founder (chat, 2026-10-30: "Login is still failing with correct credentials", with a screenshot saying the server couldn't be reached)
- **Date:** 2026-10-30
- **Release:** v0.4.2 (2026-10-30)
- **Pull request:** [#7](https://github.com/akkiverse/karyahub/pull/7)

## Why
On the live app a sign-in took about 8.4 seconds, while pages that don't touch the database answer in about half a second. The app gave up after 8 seconds, so people with correct details saw "Couldn't reach the KaryaHub server". The server was fine; it was slow. Each database round trip from the server to the Neon database costs a lot (the database is far from the server), and a sign-in made about a dozen of them plus a fresh connection every time (PIN hashing takes only about 17 ms).

## What changes
- **Fewer round trips.** A sign-in now makes 6 database statements instead of 10; a signed-in request makes 2 instead of 5 (session, person and business in one query; role and personal switches in one query; no per-sign-in session clean-up, which now happens now and then).
- **Connections are kept and reused** between requests on the same server instance (checked before use, replaced if stale), instead of opening a new secure connection every time. If the server ever runs a request on a different event loop, the old connections are dropped and fresh ones made, so reuse can't cause errors.
- **More patience in the app:** an ordinary request waits 20 seconds (was 8), opening the app and signing in wait 30, before the app says it can't reach the server.
- **`/api/health` shows `database_ms`** (connect and query times in milliseconds) so "far away" can be told from "slow". No address or secret is shown.

## Spec impact
| Criterion | Change |
|---|---|
| Non-functional | Added: sign-in and signed-in requests stay cheap in database round trips; the app waits 20 s (30 s for opening and signing in) before saying it can't reach the server |

## Architecture impact
None to the design; the engine keeps connections per event loop ([ADR-0012](../adr/0012-accounts-businesses-and-a-shared-database.md) still holds).

## Verification
- Server: 3 new tests (81 in all): a sign-in uses at most 8 statements and a signed-in request at most 2 (it was 10 and 5, so the test would have failed before), connections are reused on one loop and replaced on another, and the health timings. Web: 1 new test (88 in all) for the 20 and 30 second waits.
- Not measured here: the real Neon database. The live timings come from `/api/health` after release.

## Notes
The remaining cost is the distance between the server and the database. If the database is in another continent every round trip stays slow, however few there are. The fix for that is to put the server and the database in the same region: set the Vercel function region to match Neon's region (or create the Neon database in a region near the function). This needs the founder's choice; it is not changed here.
