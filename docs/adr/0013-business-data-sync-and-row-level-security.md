# ADR-0013: Business data on the server, synced from the phone, behind row-level security

- **Status:** Accepted
- **Date:** 2026-10-31
- **Change request:** CR-0009
- **Builds on:** [ADR-0012](0012-accounts-businesses-and-a-shared-database.md), [ADR-0009](0009-multi-tenant-ready.md). Supersedes the "browser keeps the data" parts of [ADR-0003](0003-browser-storage-demo-data.md) for real businesses (the demo business keeps them).

## Context
A real firm's customers, jobs, documents and chat were kept in each browser. Technicians work on weak signal, in basements and lifts, so data cannot be fetched live for every screen; and two phones must never create duplicate jobs or overwrite each other's numbers. The Neon database is shared by all businesses, so one missing filter would leak a firm's customers to another firm.

## Decision
1. **One table for business records.** `records(business_id, kind, id, number, body JSON, seq, updated_at)`, primary key `(business_id, kind, id)`, kinds `customer`, `job`, `document`, `message`. The item's content is a JSON document exactly as the web app already holds it. Later steps (inventory, the dashboard) add their own kinds or tables.
2. **Two walls.** Every statement in `karyahub/data/` filters by `business_id` taken from the signed-in person, never from the request. In Postgres the same tables have row-level security enabled **and forced**, with one policy: `business_id = current_setting('app.business_id', true)`. Each request that touches them starts its transaction with `set_config('app.business_id', <id>, true)` and, where possible, `SET LOCAL ROLE karyahub_app`, a login-less role without `BYPASSRLS`. The role switch matters because Neon's default owner role bypasses row-level security; switching to the restricted role makes the policy bind even though the connection belongs to the owner. The migration creates the role and grants, each step inside a savepoint: if the database refuses, the migration still succeeds (a live app must never fail to start over this), the app runs on its filters alone, and `/api/health` says `row_level_security: off`.
3. **Sync, not fetch.** The web app keeps a copy of its business's data on the phone and a queue of changes. One call, `POST /api/v1/sync`, sends up to 100 queued changes and returns what changed since the phone's cursor. A change is `{op_id, kind, id, body}`: *set this item to this content*. The server records every `op_id` it has applied and answers a repeat with the original result, so a lost answer or a retry cannot duplicate or reorder anything. Ids are made on the phone (random, unique), so creating offline needs no server.
4. **The cursor is a per-business counter** (`counters.seq`). A sync transaction takes the counter's row lock first, so writes of one business are applied one after another and a reader can never skip a change that committed late.
5. **Numbers come from the server.** Jobs and documents have an id (unique key, made on the phone) and a `number` (`J-0007`, `QT-2026-0003`) given on first arrival from per-business counters. Until then the phone shows "New". This is why two phones cannot clash.
6. **The server owns what a phone must not rewrite.** A job's `state`, `events` and `otp` are changed only by the proof-of-work route, which now loads the job from the database (not from what the phone says) and saves the result; the sync call ignores those fields for jobs that already exist.
7. **Conflicts: the later sync wins** for ordinary fields of a record. Chat messages and documents are mostly written by one person at a time; the cost of anything cleverer (field-level merge, version vectors) is not worth it at this size, and the limit is written down as R-22.
8. **One-time import per phone.** `POST /api/v1/import` takes what a phone held before, records `(business_id, device_id)` so it runs once, makes ids unique by prefixing them with the device id, merges customers with the same mobile number, keeps numbers already given, and moves the counters past them. After it succeeds the phone replaces its copy with what the server returns.
9. **Permissions.** Reading and changing each kind needs a permission the owner already controls (jobs and customers: `view_jobs`, `use_chat` or `manage_renewals`; documents: `create_documents`; messages: `use_chat`). A change without permission is rejected with a reason, not applied.
10. **The demo business never syncs.** Its data is public sample data on each visitor's own phone; the server refuses.
11. **Logo** is a small image kept in a deferred column of `businesses` (so it is not read on every request) and served from `GET /api/v1/business/logo` to signed-in people of that business only.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Records table with JSON body, sync by "set this item" (chosen) | Small server code; the web app's data shape does not change; idempotent by construction; offline-friendly | No field-level queries yet; later reports need typed tables or JSON queries; later sync wins on conflicts |
| One typed table per entity | Clean queries and constraints | Four tables and four mappers for a shape that still changes; slower to build; K2 and K5 will tell which fields deserve columns |
| Server-first fetch with no phone copy | Simplest | Unusable on weak signal; fails the field-first rule |
| CRDT or operation-log merging | Correct concurrent edits | Large, slow to build, and far beyond what a 3-person firm needs |
| A database per business | Strongest wall | Cost and operations for many small firms (also rejected in ADR-0012) |
| Row-level security without the restricted role | No role to create | Silently does nothing when the connection role bypasses it (Neon's default) |

## Consequences
- Every business-data request makes one more round trip (the scope setting) and, on Postgres, a role switch in the same transaction; the sync call is a single request for many changes.
- Anything added to the web app's data (new fields on a job) syncs without a server change, but the server cannot validate fields it does not know. Validation is limited to size, kind, id shape and the server-owned fields; typed validation arrives with the features that need it.
- The migration may be unable to create the restricted role on some hosts. The health check and the CR's notes tell the founder how to see which case applies.
- Because Neon's pooler runs in transaction mode, `SET LOCAL` and `set_config(..., true)` are used (they end with the transaction); a session-level `SET` would leak to the next client.
- Backups and exports of one business's data are now possible (K8); so are the DPDP duties to export and delete a customer's data.
- Large attachments (photos, voice) are not stored; chat messages keep only their text and sample ids. Storing media is a later decision.
