# ADR-0001: Build this product with spec-driven development

- **Status:** Accepted
- **Date:** 2026-10-28
- **Change request:** CR-0001

## Context
KaryaHub is built mostly by AI agents and sometimes changed by hand. Without a single source of truth, code, documents and intent drift apart, and it becomes impossible to tell why something behaves the way it does.

## Decision
- `docs/spec/SPEC.md` is the source of truth for behaviour, written as user stories with numbered acceptance criteria.
- Every acceptance criterion has an automated test named with its ID, and CI runs them on every push.
- Every change is recorded as a change request in `docs/changes/` before it is merged; significant technical choices get an ADR.
- Manual commits are allowed; the Idea Studio Engineer reconciles them into the records before doing new work.

## Consequences
- Anyone can answer "what does it do, and why did it change?" from the repository alone.
- Each change carries a little paperwork; the change-request template keeps it short.
