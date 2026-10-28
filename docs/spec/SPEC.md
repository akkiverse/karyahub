# KaryaHub: Specification

**Status:** Approved 2026-10-28 · **Source:** https://claude.ai/artifact/AtyPCQQWYaVSmg1K8gPxgC
This file is the source of truth for what the product does. Every change to it is made through a change request (see [../changes/](../changes/)).

## Overview
KaryaHub Demo is a mobile-first web prototype the founder shows to AMC service firm owners: it explains the problem, then plays a simulated WhatsApp conversation where a technician's voice note or job-sheet photo becomes a job record, a quotation or GST-format invoice, and a renewal reminder. Every outside service runs through adapters that return mock responses, so it needs no accounts, API keys or payments.

**MVP goal:** a 3-minute demo that makes an owner say "I want this for my business", built so real WhatsApp, speech and LLM services can be switched on later without rewriting screens.

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

Test IDs below are used as automated test names. Tests run in mock mode with a fixed clock of 2027-01-01 and the bundled demo data.

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
- **AC-6.1** Given the codebase, then `src/adapters` has whatsapp, speech and llm modules, each exporting a mock and a live implementation of the same interface (sendMessage; transcribe; extractJob), chosen by one config value that defaults to "mock". *(added CR-0001)*
- **AC-6.2** Given mode "live" with no key configured, then calling a live adapter returns the error "Not configured: add <SERVICE> key" and the UI shows it, without crashing. *(added CR-0001)*
- **AC-6.3** Given Settings, then it shows "Demo mode: mock responses" and lists the three services with status "Mock" and the key each would need. *(added CR-0001)*
- **AC-6.4** Given Settings, when I press "Reset demo", then all jobs, documents and reminder marks return to the bundled demo data. *(added CR-0001)*

## Screens and flows
Bottom tab bar on phones (side rail on desktop): Home, Chat, Jobs, Renewals, Settings.

| Screen | Shows | Empty state | Error state |
|---|---|---|---|
| Home | Problem headline, 3 problem cards, money at stake, "See how it works" | n/a (demo data always loaded) | n/a |
| Chat | WhatsApp-style thread, sample picker, text box, processing panel, summary card with Edit / Approve | Hint: "Pick a sample to start" | Red failed step with retry |
| Jobs | Newest-first jobs; job detail with Create quote / Create invoice | "No jobs yet, send a sample in Chat" (after reset) | n/a |
| Document | Quote or invoice with CGST/SGST, DEMO watermark, Download | n/a | "Check quantity and rate" for bad lines |
| Renewals | Filter chips 30 / 60 / 90 / Lapsed; cards with Send reminder; customer-side preview sheet | "No contracts" (only if demo data removed) | n/a |
| Settings | Demo mode, adapter status and needed keys, Simulate failure switch, Reset demo, theme | n/a | n/a |

Demo flow (3 minutes): Home → See how it works → pick voice note → watch processing → Approve → Create invoice → Renewals → Send reminder.

## Look and feel
- **Personality:** dependable, quick, money-aware.
- **Who and where:** an owner watching over the founder's shoulder on a phone in a busy shop, or on a laptop video call.
- **Colour mood:** calm, trustworthy teal with a familiar WhatsApp-like chat area; money in strong green, lapsed in red. Main brand colour: deep teal **#0F766E**. Do not copy WhatsApp's logo or exact green.
- **Typography:** friendly, legible sans (Inter or Noto Sans); large numerals for ₹ totals.
- **References:** WhatsApp chat layout (familiar), Khatabook's big-number ledger, Linear's clean lists. Unlike IndiaMART-style AMC software with dense grey tables, KaryaHub shows one big number and a chat.
- **Avoid:** dense tables on mobile, jargon ("tickets", "SLA"), tiny tap targets, stock photos, anything implying real messages are sent.
- **Delight moment:** the processing steps tick through and the summary card lands in the chat, then the Home total updates to show the new ₹ at stake.

## Data model
All data lives in the browser (localStorage in try/catch), seeded from bundled demo JSON. No server functions are required for the demo.

| Entity | Fields |
|---|---|
| Customer | id, name, phone, area, equipment, amc_expiry (ISO), amc_value (₹), reminded_at |
| Sample | id, kind (voice or photo), label, media_url (bundled asset), mock_transcript, mock_extraction |
| Message | id, from (technician, bot, customer), kind (text, voice, image, card, document), body, at |
| Job | id, customer_id, date, work_done, parts, source_sample_id, approved_at |
| Document | id, job_id, type (quote or invoice), lines [{description, qty, rate}], cgst, sgst, total |
| Settings | business_name, gstin (dummy), mode (mock or live), simulate_failure, theme |

## Non-functional requirements
- Works from 360px wide; tap targets at least 44px.
- Loads in under 2 seconds; no network calls in mock mode.
- Accessible: labelled controls, WCAG AA contrast, keyboard use, visible focus; voice-note bubbles show the transcript as text.
- Light and dark themes following the system setting, with a manual switch.
- Plain-language errors; ₹ in Indian format (1,00,000).
- No real personal data: all names, phones and GSTINs are dummy and labelled as demo.

## Out of scope
- Real WhatsApp Cloud API, webhooks, phone numbers or message sending.
- Real speech-to-text, LLM or OCR calls (live adapters are stubs only).
- Valid tax invoices, e-invoicing, payments or payment links.
- Logins, multiple firms, server database.
- Regional language UI (sample voice notes may be Hinglish with English transcripts).

## Open questions
Answered for CR-0001 with the analyst's recommended defaults; the founder can change them with a change request:
- Demo vertical: **AC service** (alternatives: RO purifiers, fire safety).
- Firm name: a dummy firm, **"CoolCare AC Services (demo)"**, presented by KaryaHub.
- Reminder language: **English** (Hindi can be added later).
