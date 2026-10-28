# ADR-0003: Keep demo data in the browser, seeded from bundled JSON, on a fixed demo date

- **Status:** Accepted
- **Date:** 2026-10-28
- **Change request:** CR-0001

## Context
The spec says all data lives in the browser and that the demo must never handle real personal data. The renewals story (30, 60, 90 days, lapsed) only works if "today" is predictable.

## Decision
- State (customers, chat messages, jobs, documents, settings) is one JSON object saved to `localStorage` under `karyahub.demo.v1`, wrapped in try/catch so the demo still works in memory when storage is blocked.
- It is seeded from `src/data/demo.js` (12 invented AC-service customers, 3 samples). Reset demo restores it.
- The app runs on a fixed demo date, 1 Jan 2027 (`src/clock.js`), shown in the top bar.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| localStorage + fixed date (chosen) | No server, no personal data leaves the device, repeatable demo | Data is per browser; date is not real |
| Hosted database | Shared data, real dates | Needs an account, keys and a data-protection review (DPDP) |
| No persistence | Simplest | A page reload in the middle of a pitch loses the demo |

## Consequences
- The live version will need a server database and real dates; that is a future CR with its own ADR.
