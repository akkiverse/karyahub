# KaryaHub: Build plan

For CR-0001 (first version, MVP demo prototype).

## Stack
Plain JavaScript ES modules, Vite 8 for the build, Vitest 5 with jsdom for acceptance tests, Noto Sans self-hosted via `@fontsource/noto-sans`. Static hosting on Vercel; no server functions. See ADR-0002 to ADR-0004.

## File layout
```
index.html                 entry page, meta and Open Graph tags
public/favicon.svg
src/main.js                loads fonts, styles, mounts the app
src/app.js                 shell, hash router, event delegation, theme
src/config.js              adapter mode default, step timing, service keys list
src/clock.js               fixed demo date (2027-01-01)
src/format.js              rupees, dates, escaping
src/store.js               state + localStorage, reset
src/data/demo.js           demo business, customers, samples
src/data/jobsheet.js       drawn job-sheet "photo" (SVG)
src/domain/actions.js      send, retry, approve, createDocument, sendReminder
src/domain/renewals.js     due windows, lapsed, money at stake, reminder text
src/domain/documents.js    GST totals, document numbers
src/adapters/              whatsapp.js, speech.js, llm.js, index.js, errors.js
src/views/                 home, chat, jobs (+ job), document, renewals, settings
src/styles.css             tokens, layout, print styles
tests/                     one file per user story, one test per AC
```

## How each user story is met
| Story | Approach | Files |
|---|---|---|
| US-1 Problem story | Hero headline, three problem cards, money at stake computed from demo customers due within 90 days, link to Chat | `views/home.js`, `domain/renewals.js` |
| US-2 Simulated WhatsApp chat | Phone-frame chat, 3 sample chips (2 voice, 1 photo), composer for free text, bot replies | `views/chat.js`, `domain/actions.js`, `data/demo.js` |
| US-3 Visible processing | Process card with Transcribe, Extract, Save steps updated live; summary card with Edit and Approve; Simulate failure path | `domain/actions.js`, `views/chat.js`, `adapters/*` |
| US-4 Quote and invoice | Documents built from approved jobs with CGST/SGST, watermark, print styles; simulated WhatsApp send adds a chat bubble | `domain/documents.js`, `views/document.js`, `views/jobs.js` |
| US-5 Renewals and reminders | Filter chips, totals, lapsed label, reminder preview sheet, Reminded (demo) mark | `views/renewals.js`, `domain/renewals.js` |
| US-6 Adapters and demo mode | Mock and live adapters chosen by `mode`; Settings shows status and keys; Reset demo | `adapters/*`, `views/settings.js`, `store.js` |

## Risks and how they are handled
- **Timing in the demo vs tests:** steps take 650 ms each in the app (under 3 s in total); tests run with zero delay, and AC-2.2 uses fake timers with the real delay.
- **Real dates would break the renewals story:** fixed demo date shown in the top bar.
- **Looking like real WhatsApp or a real invoice:** own colours and logo, "simulated" labels on every send, DEMO watermark, dummy GSTIN.
- **Storage blocked (private mode):** store falls back to memory.
