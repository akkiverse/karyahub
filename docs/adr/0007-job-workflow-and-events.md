# ADR-0007: Job workflow as a pure state machine with append-only events

- **Status:** Accepted
- **Date:** 2026-10-28
- **Change request:** CR-0002

## Context
KaryaHub needs to show that a job was really done before it is closed. The reference platform uses a workflow with locked states, guards and append-only job events with client operation ids (Kritvo ADR-0004, LLD 4). KaryaHub has no database yet; data lives in the browser.

## Decision
`backend/karyahub/domain/workflow.py` defines 7 states (NEW, ASSIGNED, IN_PROGRESS, WORK_DONE, VERIFIED, CLOSED, CANCELLED), 9 actions and 4 guards. `transition()` is pure: it takes the current state and the op ids already applied, and returns the new state and the event to append. A repeated `client_op_id` returns `duplicate` without an event; event ids are derived from tenant, job and op id. Closing requires VERIFIED. The caller stores state and events (browser now, a `job_events` table later).

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Pure engine, caller stores (chosen) | Works on stateless hosting; easy to test; storage can change later | The browser could send a wrong current state (acceptable for a demo; fixed by server storage) |
| Workflow in the browser | No server call | Rules in the front end, against the stack policy |
| Configurable JSON workflows per firm (as in the reference) | Flexible | Too much for one vertical; revisit with a second vertical |

## Consequences
The same engine moves unchanged behind a database; until then, trust in the stored state is limited to one browser (RISKS R-13).
