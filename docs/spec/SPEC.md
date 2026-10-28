# KaryaHub: Specification

**Status:** Approved 2026-10-28, changed by CR-0002 (2026-10-28) · **Source:** https://claude.ai/artifact/AtyPCQQWYaVSmg1K8gPxgC
This file is the source of truth for what the product does. Every change to it is made through a change request (see [../changes/](../changes/)).

## Overview
KaryaHub Demo is a mobile-first web prototype the founder shows to AMC service firm owners: it explains the problem, then plays a simulated WhatsApp conversation where a technician's voice note or job-sheet photo becomes a job record, a quotation or GST-format invoice, and a renewal reminder. Every outside service runs through adapters that return mock responses, so it needs no accounts, API keys or payments.

**MVP goal:** a 3-minute demo that makes an owner say "I want this for my business", built so real WhatsApp, speech and LLM services can be switched on later without rewriting screens.

**Since CR-0002 ("Advance Tech"):** a Python KaryaHub server (FastAPI) does the processing, receives WhatsApp webhooks securely, runs a job workflow with customer-confirmed proof of work, and plans AMC service visits. It still answers every outside service with mock data, so the demo needs no keys; real services are switched on with server keys. The design follows the founder's reference platform (see `docs/architecture/REFERENCE-REVIEW.md`), with the risks in `docs/architecture/RISKS.md`.

Founder notes applied: build "a basic prototype to display to the client or vendor with dummy data and processing" that "can explain what problem it will be resolving"; keep the idea open for review.

## Users
- **Founder as presenter:** shows the demo on a phone or laptop in an owner's shop or on a video call.
- **Owner (viewer):** Suresh, 45, runs an AC service firm with 8 technicians in Pune; lives on WhatsApp, avoids dashboards.
- **Vendor or partner (viewer):** a parts distributor who might refer firms.

## User stories and acceptance criteria

<!--
Format:
### US-1: <title>
As a <user> I want <goal> so that <reason>.
- **AC-1.1** Given <context>, when <action>, then <outcome>. *(added CR-0001)*
Retired criteria stay listed with "Retired in CR-xxxx" so IDs are never reused.
-->

Test IDs below are used as automated test names. Web app tests (Vitest) run with a fixed clock of 2027-01-01, the bundled demo data and a stand-in for the server; server tests (pytest) call the FastAPI app in mock mode.

### US-1: Problem story
As a presenter I want an opening screen that explains the problem so that the owner sees their own pain before the product.
- **AC-1.1** Given the app opens, then the Home screen shows the headline "Never miss an AMC renewal again" and three problem cards: lapsed renewals, re-typing job sheets, and no view of field work. *(added CR-0001)*
- **AC-1.2** Given the demo data, then Home shows "Money at stake in the next 90 days" equal to the sum of AMC values of demo customers expiring within 90 days. *(added CR-0001)*
- **AC-1.3** Given Home, when I press "See how it works", then the Chat screen opens. *(added CR-0001)*

### US-2: Simulated WhatsApp chat
As a presenter I want to send a sample technician message in a WhatsApp-style chat so that viewers recognise the experience.
- **AC-2.1** Given the Chat screen, then it shows a phone-style chat titled "KaryaHub" and a sample picker with at least 3 samples: 2 voice notes and 1 job-sheet photo. *(added CR-0001)*
- **AC-2.2** Given I pick the sample voice note "Ramesh Sharma gas refill", then a technician bubble with a voice-note player and duration appears, and within 3 seconds a bot reply "Got it. Here is what I understood" with a job summary card appears. *(added CR-0001)*
- **AC-2.3** Given I pick the job-sheet photo sample, then a technician image bubble appears and the bot replies with a job summary card. *(added CR-0001)*
- **AC-2.4** Given I type free text into the chat box and send it, then the bot replies using the mock LLM adapter with a job summary card, or with "I couldn't find a customer name, can you add it?" if none is found. *(added CR-0001)*

### US-3: Visible processing
As an owner I want to see each processing step and correct the result so that I trust it.
- **AC-3.1** Given a sample was sent, then a processing panel shows three steps in order: Transcribe (speech adapter), Extract (LLM adapter), Save, each marked done, with the mock transcript visible. *(added CR-0001)*
- **AC-3.2** Given the "Ramesh Sharma gas refill" sample, then extracted fields are: name "Ramesh Sharma", phone "9876543210", equipment "Voltas 1.5T split AC", work "Gas refill", AMC expiry 2027-03-15, AMC value 6500. *(added CR-0001)*
- **AC-3.3** Given the summary card, when I press Edit, change a field and press Approve, then the job is saved with my value and appears first on the Jobs screen. *(added CR-0001)*
- **AC-3.4** Given an adapter returns an error (forced via a "Simulate failure" switch in Settings), then the failed step shows red with "Couldn't read this message. Try again." and nothing is saved. *(added CR-0001)*

