# KaryaHub: Specification

**Status:** Approved 2026-10-28, changed by CR-0002 and CR-0003 (2026-10-28), CR-0004 (2026-10-28) and CR-0005 (2026-10-30) · **Source:** https://claude.ai/artifact/AtyPCQQWYaVSmg1K8gPxgC
This file is the source of truth for what the product does. Every change to it is made through a change request (see [../changes/](../changes/)).

## Overview
KaryaHub Demo is a mobile-first web prototype the founder shows to AMC service firm owners: it explains the problem, then plays a simulated WhatsApp conversation where a technician's voice note or job-sheet photo becomes a job record, a quotation or GST-format invoice, and a renewal reminder. Every outside service runs through adapters that return mock responses, so it needs no accounts, API keys or payments.

**MVP goal:** a 3-minute demo that makes an owner say "I want this for my business", built so real WhatsApp, speech and LLM services can be switched on later without rewriting screens.

**Since CR-0002 ("Advance Tech"):** a Python KaryaHub server (FastAPI) does the processing, receives WhatsApp webhooks securely, runs a job workflow with customer-confirmed proof of work, and plans AMC service visits. It still answers every outside service with mock data, so the demo needs no keys; real services are switched on with server keys. The design follows the founder's reference platform (see `docs/architecture/REFERENCE-REVIEW.md`), with the risks in `docs/architecture/RISKS.md`.

**Since CR-0004 (Studio AI):** technicians' messages and job-sheet photos are read by real AI on the founder's own AI server when it's connected, and by the quick reader, clearly labelled, when it's off.

**Since CR-0003 (business look, Admin and staff logins):** people sign in with a mobile number and PIN, and each role (owner, office coordinator, technician) sees only what its job needs. Owners manage the team in an Admin panel. The look is more businesslike: a dark sidebar with the firm and the signed-in person, and a "Today at" row of figures on Home. Sign-in is a demo kept on the device (ADR-0010); real accounts come with the database.

**Since CR-0005 (accounts and businesses):** KaryaHub serves many firms from one database. The founder (platform admin) creates a business and its first owner; people sign in with a mobile number and PIN stored on the server, see only their own business, and each owner manages their own team, roles and access. Forgotten PINs are reset with a code. The public demo is one flagged business.

Founder notes applied: build "a basic prototype to display to the client or vendor with dummy data and processing" that "can explain what problem it will be resolving"; keep the idea open for review.

## Users
- **Founder as presenter:** shows the demo on a phone or laptop in an owner's shop or on a video call.
- **Owner (viewer):** Suresh, 45, runs an AC service firm with 8 technicians in Pune; lives on WhatsApp, avoids dashboards.
- **Vendor or partner (viewer):** a parts distributor who might refer firms.
- **Staff inside a firm (added CR-0003):** the owner (Akash Mehta in the demo, admin), an office coordinator (Priya Nair) and technicians (Santosh Pawar, Imran Khan). Each signs in and sees only what their role allows.

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
- **AC-6.4** Given Settings, when I press "Reset demo", then all jobs, documents and reminder marks return to the bundled demo data, while the team, their PINs and the access log are kept and I stay signed in. *(added CR-0001, changed CR-0003: the team and log are kept)*

