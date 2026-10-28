# KaryaHub: Test report

**Run:** 2026-10-28 · **Commit:** 774b7d7 (branch `cr/0001-mvp`) · **Result:** 23 of 23 acceptance tests passing · **Build:** `npm run build` passed (Vite 8; about 18 kB JS and 7 kB CSS gzipped)

Tests run with Vitest 5 in jsdom, in mock mode, on the fixed demo date 2027-01-01, against the real app (`mountApp`). AC-2.2 runs with the real step timing under fake timers to prove the reply lands within 3 seconds.

## Traceability: acceptance criteria to tests

| Criterion | Test | Result |
|---|---|---|
| AC-1.1 | `tests/us1-home.test.js` › AC-1.1: Home shows the headline and three problem cards | Pass |
| AC-1.2 | `tests/us1-home.test.js` › AC-1.2: Money at stake in the next 90 days equals the sum of demo AMCs expiring within 90 days | Pass |
| AC-1.3 | `tests/us1-home.test.js` › AC-1.3: "See how it works" opens the Chat screen | Pass |
| AC-2.1 | `tests/us2-chat.test.js` › AC-2.1: Chat shows a phone-style chat titled KaryaHub and at least 3 samples (2 voice notes, 1 photo) | Pass |
| AC-2.2 | `tests/us2-chat.test.js` › AC-2.2: the Ramesh Sharma voice note shows a player with duration, then within 3 seconds the bot reply and a job summary card | Pass |
| AC-2.3 | `tests/us2-chat.test.js` › AC-2.3: the job-sheet photo sample shows an image bubble and a job summary card | Pass |
| AC-2.4 | `tests/us2-chat.test.js` › AC-2.4: free text is answered by the mock LLM with a summary card, or asks for a missing customer name | Pass |
| AC-3.1 | `tests/us3-processing.test.js` › AC-3.1: the processing panel shows Transcribe, Extract, Save in order, all done, with the transcript | Pass |
| AC-3.2 | `tests/us3-processing.test.js` › AC-3.2: the Ramesh Sharma sample extracts the expected fields | Pass |
| AC-3.3 | `tests/us3-processing.test.js` › AC-3.3: Edit, change a field and Approve saves the job with my value, first on the Jobs screen | Pass |
| AC-3.4 | `tests/us3-processing.test.js` › AC-3.4: with Simulate failure on, the failed step is red with the error text and nothing is saved | Pass |
| AC-4.1 | `tests/us4-documents.test.js` › AC-4.1: quote and invoice show business, GSTIN, customer, lines, subtotal, CGST 9% + SGST 9% and a rounded total | Pass |
| AC-4.2 | `tests/us4-documents.test.js` › AC-4.2: every document carries a visible "DEMO, not a valid tax invoice" watermark | Pass |
| AC-4.3 | `tests/us4-documents.test.js` › AC-4.3: Download opens the browser print dialog with a print-styled layout and no external service | Pass |
| AC-4.4 | `tests/us4-documents.test.js` › AC-4.4: the chat shows "Quotation sent to Ramesh Sharma" with a simulated document attachment | Pass |
| AC-5.1 | `tests/us5-renewals.test.js` › AC-5.1: the 30-day filter lists only customers expiring by 2027-01-31, soonest first | Pass |
| AC-5.2 | `tests/us5-renewals.test.js` › AC-5.2: with the 90-day filter, Money at stake equals the sum of listed AMC values | Pass |
| AC-5.3 | `tests/us5-renewals.test.js` › AC-5.3: a customer whose AMC expired before today appears under Lapsed with a red label | Pass |
| AC-5.4 | `tests/us5-renewals.test.js` › AC-5.4: Send reminder previews the customer-side WhatsApp text and marks the customer "Reminded (demo)" | Pass |
| AC-6.1 | `tests/us6-adapters.test.js` › AC-6.1: src/adapters has whatsapp, speech and llm modules with mock and live implementations of one interface, chosen by one config value defaulting to "mock" | Pass |
| AC-6.2 | `tests/us6-adapters.test.js` › AC-6.2: in live mode with no key, a live adapter returns "Not configured: add <SERVICE> key" and the UI shows it without crashing | Pass |
| AC-6.3 | `tests/us6-adapters.test.js` › AC-6.3: Settings shows "Demo mode: mock responses" and three services with status Mock and the key each needs | Pass |
| AC-6.4 | `tests/us6-adapters.test.js` › AC-6.4: Reset demo returns jobs, documents and reminder marks to the bundled demo data | Pass |

## Design checklist
| Check | Result |
|---|---|
| All colours are CSS custom properties, with a designed dark theme via `prefers-color-scheme` and a manual switch | Yes (`src/styles.css`, Settings > Theme) |
| Works from 360px to 1440px with no sideways scrolling | Yes: checked at 375px and 1280px; scroll width equals the viewport on every screen |
| Tap targets at least 44px | Yes: buttons, chips, tabs, radios and links have a 44px minimum height |
| Semantic HTML, labelled fields, visible focus, contrast, reduced motion | Yes: landmarks (header, nav, main, footer), labelled inputs, `:focus-visible` outline, AA colour pairs, `prefers-reduced-motion` turns off animation |
| Plain-English copy; sample data marked | Yes: "Demo" pill, "(demo)" and "(dummy)" labels, "Simulated: nothing was sent" |
| Designed empty, loading and error states | Yes: see DESIGN.md > States |
| Favicon, title, meta description, Open Graph title and description, theme-color | Yes (`index.html`, `public/favicon.svg`) |
| Inline SVG icons, no emoji | Yes (`src/ui/icons.js`) |
| Footer link "Part of Idea Studio by AkkiVerse" to the hub | Yes |
| Motion: one entrance moment plus action feedback | Yes: processing steps ticking to green; sheet rises; voice-note waveform while playing |

## Visual check
Headless Chromium (Playwright) against `vite preview` of the production build. Screens: Home, Chat (after a voice note, a photo, edit mode and a simulated failure), Document (invoice), Renewals (with the reminder preview) and Settings, each at 375px and 1280px wide in light and dark. No console errors and no horizontal overflow.

Fixes made after looking at the screenshots:
- The chat thread did not stay scrolled to the newest message while steps updated; it now keeps the bottom in view unless the viewer has scrolled up.
- The "Simulate failure" switch wrapped onto its own line on phones; the label now sits beside the checkbox.
- Moving between screens now starts at the top of the page.

## Releases
Not yet released.