### US-4: Quotation and GST-format invoice
As an owner I want a quote or invoice made from a job so that I can see paperwork done for me.
- **AC-4.1** Given an approved job, when I press "Create quote" or "Create invoice", then the document shows the demo business name and GSTIN, customer, line items, subtotal, GST at 18% split into CGST 9% and SGST 9%, and a total rounded to the rupee. *(added CR-0001)*
- **AC-4.2** Given any generated document, then it carries a visible "DEMO, not a valid tax invoice" watermark. *(added CR-0001)*
- **AC-4.3** Given a document, when I press Download, then the browser print dialog opens with a print-styled layout (save as PDF), with no external service. *(added CR-0001)*
- **AC-4.4** Given a document, then the chat shows a bot bubble "Quotation sent to Ramesh Sharma" with a document attachment preview (simulated, nothing is sent). *(added CR-0001)*

### US-5: Renewals and reminders
As an owner I want to see renewals due and the reminder my customer would get so that I see the money recovered.
- **AC-5.1** Given today 2027-01-01 and the demo data, when I open Renewals with the 30-day filter, then only customers expiring by 2027-01-31 are listed, soonest first. *(added CR-0001)*
- **AC-5.2** Given the 90-day filter, then the total "Money at stake" equals the sum of listed AMC values. *(added CR-0001)*
- **AC-5.3** Given a customer whose AMC expired before today, then it appears under "Lapsed" with a red label. *(added CR-0001)*
- **AC-5.4** Given I press "Send reminder" on a customer, then a customer-side WhatsApp preview shows the reminder text with the customer's name and expiry date filled in, and the customer is marked "Reminded (demo)". No real message is sent. *(added CR-0001)*

### US-6: Adapters and demo mode
As the founder I want every outside service behind a swappable adapter so that real keys can be added later without changing screens.
- **AC-6.1** Given the codebase, then `src/adapters` has whatsapp, speech and llm modules, each exporting a mock and a live implementation of the same interface (sendMessage; transcribe; extractJob), plus `server.js` with server implementations of the same interface, chosen by one config value that defaults to "server". *(added CR-0001, changed CR-0002: default was "mock")*
- **AC-6.2** Given mode "live" with no key configured, then calling a live adapter returns the error "Not configured: add <SERVICE> key" and the UI shows it, without crashing. *(added CR-0001)*
- **AC-6.3** Given Settings in the in-browser mode, then it shows "Demo mode: mock responses" and lists the three services with status "Mock" and the key each would need. *(added CR-0001, changed CR-0002: now applies to the in-browser mode; server mode is AC-7.6)*
- **AC-6.4** Given Settings, when I press "Reset demo", then all jobs, documents and reminder marks return to the bundled demo data. *(added CR-0001)*

