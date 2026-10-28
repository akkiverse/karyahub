# ADR-0006: WhatsApp webhook: verify the signature first, de-duplicate by message id

- **Status:** Accepted
- **Date:** 2026-10-28
- **Change request:** CR-0002

## Context
WhatsApp Cloud API delivers technician messages to a public URL and retries on errors. Anyone can post to that URL. The reference platform's gateway design (Kritvo LLD 6.1) checks `X-Hub-Signature-256` on raw bytes before parsing and de-duplicates by message id.

## Decision
`GET /api/v1/whatsapp/webhook` answers the handshake only with the right verify token. `POST` computes HMAC-SHA256 of the raw body with the app secret and compares it in constant time with the header before parsing; a mismatch is 401. Messages are de-duplicated by WhatsApp message id; per-message failures are reported but the webhook still answers 200. Senders' phone numbers are returned only as a keyed hash. In live mode without an app secret the endpoint answers 503 (fail closed); built-in demo secrets work only in mock mode.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Signature on raw body, then parse (chosen) | Correct and safe; matches Meta's spec | Must read the raw body before any JSON parsing |
| Parse then check | Simpler code | A re-serialised body won't match; parsing untrusted input first |
| No check, rely on an obscure URL | None | Anyone can inject fake jobs |

## Consequences
- De-duplication across separate deliveries needs storage; it arrives with the database (RISKS R-04).
- Processing is synchronous today; at volume, store the raw event, answer 200 and process in the background (RISKS R-05).
