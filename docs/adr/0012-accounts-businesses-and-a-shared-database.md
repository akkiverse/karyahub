# ADR-0012: Accounts and businesses on the server, in one shared database

- **Status:** Accepted
- **Date:** 2026-10-30
- **Change request:** CR-0005
- **Supersedes:** [ADR-0010](0010-demo-sign-in-and-roles.md). Completes [ADR-0009](0009-multi-tenant-ready.md).

## Context
KaryaHub is meant for many firms, each with its own people (and later its own stock, jobs and customers). ADR-0010 kept demo accounts in the browser because there was no database; that can't serve a second phone, let alone a second firm, and the server trusted the role the browser sent. The founder has now added a Neon Postgres database (`karyahub_master_db`) and asked for number-and-PIN sign-in, an owner who manages their own team and what each role may do, a platform admin who creates businesses, and a code to recover a forgotten PIN.

## Decision
- **One shared database** for every business ("master" database), with `business_id` on every business-owned row and every query filtered by it in code. People belong to one business, except the platform admin, who has none and sees no business data.
- **Mobile number plus PIN** sign-in, matching the founder's choice (the shared Studio sign-in, queued as CR-0005, was cancelled for KaryaHub). A mobile number belongs to exactly one account.
- **PIN storage:** scrypt with a per-person salt, after an HMAC with a server secret (`KARYAHUB_PIN_PEPPER`). Wrong tries are counted per phone number (existing or not) in the database: 5 failures lock a number for 15 minutes.
- **Sessions:** a random token in an HttpOnly, SameSite=Lax cookie; only its SHA-256 is stored; 12 hours; revoked when a person or business is switched off or a PIN is reset. Requests that carry the cookie must also carry `X-Requested-With: karyahub`.
- **Permissions on the server:** the starting role table, then the business owner's switches for a role, then a per-person allow or block. Owners can't lose team and settings. Every protected route states the permission it needs.
- **Forgot PIN:** a 6-digit code (10 minutes, 5 tries, 3 requests per 15 minutes) delivered through the existing WhatsApp adapter. Until WhatsApp is live only demo accounts get a simulated code; everyone else is told to ask their owner, and the answer is the same for unknown numbers.
- **Platform admin bootstrap:** created once with a setup token from the server's environment (`KARYAHUB_BOOTSTRAP_TOKEN`); the same token and number reset that admin's PIN.
- **Schema changes** are Alembic migrations run once per server start under a Postgres advisory lock; SQLAlchemy 2 (async) with asyncpg on Neon and aiosqlite in tests.
- **Demo business:** an ordinary business row flagged `is_demo`, seeded at start, with a read-only team because its PINs are public.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Shared database, `business_id` on every row (chosen) | One database to run and pay for; fits Neon's free tier; the reference platform does the same | A missing filter would leak data, so every query is scoped and isolation has its own tests |
| Postgres row-level security as well | A second wall if a filter is missed | Needs a per-request database role and setting; not available through Neon's transaction pooler without extra care. Kept for CR-0007, when business data moves to the server |
| One database per business | Strong isolation | Costly and slow to run for small firms |
| Studio Accounts from the hub (queued CR-0005) | Shared people list, no new code | Email and password, managed in the hub, not inside KaryaHub; the founder chose mobile and PIN |
| Passwordless OTP only (no PIN) | Nothing to remember | Needs a working WhatsApp or SMS sender and cost per sign-in |

## Consequences
- Signing in works on any phone and one number can't be used twice; owners and the platform admin manage people for real.
- The server now needs `DATABASE_URL`, `KARYAHUB_PIN_PEPPER` and (for first setup) `KARYAHUB_BOOTSTRAP_TOKEN`. With a database but no pepper accounts refuse to run (503), never falling back to a demo secret. Changing the pepper later invalidates every PIN; keep it.
- A four-digit PIN is guessable, so the lock-out, the hash cost and the unguessable-PIN rules matter; sensitive data should not be added to KaryaHub before owners can use a longer secret or a second factor.
- Real forgot-PIN delivery waits for WhatsApp; owners reset PINs until then.
- Jobs, customers and documents remain on the device for now (CR-0007). Until then a real firm's job data is per device even though its people are shared.
