# KaryaHub: Test report

**Run:** 2026-10-28 · **Branch:** `cr/0004-studio-ai` (CR-0004) · **Result:** 87 of 87 acceptance tests passing, covering all 77 acceptance criteria · **Lint:** Ruff check and format clean · **Build:** `npm run build` passed (Vite 8; about 31 kB JS and 10 kB CSS gzipped)

Since CR-0003 every web test starts signed in as the demo owner (`tests/helpers.js`) unless it tests sign-in or another role. Since CR-0004 no test calls a real AI server: pytest sets `studio_ai.TRANSPORT` to an `httpx.MockTransport` (an autouse fixture clears every `AI_*` setting first), and Vitest uses the fake API and a stubbed `fetch`.

Two suites:
- **Web app:** 61 tests with Vitest 5 in jsdom on the fixed demo date 2027-01-01, against the real app (`mountApp`), with `tests/fake-api.js` standing in for the server (it records calls and can act unreachable). AC-2.2 runs with the real step timing under fake timers.
- **Server:** 26 tests with pytest and FastAPI's test client against `backend/karyahub` in mock mode (live-mode tests set `KARYAHUB_MODE=live` with no keys; Studio AI tests set `AI_ENDPOINTS` to a mocked server).

Some criteria have a test on each side (for example AC-7.2: the web app calls the API, and the server returns the AC-3.2 fields).

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
| AC-6.1 | `tests/us6-adapters.test.js` › AC-6.1: src/adapters has whatsapp, speech and llm modules with mock, live and server implementations of one interface, chosen by one config value defaulting to "server" | Pass |
| AC-6.2 | `tests/us6-adapters.test.js` › AC-6.2: in live mode with no key, a live adapter returns "Not configured: add <SERVICE> key" and the UI shows it without crashing | Pass |
| AC-6.3 | `tests/us6-adapters.test.js` › AC-6.3: in the in-browser mode, Settings shows "Demo mode: mock responses" and three services with status Mock and the key each needs | Pass |
| AC-6.4 | `tests/us6-adapters.test.js` › AC-6.4: Reset demo returns jobs, documents and reminder marks to the bundled demo data | Pass |
| AC-6.4 | `tests/us6-adapters.test.js` › AC-6.4 (changed CR-0003): Reset demo keeps the team, their PINs and the access log, and keeps you signed in | Pass |
| AC-7.1 | `tests/api/test_us7_server.py::test_ac_7_1_health_and_meta` (/api/health answers ok and /api/v1/meta lists the tenant, mode and three services.) | Pass |
| AC-7.2 | `tests/us7-server.test.js` › AC-7.2: in server mode the Transcribe and Extract steps are answered by the KaryaHub API and say so | Pass |
| AC-7.2 | `tests/api/test_us7_server.py::test_ac_7_2_pipeline_matches_the_demo_extraction` (transcribe and extract on the server give the AC-3.2 fields for the Ramesh sample.) | Pass |
| AC-7.3 | `tests/us7-server.test.js` › AC-7.3: when the server cannot be reached, chat falls back to the in-browser demo and says so | Pass |
| AC-7.4 | `tests/us7-server.test.js` › AC-7.4: the web app turns API errors into plain messages and unreachable servers into a clear error type | Pass |
| AC-7.4 | `tests/api/test_us7_server.py::test_ac_7_4_errors_have_one_plain_shape` (errors are {"error": {"code", "message"}} with plain-English messages.) | Pass |
| AC-7.5 | `tests/api/test_us7_server.py::test_ac_7_5_live_mode_without_keys_fails_closed` (in live mode with no keys, services answer 503 "Not configured: add <SERVICE> key".) | Pass |
| AC-7.6 | `tests/us7-server.test.js` › AC-7.6: Settings in server mode shows the API version, business and each service status from the server with the server key it needs | Pass |
| AC-8.1 | `tests/api/test_us8_webhook.py::test_ac_8_1_handshake_needs_the_verify_token` (GET echoes hub.challenge only for mode=subscribe with the right verify token; else 403.) | Pass |
| AC-8.2 | `tests/api/test_us8_webhook.py::test_ac_8_2_signature_is_checked_before_anything_runs` (a missing or wrong X-Hub-Signature-256 gets 401 and nothing is processed.) | Pass |
| AC-8.2 | `tests/api/test_us8_webhook.py::test_ac_8_2_live_mode_without_app_secret_refuses` (in live mode with no app secret configured, the webhook refuses with 503 (fails closed).) | Pass |
| AC-8.3 | `tests/api/test_us8_webhook.py::test_ac_8_3_text_voice_and_photo_become_jobs_once` (text, voice and photo messages are processed; a repeated id is processed once; no phone echoed.) | Pass |
| AC-9.1 | `tests/us9-proof-of-work.test.js` › AC-9.1: an approved job starts as "Work done, waiting for customer check" with who reported it, and the Jobs list shows its status | Pass |
| AC-9.2 | `tests/us9-proof-of-work.test.js` › AC-9.2: Send code, enter the customer's code, then Close moves the job to Verified and Closed through the server | Pass |
| AC-9.2 | `tests/api/test_us9_workflow.py::test_ac_9_2_code_then_verify_then_close` (a 6-digit code tied to the job verifies the work, then the job closes.) | Pass |
| AC-9.3 | `tests/us9-proof-of-work.test.js` › AC-9.3: a wrong code shows "That code doesn't match or has expired. Send a new code." and the job stays unverified | Pass |
| AC-9.3 | `tests/api/test_us9_workflow.py::test_ac_9_3_wrong_expired_or_other_job_codes_fail` (a wrong code, an expired code or another job's code is refused and the state stays.) | Pass |
| AC-9.4 | `tests/api/test_us9_workflow.py::test_ac_9_4_actions_not_allowed_in_this_state_are_refused` (closing an unverified job (or any action not allowed in the state) gets 409.) | Pass |
| AC-9.5 | `tests/api/test_us9_workflow.py::test_ac_9_5_the_same_operation_never_counts_twice` (a repeated client_op_id returns duplicate with no new event; event ids are deterministic.) | Pass |
| AC-9.6 | `tests/us9-proof-of-work.test.js` › AC-9.6: if the server cannot be reached, proof-of-work steps explain it and nothing changes | Pass |
| AC-10.1 | `tests/api/test_us10_amc.py::test_ac_10_1_visits_every_90_days_with_overdue_escalation` (a contract ending 2027-03-15 owes 4 visits; on 2027-01-01 the 2026-12-10 visit is overdue.) | Pass |
| AC-10.2 | `tests/api/test_us10_amc.py::test_ac_10_2_jobs_are_created_lead_days_ahead_and_never_twice` (inside the lead time a visit says create the job now; a visit with a job is never listed again.) | Pass |
| AC-10.3 | `tests/us10-visits.test.js` › AC-10.3: the job screen shows the AMC service visits from the server, with the next visit and its status | Pass |
| AC-11.1 | `tests/us11-compat.test.js` › AC-11.1: data saved by v0.1.0 loads with jobs, documents, customers and settings kept, and jobs gain a workflow state | Pass |
| AC-11.2 | `tests/api/test_us11_documents.py::test_ac_11_2_gst_totals_match_the_web_app` (server GST totals equal v0.1.0's (CGST 9% + SGST 9%, rupee rounding); inter-state uses IGST 18%.) | Pass |
| AC-12.1 | `tests/api/test_us12_docs.py::test_ac_12_1_architecture_design_and_risks_are_written_down` (HLD, LLD, RISKS and REFERENCE-REVIEW exist with their key sections.) | Pass |
| AC-11.3 | `tests/us11-compat.test.js` › AC-11.3: data saved by the 0.2.0 preview (version 2) loads with jobs and proof of work kept, and gains the demo team | Pass |
| AC-13.1 | `tests/us13-signin.test.js` › AC-13.1: with nobody signed in, any address shows only the Sign-in screen with the demo accounts and their PINs | Pass |
| AC-13.2 | `tests/us13-signin.test.js` › AC-13.2: the owner's number and PIN open Home with their name and role, and the sign-in is logged | Pass |
| AC-13.3 | `tests/us13-signin.test.js` › AC-13.3: a wrong PIN or unknown number shows a plain error, stays on Sign in, and a wrong PIN for a known person is logged | Pass |
| AC-13.4 | `tests/us13-signin.test.js` › AC-13.4: tapping a demo account fills in its number and PIN | Pass |
| AC-13.5 | `tests/us13-signin.test.js` › AC-13.5: Sign out returns to Sign in with a message; the session survives a reload while signed in and not after signing out | Pass |
| AC-13.6 | `tests/us13-signin.test.js` › AC-13.6: staff records keep only a salted SHA-256 hash of each PIN, never the PIN | Pass |
| AC-14.1 | `tests/us14-roles.test.js` › AC-14.1: a technician lands on Chat, sees only Chat and Jobs, and job screens hide paperwork and closing | Pass |
| AC-14.2 | `tests/us14-roles.test.js` › AC-14.2: a technician opening Home, Renewals, Settings, Admin or a document gets a plain no-access page and none of that screen's content | Pass |
| AC-14.3 | `tests/us14-roles.test.js` › AC-14.3: an office coordinator works with Home, Chat, Jobs and Renewals, can make quotes and close jobs, but not Admin or Settings | Pass |
| AC-14.4 | `tests/us14-roles.test.js` › AC-14.4: a technician's proof-of-work step tells the server who they are and their role, and the history names them | Pass |
| AC-14.5 | `tests/us14-roles.test.js` › AC-14.5 (web side): the role table matches the server rules for every job action | Pass |
| AC-14.5 | `tests/api/test_us14_access.py::test_ac_14_5_roles_endpoint_matches_web_app` (GET /api/v1/access/roles returns the same roles and permissions as the web app.) | Pass |
| AC-14.5 | `tests/api/test_us14_access.py::test_ac_14_5_technician_cannot_close_a_job` (a technician closing a job gets 403 with a plain message, and nothing changes.) | Pass |
| AC-14.5 | `tests/api/test_us14_access.py::test_ac_14_5_allowed_roles_and_system_calls_pass` (coordinators may close, technicians may send the customer code, and calls without a role still work.) | Pass |
| AC-14.5 | `tests/api/test_us14_access.py::test_ac_14_5_unknown_role_is_refused` (a role the server does not know is refused rather than trusted.) | Pass |
| AC-15.1 | `tests/us15-admin.test.js` › AC-15.1: Admin shows staff counts by role, the team, Add staff, the roles table and the access log | Pass |
| AC-15.2 | `tests/us15-admin.test.js` › AC-15.2: a new technician is added, logged, and can sign in with technician access | Pass |
| AC-15.3 | `tests/us15-admin.test.js` › AC-15.3: bad name, number or PIN each show their own message and nobody is added | Pass |
| AC-15.4 | `tests/us15-admin.test.js` › AC-15.4: changing Priya's role to Technician changes what she can open and is logged | Pass |
| AC-15.5 | `tests/us15-admin.test.js` › AC-15.5: turning off access blocks sign-in and ends that person's open session; turning it on restores it | Pass |
| AC-15.6 | `tests/us15-admin.test.js` › AC-15.6: Reset PIN shows a new 4-digit PIN once; the old PIN stops working and the new one works | Pass |
| AC-15.7 | `tests/us15-admin.test.js` › AC-15.7: owners cannot change their own role, turn off their own access, or remove the last active owner | Pass |
| AC-16.1 | `tests/us16-look.test.js` › AC-16.1: Home shows a "Today at" row with jobs, waiting checks, renewals in 30 days with money, and paperwork, from the data | Pass |
| AC-16.2 | `tests/us16-look.test.js` › AC-16.2: every signed-in screen shows the business and who is signed in, with Sign out | Pass |

| AC-17.1 | `tests/api/test_us17_studio_ai.py` › test_ac_17_1_without_ai_settings_the_demo_reader_is_used | Pass |
| AC-17.2 | `tests/api/test_us17_studio_ai.py` › test_ac_17_2_ai_reads_the_job_with_a_json_schema | Pass |
| AC-17.3 | `tests/api/test_us17_studio_ai.py` › test_ac_17_3_no_customer_name_keeps_the_ask_for_a_name_behaviour | Pass |
| AC-17.4 | `tests/api/test_us17_studio_ai.py` › test_ac_17_4_ai_answers_are_validated_and_bad_ones_fall_back | Pass |
| AC-17.5 | `tests/api/test_us17_studio_ai.py` › test_ac_17_5_ai_reads_the_job_sheet_photo | Pass |
| AC-17.6 | `tests/api/test_us17_studio_ai.py` › test_ac_17_6_ai_offline_falls_back_and_everything_else_works | Pass |
| AC-17.7 | `tests/us17-studio-ai.test.js` › AC-17.7: a message read by Studio AI says so on the processing steps and the job card | Pass |
| AC-17.8 | `tests/us17-studio-ai.test.js` › AC-17.8: when AI is offline the message is read without AI, clearly labelled, and still becomes a draft | Pass |
| AC-17.9 | `tests/us17-studio-ai.test.js` › AC-17.9: the job sheet photo is sent to the server as an image for Studio AI to read | Pass |
| AC-17.10 | `tests/us17-studio-ai.test.js` › AC-17.10: if the AI server is offline and a photo can't be read, the message stays with Try again, and the offline banner shows | Pass |
| AC-17.11 | `tests/us17-studio-ai.test.js` › AC-17.11: the offline banner follows /api/ai/status and stays quiet when AI isn't set up | Pass |
| AC-17.12 | `tests/us17-studio-ai.test.js` › AC-17.12: chat saved by v0.2.0 (cards without a reader) still shows and approves as before | Pass |

## Design checklist
| Check | Result |
|---|---|
| All colours are CSS custom properties, with a designed dark theme via `prefers-color-scheme` and a manual switch | Yes (`src/styles.css`, Settings > Theme) |
| Works from 360px to 1440px with no sideways scrolling | Yes: checked at 375px and 1280px; scroll width equals the viewport on every screen |
| Tap targets at least 44px | Yes: buttons, chips, tabs, radios and links have a 44px minimum height |
| Semantic HTML, labelled fields, visible focus, contrast, reduced motion | Yes: landmarks (header, nav, main, footer), labelled inputs, `:focus-visible` outline, AA colour pairs, `prefers-reduced-motion` turns off animation |
| Plain-English copy; sample data marked | Yes: "Demo" pill, "(demo)" and "(dummy)" labels, "Simulated: nothing was sent" |
| Designed empty, loading and error states | Yes: see DESIGN.md > States and > Additions in CR-0002 (visit plan loading, server unreachable, wrong code) |
| Favicon, title, meta description, Open Graph title and description, theme-color | Yes (`index.html`, `public/favicon.svg`) |
| Inline SVG icons, no emoji | Yes (`src/ui/icons.js`) |
| Footer link "Part of Idea Studio by AkkiVerse" to the hub | Yes |
| Motion: one entrance moment plus action feedback | Yes: processing steps ticking to green; sheet rises; voice-note waveform while playing |

## Visual check
**CR-0004:** the production build served by `vite preview` with `/api` going to the real server (`uv run uvicorn api.index:app`) and `AI_ENDPOINTS` pointing at a local stand-in for the Ollama server, driven by Playwright in Chromium. Flow: sign in as the owner, Chat, send the job-sheet photo. With AI online, the photo reached the AI as an 80 kB JPEG drawn from the sheet, both steps said "Read by Studio AI (KaryaHub server)" and the card showed "Read by AI" with Sunil Patil's job. With the AI server off (a second server whose `AI_ENDPOINTS` answers nothing), both steps said "Read without AI (KaryaHub server)", the processing note and the banner showed, and the card showed "Read without AI" with the draft ready to approve. Checked at 375px and 1280px in light and dark: no console errors, page width equals the viewport. No fixes were needed.

**CR-0003:** the production build served by `vite preview`, driven by Playwright in Chromium at 375px and 1280px in light and dark: Sign in (desktop split screen and phone), sign in as the owner, Home with the "Today at" row, Jobs, Admin (full page), then a technician's Chat and the no-access page for Renewals. Page width equals the viewport on every screen. Fixes made after looking: the footer overlapped the last demo account on the desktop sign-in page (moved into the form column); the no-access heading was grey and oversized (now ink colour, 1.4rem); avatar initials were low-contrast on the lighter dark-theme colours (dark text in dark theme). Also removed the focus box drawn around page headings when focus moves to them by script (keyboard focus still shows).

**CR-0002:** the production build served by `vite preview` with `/api` proxied to `uv run uvicorn api.index:app` (the real server, mock mode), driven by Playwright in Chromium at 375px and 1280px wide in light and dark: Chat (voice note, steps say "KaryaHub server"), Approve, job screen with Proof of work and AMC service visits, Send code, enter the code, Verify, Close, and Settings (connected to API v0.2.0). No console errors; page width equals the viewport on every screen. Fix made after looking: the third mode radio button shrank when its label wrapped on phones; radios no longer shrink.

**CR-0001:** Headless Chromium (Playwright) against `vite preview` of the production build. Screens: Home, Chat (after a voice note, a photo, edit mode and a simulated failure), Document (invoice), Renewals (with the reminder preview) and Settings, each at 375px and 1280px wide in light and dark. No console errors and no horizontal overflow.

Fixes made after looking at the screenshots:
- The chat thread did not stay scrolled to the newest message while steps updated; it now keeps the bottom in view unless the viewer has scrolled up.
- The "Simulate failure" switch wrapped onto its own line on phones; the label now sits beside the checkbox.
- Moving between screens now starts at the top of the page.

## Releases
- v0.1.0 (2026-10-28): CR-0001 released; 23 of 23 acceptance tests passing.
- v0.2.0 (2026-10-28): CR-0002 and CR-0003 released; 75 of 75 acceptance tests passing.
- CR-0004 in review: 87 of 87 acceptance tests passing.