### US-7: KaryaHub server
As the founder I want the processing to run on a Python server so that real services and their keys can be added safely later without changing screens.
- **AC-7.1** Given the deployed app, then `GET /api/health` returns status "ok" for service "karyahub-api", and `GET /api/v1/meta` lists the tenant, the mode and the three services with their status; API docs are at `/api/docs`. *(added CR-0002)*
- **AC-7.2** Given server mode (the default), when a sample or text is sent in Chat, then the Transcribe or photo-reading step and the Extract step are answered by the API (`/api/v1/pipeline/*`), the step details say "KaryaHub server", and the server extracts the same fields as AC-3.2. *(added CR-0002)*
- **AC-7.3** Given the server can't be reached, when a sample is sent, then Chat still completes using the in-browser demo and the step detail says "server unreachable, used the in-browser demo". *(added CR-0002)*
- **AC-7.4** Given any API error (unknown address, invalid request, a message that can't be read), then the answer is `{"error": {"code", "message"}}` with a plain-English message, and the web app shows that message. *(added CR-0002)*
- **AC-7.5** Given the server in live mode with no keys, then pipeline and send calls answer 503 "Not configured: add <SERVICE> key", and meta shows each service as "Missing key"; keys are read only from server environment variables. *(added CR-0002)*
- **AC-7.6** Given Settings in server mode, then it shows "Server mode: KaryaHub API", the API version and business name, each service's status from the server and the key it needs (the `KARYAHUB_*` key, or `AI_ENDPOINTS` for the LLM since it uses Studio AI); if the server can't be reached it says so and shows "Unreachable". *(added CR-0002, changed CR-0004: the LLM key comes from the server and is `AI_ENDPOINTS`)*

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
- **AC-11.1** Given demo data saved by v0.1.0, when the app opens, then jobs, documents, customers, reminder marks and settings are kept, each job gains the status "Work done, waiting for customer check", and the data is upgraded to the current version with the demo team added. *(added CR-0002, changed CR-0003: upgrades to data version 3)*
- **AC-11.2** Given the same document lines, then the server's GST totals equal v0.1.0's (CGST 9% + SGST 9%, total rounded to the rupee), inter-state supply uses IGST 18%, and the server's reminder text matches the web app's. *(added CR-0002)*

- **AC-11.3** Given demo data saved by the 0.2.0 preview (data version 2), when the app opens, then jobs and their proof-of-work state and history are kept, and the demo team and an empty access log are added. *(added CR-0003)*

### US-12: Engineering documentation
As the founder I want the architecture, design and risks written down so that any engineer can understand and continue the work.
- **AC-12.1** Given the repository, then `docs/architecture/` has HLD.md (context, building blocks, flows, deployment), LLD.md (API, errors, workflow, code, visit planner, webhook), RISKS.md (each risk with likelihood, impact, resolution and status) and REFERENCE-REVIEW.md (what was learned from the reference repositories and what KaryaHub adopts, adapts or defers). *(added CR-0002)*

### US-13: Staff sign-in (retired in CR-0005)
The on-device demo sign-in below is replaced by server sign-in, [US-18](#us-18-sign-in-on-the-server) and its screens, [US-22](#us-22-sign-in-admin-and-business-screens). The criteria stay listed as history, as the process requires.
As a member of a firm's team I want to sign in with my mobile number and a PIN so that KaryaHub knows who I am and what I may do.
- **AC-13.1** Given nobody is signed in, when the app opens at any address, then only the Sign-in screen shows: mobile number and PIN fields (the PIN hidden) and the demo accounts (Akash Mehta, Priya Nair, Santosh Pawar, Imran Khan) with their roles and demo PINs. *(added CR-0003; Retired in CR-0005)*- **AC-13.2** Given the owner's number 9900000201 and PIN 2468, when I sign in, then Home opens, the account menu shows "Akash Mehta" and "Owner (admin)", and the access log records "Signed in as Owner (admin)". *(added CR-0003; Retired in CR-0005)*- **AC-13.3** Given a wrong PIN or a number not on the team, when I sign in, then I see "That mobile number and PIN don't match an active staff account. Check them, or ask the owner to reset your PIN." and stay on Sign in; a wrong PIN for someone on the team is logged as a failed sign-in. *(added CR-0003; Retired in CR-0005)*- **AC-13.4** Given the demo accounts, when I tap one, then its number and PIN are filled in. *(added CR-0003; Retired in CR-0005)*- **AC-13.5** Given I'm signed in, then reloading keeps me signed in; when I press Sign out, the Sign-in screen says "You have signed out.", the session is removed and the log records it. *(added CR-0003; Retired in CR-0005)*- **AC-13.6** Given any staff record, then it holds a salted SHA-256 hash of the PIN, never the PIN itself. *(added CR-0003; Retired in CR-0005)*
### US-14: Roles and limited access
As an owner I want each person to see only what their job needs so that money, paperwork and settings stay with the office.
- **AC-14.1** Given a technician signs in, then Chat opens and the navigation offers only Chat and Jobs; a job screen hides Create quote, Create invoice and Documents ("Quotes and invoices are made by the office."), and a verified job shows "Verified. The office closes the job." instead of Close job. *(added CR-0003)*
- **AC-14.2** Given a technician opens Home, Renewals, Settings, Admin or a document by its address, then they see "You don't have access to <screen>" with their name and role and "Ask your business owner to change your access in Admin", and none of that screen's content. *(changed CR-0005: the screen is decided by the server's permissions for that person, so an owner's switches change what opens)* *(added CR-0003)*
- **AC-14.3** Given an office coordinator signs in, then the navigation offers Home, Chat, Jobs and Renewals; they can create quotes and invoices and close verified jobs; Admin and Settings aren't offered and are refused if opened. *(added CR-0003)*
- **AC-14.4** Given a signed-in person moves a job through proof of work, then the history names them (for example "Santosh Pawar (Technician)") and the request carries no role: the server knows who they are. An action their access doesn't cover is refused in the app with "Your access doesn't include this. Ask your business owner." and nothing is sent. *(changed CR-0005)*
- **AC-14.5** Given the KaryaHub server, then `GET /api/v1/access/roles` returns the same starting roles, permissions and action rules as the web app, and a job action the signed-in person's permissions don't cover (for example a technician closing a job) is answered 403 "Your access doesn't include permission to close or manage jobs. Ask your business owner.". *(changed CR-0005)*

### US-15: Admin panel (retired in CR-0005)
The on-device Admin below is replaced by team management on the server, [US-19](#us-19-team-and-access-for-a-business), shown by [US-22](#us-22-sign-in-admin-and-business-screens).
As an owner I want to manage my team and their access in one place so that I control who can do what.
- **AC-15.1** Given the owner opens Admin, then it shows active staff counts in total and by role, the team (name, number, role, status, last sign-in), an Add staff form, the Roles and access table (9 permissions by 3 roles) and the access log. *(added CR-0003)* *(Retired in CR-0005)*
- **AC-15.2** Given I add "Neha Kulkarni", 9900000299, Technician, PIN 4321, then she appears in the team, the log records "Added Neha Kulkarni as Technician", and she can sign in with that number and PIN and gets technician access. *(added CR-0003)* *(Retired in CR-0005)*
- **AC-15.3** Given a name shorter than 2 letters, a number that isn't a 10-digit mobile or is already on the team, or a PIN that isn't 4 to 6 digits, then each field shows its own message and nobody is added. *(added CR-0003)* *(Retired in CR-0005)*
- **AC-15.4** Given I change Priya Nair's role from Office coordinator to Technician, then her access follows the new role and the log records the change. *(added CR-0003)* *(Retired in CR-0005)*
- **AC-15.5** Given I turn off someone's access, then they can't sign in and an open session of theirs ends with "Your access has been turned off. Ask the owner if you think this is a mistake."; turning access on restores it. *(added CR-0003)* *(Retired in CR-0005)*
- **AC-15.6** Given I press Reset PIN for someone, then a new 4-digit PIN is shown once ("New PIN for <name>: <PIN>. Share it with them in person; the old PIN no longer works."), the old PIN stops working and the new one works; the PIN itself isn't stored. *(added CR-0003)* *(Retired in CR-0005)*
- **AC-15.7** Given I try to change my own role, turn off my own access, or remove the last active owner, then it's refused with a plain reason and nothing changes. *(added CR-0003)* *(Retired in CR-0005)*

### US-16: Business look
As an owner I want KaryaHub to look like software a business runs on so that I trust it with my firm.
- **AC-16.1** Given a signed-in owner or coordinator on Home, then a "Today at <business>" row greets them by first name and shows four figures from the data: Jobs recorded, Waiting for customer check, Renewals in 30 days (with the ₹ at stake) and Quotes and invoices. *(added CR-0003)*
- **AC-16.2** Given any signed-in screen, then the business name and the signed-in person (name, role and Sign out) are visible. *(added CR-0003)*

### US-17: Real AI for job notes and photos
As an owner I want technicians' messages and job-sheet photos read by real AI so that drafts are right more often, and I want the app to keep working when the AI server is off. *(added CR-0004)*
- **AC-17.1** Given the server has no AI settings (`AI_ENDPOINTS` not set), then messages are read by the bundled demo reader (`reader` "demo"), no AI server is called, `GET /api/ai/status` answers `{"configured": false, "online": false}`, and meta shows the LLM as "Mock" with key `AI_ENDPOINTS`. *(added CR-0004)*
- **AC-17.2** Given AI is set up and online, when a message is extracted, then the server sends it to the everyday model (`AI_MODEL`, default `gemma4:e4b` since CR-0010; it was `qwen3.5:9b`) with the job JSON schema at temperature 0 and the shared key, and answers with the validated job and `reader` "ai"; `/api/ai/status` answers online and meta shows the LLM as "Studio AI". *(added CR-0004, changed CR-0010)*
- **AC-17.3** Given the AI finds no customer name, then the answer is `found: false` with `customer_name` missing, so Chat replies "I couldn't find a customer name, can you add it?". *(added CR-0004)*
- **AC-17.4** Given the AI's answer, then it is treated as untrusted: Mr/Ji are removed from names, phones that aren't 10-digit Indian mobiles, dates that aren't real `YYYY-MM-DD` dates and negative amounts are dropped, and an answer that can't be used falls back to the quick reader with the note "The AI answer couldn't be used, so this was read without AI. Check the details before approving." *(added CR-0004)*
- **AC-17.5** Given a job-sheet photo (JPEG, PNG or WebP, up to 3 MB) is sent with `image_base64`, then the AI reads its text (`reader` "ai"); another file type answers 422 "That photo isn't a JPEG, PNG or WebP image."; a photo with no readable text answers 422 "Couldn't read any text in this photo. Try a clearer photo, or type the details."; with no image the sample's stored text is used (`reader` "demo"). *(added CR-0004)*
- **AC-17.6** Given the AI server is offline, then messages are still read by the quick reader with `reader` "quick" and the note "AI is offline right now, so this was read without AI. Check the details before approving."; the sample photo falls back to its stored text the same way; a photo with no stored text answers 503 `ai_unavailable`; `/api/ai/status` answers offline; paperwork, transcripts and every other feature keep working. *(added CR-0004)*
- **AC-17.7** Given a message read by Studio AI, then the Extract step (and the photo step) says "Read by Studio AI (KaryaHub server)" and the job card shows a "Read by AI" tag. *(added CR-0004)*
- **AC-17.8** Given a message read without AI, then the steps say "Read without AI (KaryaHub server)", the processing panel shows the server's note, the job card shows a "Read without AI" tag, and the draft can be checked and approved as usual. *(added CR-0004)*
- **AC-17.9** Given server mode, when the job-sheet photo sample is sent, then the browser draws the sheet as a JPEG and sends it to the server with the request, and the step says who read it; where the browser can't draw it, no image is sent. *(added CR-0004)*
- **AC-17.10** Given the AI server is offline and a photo can't be read, then the technician's photo stays in the chat with the server's message and a Try again button, and the "AI is offline" banner appears. *(added CR-0004)*
- **AC-17.11** Given the app is open, then a banner "AI features are offline right now because the AI server is switched off. Everything else works as usual." shows while `/api/ai/status` says AI is set up but offline, hides when it is back, and never shows when AI isn't set up. *(added CR-0004)*
- **AC-17.12** Given chat saved by v0.2.0 (job cards without a reader), then it loads without reader tags or notes and its drafts approve as before. *(added CR-0004)*

### US-18: Sign-in on the server
As a member of a firm's team I want to sign in with my mobile number and PIN, on any phone, so that KaryaHub knows who I am and which business I belong to. *(added CR-0005; replaces US-13)*
- **AC-18.1** Given a right mobile number and PIN of an active person in an active business, when I sign in, then the server starts a session (an HttpOnly cookie that ends after 12 hours), answers who I am, my business and my permissions, `GET /api/v1/auth/me` says the same afterwards, and signing out ends the session at once. *(added CR-0005)*
- **AC-18.2** Given a wrong PIN, a number with no account, a switched-off person or a switched-off business, then every case gets the same plain message and nothing says which part was wrong. *(added CR-0005)*
- **AC-18.3** Given 5 wrong PINs for one number (account or not), then sign-in for that number is blocked for 15 minutes with a message that points to Forgot PIN, even for the right PIN. *(added CR-0005)*
- **AC-18.4** Given any person, then the database holds only a salted scrypt hash of the PIN mixed with a server secret, never the PIN; PINs of repeated digits or simple runs (1111, 1234) and PINs that aren't 4 to 6 digits are refused; PINs the server makes are 6 digits. *(added CR-0005)*
- **AC-18.5** Given no session, then job, AI, paperwork and team routes answer 401 `signin_required`; a request that carries the session cookie but not the app's own header is refused 403, so other websites can't act for a signed-in person; a made-up or expired session counts as signed out. *(added CR-0005)*
- **AC-18.6** Given a person on a temporary PIN (new people, reset PINs), then everything except choosing their own PIN is refused until they do; a weak, unchanged or wrongly confirmed PIN is refused with a reason. *(added CR-0005)*
- **AC-18.7** Given any request, then what the person may do comes from the server's records; a role named in the request body is ignored. *(added CR-0005)*

### US-19: Team and access for a business
As a business owner I want to add my people, give them a role and decide what each may do, so that every person sees only what their job needs. *(added CR-0005; replaces US-15)*
- **AC-19.1** Given I'm an owner (or someone allowed to manage the team), when I add a person with name, mobile number and role (and optionally a PIN), then they join my team, a generated 6-digit PIN is shown to me once, and they can sign in; a mobile number belongs to one account across all businesses, and bad names, numbers, roles or PINs are refused in plain words. *(added CR-0005)*
- **AC-19.2** Given a CSV with the columns name, phone, role and an optional pin (up to 200 rows), when I import it, then every good row is added (a PIN is generated when empty), bad rows are listed with their row number and reason, and a file without the needed columns, or empty, is refused. *(added CR-0005)*
- **AC-19.3** Given a person on my team, then I can change their role, turn their access off (their open sessions end at once) and on, and reset their PIN; I can't change my own role or switch myself off, only an owner can add or change owners, and a business always keeps an active owner. *(added CR-0005)*
- **AC-19.4** Given a coordinator or technician role, then I can switch single permissions on or off for everyone with that role, and allow, block or reset a permission for one person; the change applies on the very next request; owners always keep the team and settings; people without "manage team" can't open the team screens. *(added CR-0005)*
- **AC-19.5** Given another business, then its people, team, activity log and settings can't be listed, changed or reset from mine. *(added CR-0005)*
- **AC-19.6** Given team changes, then each is recorded in an activity log (who, what, when) the owner can read; PINs are never written to it. *(added CR-0005)*
- **AC-19.7** Given the demo business, then its team can be read but not changed by anyone, since its PINs are public. *(added CR-0005)*
- **AC-19.8** Given I'm an owner, then I can change my business's name, address, GSTIN and state code, they're checked, and quotes, invoices and reminders use them. *(added CR-0005)*

### US-20: Businesses and the platform admin
As the founder running KaryaHub I want to create each business and its first owner, so that firms can start without me handling their data. *(added CR-0005)*
- **AC-20.1** Given no platform admin exists, then First-time setup creates one, but only with the setup token from the server's settings (`KARYAHUB_BOOTSTRAP_TOKEN`); with the token and the same number it resets that admin's PIN; a wrong token, another number or no token set is refused. *(added CR-0005)*
- **AC-20.2** Given I'm the platform admin, then I can create a business with its first owner (a temporary 6-digit PIN is shown once), list every business with its people count and owners, and turn a business off or on (when off, its people are signed out and can't sign in); the demo business always stays on; bad details, and a number that's already in use, are refused with nothing half-created. *(added CR-0005)*
- **AC-20.3** Given I'm the platform admin, then I see no business data: team, jobs, AI and paperwork routes are closed to me. *(added CR-0005)*
- **AC-20.4** Given an owner has lost their PIN, then the platform admin can issue a new temporary PIN (never for the demo accounts); the owner's open sessions end and they must choose their own. *(added CR-0005)*
- **AC-20.5** Given anyone who isn't the platform admin, then business routes are refused (403 when signed in, 401 when not). *(added CR-0005)*

### US-21: Forgot PIN with a code
As someone who forgot their PIN I want to set a new one with a code, so that I'm not stuck until the owner is free. *(added CR-0005)*
- **AC-21.1** Given a mobile number, when I ask for a code, then a 6-digit code (valid 10 minutes, 5 tries, at most 3 codes per 15 minutes) lets me choose a new PIN; the code works once, my old sessions end and a lock-out is cleared; wrong, used and expired codes are refused. *(added CR-0005)*
- **AC-21.2** Given codes travel by WhatsApp, then until WhatsApp is live only the demo business's accounts get a (simulated) code on screen; for every other number, known or not, the answer is the same: text-message codes aren't switched on, ask your business owner. When WhatsApp is live the code is sent through the WhatsApp adapter and never appears in the reply. *(added CR-0005)*

### US-22: Sign-in, Admin and business screens
As any signed-in person I want clear screens for signing in, my account, my team and my business, so that KaryaHub looks and works like a finished product. *(added CR-0005)*
- **AC-22.1** Given nobody is signed in, then any address shows "Sign in to KaryaHub" with a mobile number and a PIN (hidden), "Forgot your PIN?", and no business name; the demo accounts sit under "Explore a demo business" and tapping one fills the number and PIN. *(added CR-0005)*
- **AC-22.2** Given a real business, then no screen carries demo wording: no Demo pill, no "Sample data", no watermark or "dummy" tags, no sample-message chips, no Reset demo or mode switches; Home shows a "Get started" panel instead of the sales story; and Settings has the business details form. The demo business keeps all of these. *(added CR-0005)*
- **AC-22.3** Given the server's permissions for the signed-in person, then the navigation, the screens that open, the no-access page and the start page follow them; a person with no access at all lands on My account with a plain explanation. *(added CR-0005)*
- **AC-22.4** Given I'm the platform admin, then Businesses shows each business with people, owners and status, a form to create one with its owner, the temporary PIN once, turn off and on, and reset an owner's PIN. *(added CR-0005)*
- **AC-22.5** Given I manage a team, then Admin shows counts by role, the team with role, status and per-person access, an Add a person form, a CSV import with row-by-row problems, the role table with switches, any new PINs once (with a CSV download) and the activity log; in the demo business every control is switched off with a plain note. *(added CR-0005)*
- **AC-22.6** Given I'm signed in, then My account shows who I am, what I can do and a form to change my PIN. *(added CR-0005)*
- **AC-22.7** Given a temporary PIN, forgotten PIN or no platform admin yet, then the matching screen (choose your own PIN, forgot PIN and reset, first-time setup) explains each problem in plain words. *(added CR-0005)*
- **AC-22.8** Given data saved on this device by v0.3.0 or earlier, then it loads for the demo business with jobs, documents and reminders kept (the on-device team and log are dropped, they live on the server now); each business keeps its own data on the device, and a new business starts empty. *(added CR-0005)*
- **AC-22.9** Given the app opens, then it asks the server who is signed in; if the server can't be reached, a calm "Can't reach KaryaHub" screen with Try again shows, and a platform admin sees only Businesses. *(added CR-0005)*
- **AC-22.10** Given I press a button that saves (Create business, Add to team, Import people, Save details, Change PIN) or a one-off action (Reset PIN, Turn access on or off), then it shows progress and switches off until the server answers, a second press is ignored so one press makes one change, a refused attempt switches it back on and keeps what I typed, and the result (a new PIN, a confirmation or an error) is scrolled into view below the header and given focus. *(added CR-0006)*

- **AC-22.11** Given I'm on Admin, then the **Add a person** button at the top takes me to the form below it and puts the cursor in the name box, without leaving Admin (it used to be a link that the app read as an unknown page and sent to Home). *(added CR-0009)*

### US-23: Business data on the server
As an owner I want my firm's customers, jobs, quotes, invoices and chat kept on the server for my business only, so that my whole team sees the same work on any phone, even from a weak signal. *(added CR-0009)*
- **AC-23.1** Given a real business, when its people create or change customers, jobs, documents or chat messages, then they are saved on the server under that business, and another phone signed in to the same business gets them. *(added CR-0009)*
- **AC-23.2** Given two businesses, then neither can read or change the other's records: a pull never includes them, a push that reuses another business's record id makes a separate record and leaves the other untouched, and a proof-of-work step on another business's job is refused; the database enforces the same wall with row-level security on every business-data table, and `/api/health` says whether it is on. *(added CR-0009)*
- **AC-23.3** Given the owner's permissions, then each kind of record needs one permission to read and one to change (for example a technician cannot read documents, and a person with Chat switched off cannot save chat messages); a refused change comes back as rejected with a plain reason, and the phone puts the server's version back and says so. *(added CR-0009)*
- **AC-23.4** Given the same change is sent more than once (an answer was lost, a retry), then it is applied once: no duplicate record, and the same answer comes back each time. *(added CR-0009)*
- **AC-23.5** Given two phones create jobs and documents at the same time, then the server gives each a different number from the business's own counters (`J-0001`, `QT-2026-0001`, `INV-2026-0001`), and neither phone's record overwrites the other. *(added CR-0009)*
- **AC-23.6** Given a job, then its state, history and customer code belong to the server: a phone's older copy cannot change them, a proof-of-work step is saved on the server and other phones see it, and a step on a job that has not reached the server yet is refused with a plain message. *(added CR-0009)*
- **AC-23.7** Given a phone holds jobs, customers, documents or chat from before this version, then they can be sent to the server once per phone: customers with the same mobile number are merged, numbers already given to jobs and documents are kept, ids are made unique per phone, the business's counters move past them, a second try imports nothing, and two phones of one business can both import. *(added CR-0009)*
- **AC-23.8** Given I sign in to a real business, then the data on screen comes from the server (the phone keeps only a copy); the first time, what the phone already held is moved with a notice saying how many items, nothing is moved twice, and the demo business never syncs and stays on the device. *(added CR-0009)*
- **AC-23.9** Given there is no signal, then I can still approve jobs, make quotes and invoices and write in Chat; the changes are saved on the phone first and queued, the screen says how many are waiting, and when the signal returns they are sent once each, in order, even if the app was closed and reopened in between. *(added CR-0009)*
- **AC-23.10** Given the server answers late, fails or is unreachable, then the queue is kept and tried again with growing waits, nothing typed is lost, and a change the server rejects is shown with its reason instead of being retried forever. *(added CR-0009)*
- **AC-23.11** Given I'm the owner, then Settings lets me change the business name, address and GSTIN (saved on the server) and add, replace or remove a logo (PNG, JPEG or WebP, up to 200 KB); the logo shows in Settings and on quotes and invoices for my business's people only, is not served to other businesses or to anyone signed out, and each change is in the activity log. *(added CR-0009)*
- **AC-23.12** Given the demo business, then the server refuses to sync or import for it (its data stays on the device), so visitors never see each other's demo work. *(added CR-0009)*

### US-24: Chat works and AI is smooth
As an owner or technician I want Chat to take one message after another and show what the AI is doing while I wait, so that reading a job never feels stuck. *(added CR-0010)*
- **AC-24.1** Given a release, then `/api/health` and `/api/v1/meta` show the version in `studio.json`, and the copy bundled with the server matches it. *(added CR-0010)*
- **AC-24.2** Given `AI_MODEL` names a model the AI computer doesn't have, when a message is read, then it is still read by AI with a model the computer has (from `AI_MODEL_FALLBACK`), not marked offline, and the missing model is asked for only once. *(added CR-0010)*
- **AC-24.3** Given a photo, then it is read by `AI_MODEL_VISION` (default: the everyday model); notes use the everyday model (default `gemma4:e4b`). *(added CR-0010)*
- **AC-24.4** Given the server function may run 120 seconds (`vercel.json`), then each AI step may take 90 seconds by default (`KARYAHUB_AI_STEP_SECONDS`), and never more than 110. *(added CR-0010)*
- **AC-24.5** Given the AI answers slowly but within the step limit, then its answer is used. *(added CR-0010)*
- **AC-24.6** Given the AI doesn't answer within the step limit, then the message is read without AI with the offline note, and every detail the quick reader finds is kept. *(added CR-0010)*
- **AC-24.7** Given AI is set up, when Chat opens, then `POST /api/v1/ai/warm` loads the everyday and photo models without answering, at most once a minute; with AI not set up or offline it answers calmly without an error; signed out it is refused. *(added CR-0010)*
- **AC-24.8** Given a job-sheet photo, then `POST /api/v1/pipeline/read-image/stream` sends its text in pieces as the AI writes it, then one final line with the full text and reader; offline, the sample photo's stored text comes back labelled "Read without AI"; an unknown photo ends with `ai_unavailable`; a file that isn't a photo is refused with 422 before anything streams. *(added CR-0010)*
- **AC-24.9** Given any AI call, then the server writes one log line with the model, the server's name, the outcome and the seconds, never the key, the address or the message. *(added CR-0010)*
- **AC-24.10** Given I can use Chat, when I open it, then the app asks the server to warm the AI (at most every 5 minutes) and shows nothing, whether that works or not. *(added CR-0010)*
- **AC-24.11** Given the AI is reading a message, then its step says what is happening ("Reading the message…", "Reading the job sheet…"), counts the seconds and offers **Stop**; Stop ends the wait with "Stopped. Your message is kept: press Try again to read it again.", and Try again reads it. *(added CR-0010)*
- **AC-24.12** Given a job-sheet photo, then its text appears in Chat as the AI reads it and is replaced by the finished transcript; only the finished text is saved; a server without the stream still works. *(added CR-0010)*
- **AC-24.13** Given the API client, then it reads the photo stream piece by piece, tells apart an AI error, an unreachable server and Stop, and waits longer than the server's AI step (100 to 120 seconds). *(added CR-0010)*
- **AC-24.14** Given a message has been read, then the message box, Send and the samples work again, so the next message can be sent at once. *(added CR-0010)*

## Screens and flows
Sign in first (CR-0003). Then a bottom tab bar on phones and a dark sidebar on desktop, showing only the screens the person's role allows: Home, Chat, Jobs, Renewals (Workspace) and Admin, Settings (Manage). An account menu in the top bar shows the person and role, with Settings, Admin and Sign out.

| Screen | Shows | Empty state | Error state |
|---|---|---|---|
| Home | Problem headline, 3 problem cards, money at stake, "See how it works" | n/a (demo data always loaded) | n/a |
| Chat | WhatsApp-style thread, sample picker, text box, processing panel, summary card with Edit / Approve | Hint: "Pick a sample to start" | Red failed step with retry |
| Jobs | Newest-first jobs with status; job detail with Create quote / Create invoice, Proof of work (status, steps, Send code, code entry, Close, history) and AMC service visits | "No jobs yet, send a sample in Chat" (after reset) | Server unreachable or wrong code: red note with what to do |
| Document | Quote or invoice with CGST/SGST, DEMO watermark, Download | n/a | "Check quantity and rate" for bad lines |
| Renewals | Filter chips 30 / 60 / 90 / Lapsed; cards with Send reminder; customer-side preview sheet | "No contracts" (only if demo data removed) | n/a |
| Sign in (CR-0003) | Pitch in three points, mobile and PIN form, demo accounts | n/a | "That mobile number and PIN don't match…"; "Your access has been turned off…" |
| Admin (CR-0003, owners) | Staff counts, team with role, status, Reset PIN and access switch, Add staff, Roles and access table, access log | "No sign-ins or team changes yet." | Field messages; refusals with a plain reason |
| No access (CR-0003) | Who you are, what to do, a button to your start page | n/a | n/a |
| Settings | Where messages are processed (server, in browser, live keys), server connection, service status and needed keys, Simulate failure switch, Reset demo, theme | "Checking the KaryaHub server…" | "Can't reach the KaryaHub server" |

Demo flow (3 minutes): Sign in as the owner → Home → See how it works → pick voice note → watch processing → Approve → Create invoice → Send code → Verify → Close → Renewals → Send reminder. Then (1 minute) Admin → sign out → sign in as Santosh (technician) to show limited access.

## Look and feel
- **Personality:** dependable, quick, money-aware.
- **Who and where:** an owner watching over the founder's shoulder on a phone in a busy shop, or on a laptop video call.
- **Colour mood:** calm, trustworthy teal with a familiar WhatsApp-like chat area; money in strong green, lapsed in red. Main brand colour: deep teal **#0F766E**. Do not copy WhatsApp's logo or exact green.
- **Typography:** friendly, legible sans (Inter or Noto Sans); large numerals for ₹ totals.
- **References:** WhatsApp chat layout (familiar), Khatabook's big-number ledger, Linear's clean lists. Unlike IndiaMART-style AMC software with dense grey tables, KaryaHub shows one big number and a chat.
- **Avoid:** dense tables on mobile, jargon ("tickets", "SLA"), tiny tap targets, stock photos, anything implying real messages are sent.
- **Delight moment:** the processing steps tick through and the summary card lands in the chat, then the Home total updates to show the new ₹ at stake.

## Data model
The demo business keeps its data in the browser (localStorage in try/catch, data version 4 since CR-0005), seeded from bundled demo JSON, and the server computes and checks for it (ADR-0007, ADR-0009). **Since CR-0009 a real business's customers, jobs, documents and chat messages live on the server** (table `records`, one row per item, scoped by `business_id`; ADR-0013) and the browser keeps a copy plus a queue of changes not yet sent. Data saved by v0.1.0 to v0.4.3 is upgraded on load and sent to the server once (AC-23.7).

| Entity | Fields |
|---|---|
| Customer | id, name, phone, area, equipment, amc_expiry (ISO), amc_value (₹), reminded_at |
| Sample | id, kind (voice or photo), label, media_url (bundled asset), mock_transcript, mock_extraction |
| Message | id, from (technician, bot, customer), kind (text, voice, image, card, document), body, at |
| Job | id, customer_id, date, work_done, parts, source_sample_id, approved_at, state (NEW, ASSIGNED, IN_PROGRESS, WORK_DONE, VERIFIED, CLOSED, CANCELLED; added CR-0002), events [{id, action, from_state, to_state, client_op_id, actor, channel, detail, received_at}] (added CR-0002), otp {challenge, expires_at, demo_code} (added CR-0002) |
| Document | id, job_id, type (quote or invoice), lines [{description, qty, rate}], cgst, sgst, total |
| Settings | business_name, gstin (dummy), mode (server, mock or live; server added CR-0002), simulate_failure, theme |
| Staff (added CR-0003) | id, name, phone, role (owner, coordinator, technician), active, pin_hash (salted SHA-256), created_at, last_sign_in |
| Access log entry (added CR-0003) | id, at, who, text |
| Session (added CR-0003, separate storage key) | staff_id, signed_in_at |
| Record (server, added CR-0009) | business_id, kind (customer, job, document, message), id (unique per business), number (jobs and documents, given by the server), body (the item as above), seq (change counter), updated_at |
| Sync operation (server, added CR-0009) | business_id, op_id (unique per business), result; makes a repeated change harmless |
| Counter (server, added CR-0009) | business_id, name (seq, job, quote, invoice), value |
| Device import (server, added CR-0009) | business_id, device_id, imported_at, counts; one row means that phone's data was moved |
| Tenant (server) | id, business_name, address, gstin, state_code, vertical, language, amc_visit_every_days, amc_lead_days, is_demo (added CR-0002) |

## Non-functional requirements
- Works from 360px wide; tap targets at least 44px.
- Loads in under 2 seconds; no network calls in the in-browser mode. API answers in mock mode in under 1 second.
- Secrets only in server environment variables (`KARYAHUB_*`, and the shared `AI_ENDPOINTS` and `AI_GATEWAY_KEY` for Studio AI); live mode without a needed secret fails closed with a clear message.
- AI (CR-0004, changed CR-0008 and CR-0010): opening a connection to the AI server may take up to 20 seconds and the online check up to 12 (the AI computer is reached through Tailscale Funnel), and one connection is reused; each AI step is limited to 90 seconds (`KARYAHUB_AI_STEP_SECONDS`) inside a 120-second server function, and the app waits 115; a model the AI computer lacks falls back to another it has (`AI_MODEL_FALLBACK`); every AI call is logged without secrets; when AI is offline or unusable, messages are read without AI and labelled, never lost.
- Server code: Python 3.12, FastAPI, Pydantic v2, Ruff, pytest (stack tier R; UI stays plain JavaScript, ADR-0005).
- Accessible: labelled controls, WCAG AA contrast, keyboard use, visible focus; voice-note bubbles show the transcript as text.
- Light and dark themes following the system setting, with a manual switch.
- Plain-language errors; ₹ in Indian format (1,00,000).
- Access (CR-0003, changed CR-0005): every screen and job action is checked against the signed-in person's permissions on the server; PINs are stored only as salted hashes with a server secret; sessions are HttpOnly cookies; the starting role table is identical on the web app and the server.
- Speed (CR-0007): the server runs in Singapore (`vercel.json` `regions`), next to the Neon database, and because distance still matters a sign-in makes at most 8 database statements and a signed-in request at most 2; the app waits 20 seconds (30 for opening the app and signing in) before saying it can't reach the server.
- Data (CR-0005): people, businesses, sessions and the activity log live in one Postgres database (Neon, `karyahub_master_db`) with `business_id` on every business-owned row and every query filtered by it. With a real database `KARYAHUB_PIN_PEPPER` must be set or accounts refuse to run. The address is never printed or returned.
- The demo business holds only dummy names, phones and GSTINs, labelled as demo. Real businesses' people, customers, jobs, documents and chat are real and live on the server (CR-0009).
- Business wall (CR-0009): every business-data row carries `business_id`; every server statement filters by it; Postgres row-level security with a policy on `business_id` is the second wall, and `/api/health` reports `row_level_security`.
- Weak signal (CR-0009): the app works from its on-device copy and sends queued changes when it can; one sync call sends up to 100 changes and brings back what changed; the server ignores a change it has already applied.

## Out of scope
- Real WhatsApp phone numbers or message sending (the webhook exists and is tested, but no number is connected; changed CR-0002).
- Real speech-to-text and paid LLM or OCR services (speech stays a demo adapter). Changed CR-0004: messages and photos are read by Studio AI, the founder's own AI server, once its settings are linked.
- A server database, background queue, attempt limits on customer codes, and cross-delivery de-duplication (see RISKS.md R-04, R-05, R-07, R-13).
- Valid tax invoices, e-invoicing, payments or payment links.
- Real server-side accounts, PIN attempt limits and a database for people (done in CR-0005; ADR-0012). Done in CR-0009: jobs, customers, documents and chat on the server. Still out of scope: inventory (CR-0011), per-financial-year gap-free document numbers (CR-0012), editing the same record on two phones at once without the later change winning, and delivering sign-in codes by SMS or WhatsApp to real numbers until WhatsApp is live.
- Technician app, GPS or photo-based risk scoring, inventory and attendance (see REFERENCE-REVIEW.md).
- Regional language UI (sample voice notes may be Hinglish with English transcripts).

## Open questions
Answered for CR-0001 with the analyst's recommended defaults; the founder can change them with a change request:
- Demo vertical: **AC service** (alternatives: RO purifiers, fire safety).
- Firm name: a dummy firm, **"CoolCare AC Services (demo)"**, presented by KaryaHub.
- Reminder language: **English** (Hindi can be added later).
