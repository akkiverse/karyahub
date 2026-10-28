# ADR-0004: Every outside service sits behind an adapter with mock and live implementations

- **Status:** Accepted
- **Date:** 2026-10-28
- **Change request:** CR-0001

## Context
The real product needs the WhatsApp Business Cloud API, a speech-to-text service and an LLM, all of which need accounts and keys the team cannot create. The founder wants a demo now and a path to the real thing without rewriting screens (AC-6.1, AC-6.2).

## Decision
- `src/adapters/` has three modules: `whatsapp.js` (`sendMessage`), `speech.js` (`transcribe`) and `llm.js` (`extractJob`, plus `readImage` for job-sheet photos).
- Each exports a mock and a live implementation of the same interface. `getAdapters(mode)` in `src/adapters/index.js` picks them from one value, `mode`, which defaults to `mock` (`src/config.js`) and can be switched in Settings.
- Mocks return the bundled sample transcripts and extractions; free text is parsed by a small heuristic so the demo responds to anything typed.
- Live implementations are stubs: with no key they throw `Not configured: add <SERVICE> key`, which the screens show as a normal error.
- Screens only call actions in `src/domain/actions.js`, which only call adapters.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Adapters with mock and live (chosen) | Demo works with no keys; real services plug in later | A little extra structure |
| Hard-coded fake responses in screens | Quickest | Real version would need the screens rewritten |
| Call real APIs from the browser | Real results | Needs keys, exposes them in the browser, costs money |

## Consequences
- Going live means writing server functions (Vercel functions) that hold the keys and implementing the live adapters to call them.
- The "Simulate failure" switch exercises the same error path the live adapters will use.
