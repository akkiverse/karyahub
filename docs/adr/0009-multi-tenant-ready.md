# ADR-0009: Multi-tenant ready now, row-level security when the database arrives

- **Status:** Accepted
- **Date:** 2026-10-28
- **Change request:** CR-0002
- **Update (CR-0005):** tenants are now real database rows and every request resolves its business from the signed-in person's session; the `X-Tenant-Id` header is ignored. See [ADR-0012](0012-accounts-businesses-and-a-shared-database.md).

## Context
KaryaHub's business model is many small firms on one system ("onboarding a business is a row in a tenant table"). The reference platform isolates tenants with `tenant_id` on every table and forced PostgreSQL row-level security set per transaction (Kritvo ADR-0001). KaryaHub has no database yet.

## Decision
Tenants are configuration in `backend/karyahub/tenancy.py` (one demo tenant). Every request resolves a tenant (`X-Tenant-Id`, defaulting to the demo); every workflow result, event id and customer code is bound to the tenant id. When the founder adds Postgres, every table gets `tenant_id` and forced row-level security, with the tenant taken from the signed-in user's token (never from a header) and isolation tests in CI.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Tenant id everywhere now, RLS with the database (chosen) | No API change later; small today | Header-based tenant is only safe for the demo |
| Database per firm | Strong isolation | Costly and slow to operate for tiny firms |
| Ignore tenancy until later | Less code | Every API and id would change later |

## Consequences
Before a second real firm: login (RISKS R-08), database and RLS (RISKS R-10). The `X-Tenant-Id` header must then be ignored for authorisation.