### US-7: KaryaHub server
As the founder I want the processing to run on a Python server so that real services and their keys can be added safely later without changing screens.
- **AC-7.1** Given the deployed app, then `GET /api/health` returns status "ok" for service "karyahub-api", and `GET /api/v1/meta` lists the tenant, the mode and the three services with their status; API docs are at `/api/docs`. *(added CR-0002)*
- **AC-7.2** Given server mode (the default), when a sample or text is sent in Chat, then the Transcribe or photo-reading step and the Extract step are answered by the API (`/api/v1/pipeline/*`), the step details say "KaryaHub server", and the server extracts the same fields as AC-3.2. *(added CR-0002)*
- **AC-7.3** Given the server can't be reached, when a sample is sent, then Chat still completes using the in-browser demo and the step detail says "server unreachable, used the in-browser demo". *(added CR-0002)*
- **AC-7.4** Given any API error (unknown address, invalid request, a message that can't be read), then the answer is `{"error": {"code", "message"}}` with a plain-English message, and the web app shows that message. *(added CR-0002)*
- **AC-7.5** Given the server in live mode with no keys, then pipeline and send calls answer 503 "Not configured: add <SERVICE> key", and meta shows each service as "Missing key"; keys are read only from server environment variables. *(added CR-0002)*
- **AC-7.6** Given Settings in server mode, then it shows "Server mode: KaryaHub API", the API version and business name, each service's status from the server and the `KARYAHUB_*` key it needs; if the server can't be reached it says so and shows "Unreachable". *(added CR-0002)*

### US-8: WhatsApp webhook
As the founder I want a secure WhatsApp webhook so that real technician messages can come in as soon as WhatsApp is connected.
- **AC-8.1** Given `GET /api/v1/whatsapp/webhook`, then it echoes `hub.challenge` only when `hub.mode` is "subscribe" and `hub.verify_token` matches, otherwise 403. *(added CR-0002)*
- **AC-8.2** Given a `POST` with a missing or wrong `X-Hub-Signature-256`, then it answers 401 "Signature check failed." and processes nothing; in live mode without an app secret it answers 503. *(added CR-0002)*
- **AC-8.3** Given a correctly signed payload with voice, photo and text messages, then each becomes a job extraction, a repeated message id is processed once and counted as a duplicate, unsupported types are reported as failed, and senders' phone numbers are never echoed (only a hash). *(added CR-0002)*

### US-9: Proof of work
As an owner I want the customer to confirm finished work with a one-time code so that I know a visit really happened before I close the job.
- **AC-9.1** Given an approved job, then it starts as "Work done, waiting for customer check" with a history entry "Reported done by <technician> on WhatsApp", and the Jobs list shows its status. *(added CR-0002)*
- **AC-9.2** Given a job waiting for customer check, when I press "Send code to customer", then the server issues a 6-digit code bound to the job (shown on screen in the demo as the customer would receive it); when I enter that code and press Verify, the job becomes "Verified by customer"; when I press "Close job", it becomes "Closed". *(added CR-0002)*
- **AC-9.3** Given a wrong code, an expired code (older than 10 minutes) or another job's code, then I see "That code doesn't match or has expired. Send a new code." and the job stays unverified. *(added CR-0002)*
- **AC-9.4** Given an action not allowed in the job's current state (for example closing an unverified job), then the server refuses it with a plain message and nothing changes. *(added CR-0002)*
- **AC-9.5** Given the same operation is sent twice (same operation id), then it counts once: the second answer is marked duplicate and adds no history entry. *(added CR-0002)*
- **AC-9.6** Given the server can't be reached, when I press a proof-of-work button, then I see "Couldn't reach the KaryaHub server..." and the job doesn't change. *(added CR-0002)*

### US-10: AMC visit plan
As an owner I want to see which service visits each AMC owes and when to schedule them so that no paid visit is missed.
- **AC-10.1** Given a contract ending 2027-03-15 (starting a year earlier) with a visit every 90 days, on 2027-01-01, then the plan lists visits due 2026-06-13, 2026-09-11, 2026-12-10 and 2027-03-10; the 2026-12-10 visit is overdue and escalates to the owner (more than 2 days late; the coordinator before that), and the 2027-03-10 visit is upcoming with its job created on 2027-03-03 (7 days ahead). *(added CR-0002)*
- **AC-10.2** Given today is inside a visit's 7-day lead time, then it says "Create job now"; given a visit already has a job (its key is known), then it shows "Job created" and is never listed for creation again. *(added CR-0002)*
- **AC-10.3** Given a job with an AMC end date, then the job screen shows "AMC service visits" from the server with the next visit due and its status. *(added CR-0002)*

### US-11: Existing data keeps working
As a returning viewer I want my saved demo to keep working after the update so that nothing is lost.
- **AC-11.1** Given demo data saved by v0.1.0, when the app opens, then jobs, documents, customers, reminder marks and settings are kept, and each job gains the status "Work done, waiting for customer check". *(added CR-0002)*
- **AC-11.2** Given the same document lines, then the server's GST totals equal v0.1.0's (CGST 9% + SGST 9%, total rounded to the rupee), inter-state supply uses IGST 18%, and the server's reminder text matches the web app's. *(added CR-0002)*

### US-12: Engineering documentation
As the founder I want the architecture, design and risks written down so that any engineer can understand and continue the work.
- **AC-12.1** Given the repository, then `docs/architecture/` has HLD.md (context, building blocks, flows, deployment), LLD.md (API, errors, workflow, code, visit planner, webhook), RISKS.md (each risk with likelihood, impact, resolution and status) and REFERENCE-REVIEW.md (what was learned from the reference repositories and what KaryaHub adopts, adapts or defers). *(added CR-0002)*

## Screens and flows
Bottom tab bar on phones (side rail on desktop): Home, Chat, Jobs, Renewals, Settings.

| Screen | Shows | Empty state | Error state |
|---|---|---|---|
| Home | Problem headline, 3 problem cards, money at stake, "See how it works" | n/a (demo data always loaded) | n/a |
| Chat | WhatsApp-style thread, sample picker, text box, processing panel, summary card with Edit / Approve | Hint: "Pick a sample to start" | Red failed step with retry |
| Jobs | Newest-first jobs with status; job detail with Create quote / Create invoice, Proof of work (status, steps, Send code, code entry, Close, history) and AMC service visits | "No jobs yet, send a sample in Chat" (after reset) | Server unreachable or wrong code: red note with what to do |
| Document | Quote or invoice with CGST/SGST, DEMO watermark, Download | n/a | "Check quantity and rate" for bad lines |
| Renewals | Filter chips 30 / 60 / 90 / Lapsed; cards with Send reminder; customer-side preview sheet | "No contracts" (only if demo data removed) | n/a |
| Settings | Where messages are processed (server, in browser, live keys), server connection, service status and needed keys, Simulate failure switch, Reset demo, theme | "Checking the KaryaHub server…" | "Can't reach the KaryaHub server" |

Demo flow (3 minutes): Home → See how it works → pick voice note → watch processing → Approve → Create invoice → Send code → Verify → Close → Renewals → Send reminder.

## Look and feel
- **Personality:** dependable, quick, money-aware.
- **Who and where:** an owner watching over the founder's shoulder on a phone in a busy shop, or on a laptop video call.
- **Colour mood:** calm, trustworthy teal with a familiar WhatsApp-like chat area; money in strong green, lapsed in red. Main brand colour: deep teal **#0F766E**. Do not copy WhatsApp's logo or exact green.
- **Typography:** friendly, legible sans (Inter or Noto Sans); large numerals for ₹ totals.
- **References:** WhatsApp chat layout (familiar), Khatabook's big-number ledger, Linear's clean lists. Unlike IndiaMART-style AMC software with dense grey tables, KaryaHub shows one big number and a chat.
- **Avoid:** dense tables on mobile, jargon ("tickets", "SLA"), tiny tap targets, stock photos, anything implying real messages are sent.
- **Delight moment:** the processing steps tick through and the summary card lands in the chat, then the Home total updates to show the new ₹ at stake.

## Data model
All demo data lives in the browser (localStorage in try/catch, data version 2), seeded from bundled demo JSON. The KaryaHub server is stateless: it computes and checks, and the browser stores the results (ADR-0007, ADR-0009). Data saved by v0.1.0 (version 1) is upgraded on load.

| Entity | Fields |
|---|---|
| Customer | id, name, phone, area, equipment, amc_expiry (ISO), amc_value (₹), reminded_at |
| Sample | id, kind (voice or photo), label, media_url (bundled asset), mock_transcript, mock_extraction |
| Message | id, from (technician, bot, customer), kind (text, voice, image, card, document), body, at |
| Job | id, customer_id, date, work_done, parts, source_sample_id, approved_at, state (NEW, ASSIGNED, IN_PROGRESS, WORK_DONE, VERIFIED, CLOSED, CANCELLED; added CR-0002), events [{id, action, from_state, to_state, client_op_id, actor, channel, detail, received_at}] (added CR-0002), otp {challenge, expires_at, demo_code} (added CR-0002) |
| Document | id, job_id, type (quote or invoice), lines [{description, qty, rate}], cgst, sgst, total |
| Settings | business_name, gstin (dummy), mode (server, mock or live; server added CR-0002), simulate_failure, theme |
| Tenant (server) | id, business_name, address, gstin, state_code, vertical, language, amc_visit_every_days, amc_lead_days, is_demo (added CR-0002) |

## Non-functional requirements
- Works from 360px wide; tap targets at least 44px.
- Loads in under 2 seconds; no network calls in the in-browser mode. API answers in mock mode in under 1 second.
- Secrets only in server environment variables (`KARYAHUB_*`); live mode without a needed secret fails closed with a clear message.
- Server code: Python 3.12, FastAPI, Pydantic v2, Ruff, pytest (stack tier R; UI stays plain JavaScript, ADR-0005).
- Accessible: labelled controls, WCAG AA contrast, keyboard use, visible focus; voice-note bubbles show the transcript as text.
- Light and dark themes following the system setting, with a manual switch.
- Plain-language errors; ₹ in Indian format (1,00,000).
- No real personal data: all names, phones and GSTINs are dummy and labelled as demo.

## Out of scope
- Real WhatsApp phone numbers or message sending (the webhook exists and is tested, but no number is connected; changed CR-0002).
- Real speech-to-text, LLM or OCR calls (live adapters fail closed until built and keyed).
- A server database, background queue, attempt limits on customer codes, and cross-delivery de-duplication (see RISKS.md R-04, R-05, R-07, R-13).
- Valid tax invoices, e-invoicing, payments or payment links.
- Logins and real multi-firm data (the server is tenant-ready, ADR-0009).
- Technician app, GPS or photo-based risk scoring, inventory and attendance (see REFERENCE-REVIEW.md).
- Regional language UI (sample voice notes may be Hinglish with English transcripts).

## Open questions
Answered for CR-0001 with the analyst's recommended defaults; the founder can change them with a change request:
- Demo vertical: **AC service** (alternatives: RO purifiers, fire safety).
- Firm name: a dummy firm, **"CoolCare AC Services (demo)"**, presented by KaryaHub.
- Reminder language: **English** (Hindi can be added later).
