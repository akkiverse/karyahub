# ADR-0008: Customer one-time code as proof of work, signed and stateless

- **Status:** Accepted
- **Date:** 2026-10-28
- **Change request:** CR-0002

## Context
The strongest cheap proof that a visit happened is the customer confirming it (Kritvo LLD 8: customer OTP clears job risk). KaryaHub's server is stateless, so it cannot store codes.

## Decision
`request_otp` issues a 6-digit code and a challenge: base64url JSON of job, tenant, expiry (10 minutes) and a nonce, plus an HMAC-SHA256 over that body and the code with `KARYAHUB_OTP_SECRET`. `verify_otp` recomputes the MAC in constant time and checks job, tenant and expiry. The code goes to the customer through the WhatsApp adapter; in mock mode it is also returned as `demo_code` so the presenter can play the customer. Codes and challenges never enter the event log.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Signed challenge (chosen) | No storage; can't be forged without the secret | No attempt limit or single use until there is storage |
| Store codes in a database | Attempt limits, single use | No database yet |
| Photo or signature only | Familiar | Easy to fake; no customer involvement |

## Consequences
Attempt limits and single use come with the database (RISKS R-07). A supervisor can verify without a code, with a reason, so a customer without a phone doesn't block closing.
