# KaryaHub

Turn technicians' WhatsApp voice notes into job records, quotes and AMC renewal reminders.

**Live:** https://karyahub-akkiverse.vercel.app
**Part of:** [Idea Studio by AkkiVerse](https://idea-studio-akkiverse.vercel.app)

## What it does

KaryaHub is a demo prototype for AMC (annual maintenance contract) service firms such as AC service companies. It explains the problem owners face (lapsed renewals, re-typed job sheets, no view of field work), then plays a simulated WhatsApp conversation: a technician's voice note or job-sheet photo is transcribed, turned into a structured job record the owner can correct and approve, then into a quotation or GST-format invoice and a renewal reminder. Every outside service (WhatsApp, speech-to-text, LLM) sits behind an adapter that returns mock responses, so the demo runs with no accounts, keys or payments. All names, phone numbers and GSTINs are dummy data.

## Status

| | |
|---|---|
| Stage | Building the MVP (CR-0001) |
| Acceptance tests | 0 of 0 passing ([report](docs/quality/TEST-REPORT.md)) |
| Latest change | [CR-0001](docs/changes/CR-0001-mvp.md): first version (MVP) |

## Run it locally

```bash
npm install
npm run dev      # start the app at http://localhost:5173
npm test         # run the acceptance tests
npm run build    # production build into dist/
```

The app needs no environment variables. It runs in demo mode with mock adapters; see `src/adapters/` and [ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) for what the real version needs.

## How this repo is organised

This product is built with **spec-driven development**: the spec is the source of truth, every acceptance criterion has an automated test, and every change is recorded with its reason.

| Document | What it answers |
|---|---|
| [docs/product/BRIEF.md](docs/product/BRIEF.md) | Why this product exists, who pays, the business case |
| [docs/spec/SPEC.md](docs/spec/SPEC.md) | What it must do: user stories and acceptance criteria (`AC-x.y`) |
| [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) | How it is built: components, data, integrations |
| [docs/adr/](docs/adr/) | Why each significant technical decision was made |
| [docs/changes/](docs/changes/) | Every change request: what changed, why, and its effect on the spec |
| [docs/design/DESIGN.md](docs/design/DESIGN.md) | Visual identity: palette, type, layout |
| [docs/plan/](docs/plan/) | The build plan and task list |
| [docs/quality/TEST-REPORT.md](docs/quality/TEST-REPORT.md) | Each acceptance criterion, its test, and the result |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each release |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to make changes, by hand or through Idea Studio |

## Deployment

Hosted on Vercel. Every pull request gets a preview; merging to `main` deploys to production at https://karyahub-akkiverse.vercel.app.
