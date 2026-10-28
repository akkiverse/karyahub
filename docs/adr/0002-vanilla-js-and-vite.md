# ADR-0002: Plain JavaScript modules built with Vite, tested with Vitest

- **Status:** Accepted
- **Date:** 2026-10-28
- **Change request:** CR-0001

## Context
The MVP is a demo prototype with six screens, no server and no accounts. It must load in under 2 seconds on a phone, be easy for a human to change by hand, and have one automated test per acceptance criterion.

## Decision
Build the app as plain ES modules (no UI framework): each screen is a function that returns HTML from the current state, and one small shell in `src/app.js` handles routing (hash routes) and events (delegated `data-action` attributes). Vite bundles it; Vitest with jsdom runs the acceptance tests against the real app in a simulated browser. Fonts (Noto Sans) are self-hosted through `@fontsource/noto-sans`.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Plain JS + Vite (chosen) | Tiny bundle (about 18 kB gzipped JS), no framework to learn, fast tests | Re-renders whole screens; fine at demo scale |
| React or Preact + Vite | Familiar component model, easier to grow | More dependencies and build complexity for a 6-screen demo |
| Single static HTML file | Simplest hosting | Hard to test per criterion, hard to keep adapters separate |

## Consequences
- Screens are easy to read and change; tests drive the real DOM.
- If the product grows into a real multi-firm app, moving to a component framework is a sensible later ADR.
