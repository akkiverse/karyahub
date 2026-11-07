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
- **AC-1.1** Given the demo business, then Home shows the banner headline "Bill, track stock, and manage field jobs all in one place." and three problem cards: lapsed renewals, re-typing job sheets, and no view of field work. *(added CR-0001, changed CR-0015)*
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

### US-4: Estimate and GST bill from a job (changed CR-0012)
As an owner I want an estimate or bill made from a job so that I can see paperwork done for me.
- **AC-4.1** Given an approved job, when I press "Make estimate" or "Make bill", then the bill editor opens with the job's lines (AC-29.4), and the saved bill shows the demo business name and GSTIN, customer, line items, subtotal, GST at 18% split into CGST 9% and SGST 9%, and a total rounded to the rupee, worked out as in AC-27.4. *(changed CR-0012)* *(added CR-0001)*
- **AC-4.2** Given any bill or estimate of the demo business, then it carries a visible "Sample" mark (AC-30.6); documents from v0.7.0 keep their "DEMO, not a valid tax invoice" watermark. *(changed CR-0012)* *(added CR-0001)*
- **AC-4.3** Given a saved bill or estimate, when I press Print (or Download on a v0.7.0 document), then the browser print dialog opens with a print-styled layout (save as PDF), with no external service; real businesses also get Download PDF (AC-30.4). *(changed CR-0012)* *(added CR-0001)*
- **AC-4.4** Retired in CR-0012 (sending is now Send on WhatsApp, US-31). Was: given a document, then the chat shows a bot bubble "Quotation sent to Ramesh Sharma" with a document attachment preview (simulated, nothing is sent). *(added CR-0001)*

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
- **AC-14.1** Given a technician signs in, then Chat opens and the navigation offers only Chat and Jobs; a job screen hides Make estimate, Make bill and Documents ("Estimates and bills are made by the office.", changed CR-0012), and a verified job shows "Verified. The office closes the job." instead of Close job. *(added CR-0003)*
- **AC-14.2** Given a technician opens Home, Renewals, Settings, Admin or a document by its address, then they see "You don't have access to <screen>" with their name and role and "Ask your business owner to change your access in Admin", and none of that screen's content. *(changed CR-0005: the screen is decided by the server's permissions for that person, so an owner's switches change what opens)* *(added CR-0003)*
- **AC-14.3** Given an office coordinator signs in, then the navigation offers Home, Bills, Chat, Jobs, Inventory and Renewals (Inventory added CR-0011, Bills CR-0012); they can make estimates and bills and close verified jobs; Admin and Settings aren't offered and are refused if opened. *(added CR-0003)*
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
- **AC-22.2** Given a real business, then no screen carries demo wording: no Demo pill, no "Sample data", no watermark or "dummy" tags, no sample-message chips, no Reset demo or mode switches; Home shows the banner (AC-42.1) and the Get Started Checklist instead of the problem cards (changed CR-0015); and Settings has the business details form. The demo business keeps all of these. *(added CR-0005)*
- **AC-22.3** Given the server's permissions for the signed-in person, then the navigation, the screens that open, the no-access page and the start page follow them; a person with no access at all lands on My account with a plain explanation. *(added CR-0005)*
- **AC-22.4** Given I'm the platform admin, then Businesses shows each business with people, owners and status, a form to create one with its owner, the temporary PIN once, turn off and on, and reset an owner's PIN. *(added CR-0005)*
- **AC-22.5** Given I manage a team, then Admin shows counts by role, the team with role, status and per-person access, an Add a person form, a CSV import with row-by-row problems, the role table with switches, any new PINs once (with a CSV download) and the activity log; in the demo business every control is switched off with a plain note. *(added CR-0005)*
- **AC-22.6** Given I'm signed in, then My account shows who I am, what I can do and a form to change my PIN. *(added CR-0005)*
- **AC-22.7** Given a temporary PIN, forgotten PIN or no platform admin yet, then the matching screen (choose your own PIN, forgot PIN and reset, first-time setup) explains each problem in plain words. *(added CR-0005)*
- **AC-22.8** Given data saved on this device by v0.3.0 or earlier, then it loads for the demo business with jobs, documents and reminders kept (the on-device team and log are dropped, they live on the server now); each business keeps its own data on the device, and a new business starts empty. *(added CR-0005)*
- **AC-22.9** Given the app opens, then it asks the server who is signed in; if the server can't be reached, a calm "Can't reach KaryaHub" screen with Try again shows, and a platform admin sees only Businesses. *(added CR-0005)*
- **AC-22.10** Given I press a button that saves (Create business, Add to team, Import people, Save details, Change PIN) or a one-off action (Reset PIN, Turn access on or off), then it shows progress and switches off until the server answers, a second press is ignored so one press makes one change, a refused attempt switches it back on and keeps what I typed, and the result (a new PIN, a confirmation or an error) is scrolled into view below the header and given focus. *(added CR-0006)*

- **AC-22.11** Given I'm on Admin, then the **Add a person** button at the top takes me to the form below it and puts the cursor in the name box, without leaving Admin (it used to be a link that the app read as an unknown page and sent to Home). *(added CR-0009)*

- **AC-22.12** Given I'm the platform admin on Businesses, then the **Add a business** button at the top takes me to the form below it and puts the cursor in the business name box, without leaving Businesses; and a link to a place on the same page (such as Skip to content) moves there and keeps the page, instead of being read as an unknown page and sent Home. *(added CR-0017)*

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
- **AC-23.11** Given I'm the owner, then Settings lets me change the business name, address and GSTIN (saved on the server) and add, replace or remove a logo (PNG, JPEG or WebP, up to 200 KB); the logo shows in Settings and on quotes and invoices for my business's people only, is not served to other businesses or to anyone signed out, and each change is in the activity log. *(added CR-0009)* *(changed CR-0019: the logo now sits in Settings → Bill look beside the signature, see AC-50.1)* *(changed CR-0019: the size and type limits are in AC-52.2 and AC-52.3)*
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

### US-25: Inventory per business
As an owner I want my firm's parts and their stock kept in KaryaHub, with the parts used on a job taken from stock, so that I know what I have, what is running low and what each job used. Technicians work on WhatsApp, so they get no inventory access unless the owner gives it to one of them. *(added CR-0011; design: [mockup](../design/mockups/inventory.html))*
- **AC-25.1** Given I can see inventory, when I open Inventory, then I see my business's items in use, sorted by name, each with name, code, unit, quantity in stock and its mark, and tiles for items, low and out of stock (plus stock value at cost if I manage inventory); on a phone each item is a card, from 760 px wide a table; Inventory is on the phone's tab bar and Admin moves to the account menu so the bar keeps five places. *(added CR-0011)*
- **AC-25.2** Given the search box, when I type, then the list shows items whose name or code contains every word I typed, ignoring capitals, spaces, dots and µ/u ("cap 45" finds "Capacitor 45 µF"), with no signal needed; the chips All, Low, Out and Stopped show their counts and filter the list; no match says "No items match “<words>”. Check the spelling, or add it as a new item." with an Add button (for people who manage inventory) that starts the new item with what was typed. *(added CR-0011)*
- **AC-25.3** Given an item's quantity and low-stock level, then the mark is: none above the level; amber **Low** at or below it; red **Out** at zero; red **Short by N <unit>** below zero (parts used on two phones at once); an item with no low-stock level shows only Out or Short. *(added CR-0011)*
- **AC-25.4** Given I manage inventory, when I add or edit an item, then I give a name (2 to 80 characters), an optional code (unique in my business, ignoring capitals), a unit (nos, kg, metre, litre, set or roll, or one of the business's own, AC-33.1), a sale price and optional cost price in ₹, an optional HSN code (4, 6 or 8 digits), a GST rate (0, 5, 18 or 40 %, default 18) and an optional low-stock level, and for a new item an opening stock; each wrong field shows its own message, a used code says "Code <code> is already used by <item>.", the opening stock is saved as the item's first move, and editing never changes the quantity, and the business's own details are asked for too (AC-32.4). *(added CR-0011; changed CR-0013)*
- **AC-25.5** Given an item, then it is never deleted: **Stop using** hides it from the list and every picker (it shows under the Stopped chip) and keeps its history, and **Use again** brings it back; a stopped item takes no stock in, stock out, count or part (a part already on a job can still be put back). *(added CR-0011)*
- **AC-25.6** Given I manage inventory and have a signal, when I import a CSV (columns code, name, unit, sale_price, cost_price, hsn, gst_rate, low_stock_at, opening_stock, and the business's own details; a template can be downloaded), then **Check** lists each row as new, update, no change or a problem with its row number and reason (empty name, a unit that is not a word, not a number, a code twice in the file, bad HSN or GST rate), and **Import** saves only the good rows; a row whose code already exists (or, with no code, whose name does) updates that item, keeps its quantity and its stopped state, and its opening stock is ignored (and says so); units may be written as common short forms (m, pcs, ltr) and the check says how each was read; importing the same file again changes nothing; an empty file, one without a name column, or more than 500 rows or 1 MB in one part is refused as a whole (the phone sends bigger files in parts, AC-34.5); without a signal the import says it needs one; a unit the business doesn't have yet is added by the import (AC-34.2, AC-34.4). *(added CR-0011; changed CR-0013)*
- **AC-25.7** Given I manage inventory, when I record **Stock in** (item, quantity above zero, date in dd-mm-yyyy not in the future, optional supplier, bill number and cost per unit), then the quantity rises by that much and the item's history shows it. *(added CR-0011)*
- **AC-25.8** Given I manage inventory, when I record **Stock out** with a reason (returned to supplier, damaged or lost, or used without a job with a note), then the quantity falls by that much; more than is in stock is refused with "Only <N> <unit> in stock. If that's wrong, count the stock first."; the form says that parts for a job are taken on the job's screen. *(added CR-0011)*
- **AC-25.9** Given I manage inventory, when I **Count** an item and enter what's on the shelf, then the form shows the difference before saving ("This records −1.5 kg as a count correction."), saving makes a correction move with an optional reason (the server works the difference out against its own quantity), and a count that matches says "Count matches. Nothing to change." and saves nothing. *(added CR-0011)*
- **AC-25.10** Given an item, then its history lists every move, newest first, with date, what it was, ± quantity, who, the job and the quantity after; a move can't be edited or deleted, and a mistake is fixed with a new move. *(added CR-0011)*
- **AC-25.11** Given a job that is not closed or cancelled and the permission to use parts, when I take a part from inventory on the job's screen (search, quantity), then the quantity in stock falls, the job lists the part with quantity and unit, and the job's history says "<name> used <qty> <unit> <item>"; **Remove** puts it back with a return move (never more than was taken); taking more than is in stock is allowed with the warning "Only <N> <unit> in stock. It will show as short until someone counts."; a closed job refuses with "This job is closed, so its parts can't change.". *(added CR-0011)*
- **AC-25.12** Given a job whose note names parts (`parts`), then each part that matches an item's name or code is offered as "From the note: <item>, take <qty> <unit>" (the quantity from the note, else 1), nothing is taken until I tap it, one I decline stays hidden, and a part with no match says "Not in your inventory: <text>" with an Add item button for people who manage inventory; this works without AI. *(added CR-0011)*
- **AC-25.13** Given a job with parts used, when the office makes its estimate or bill, then each part used becomes a line (item name, quantity, sale price), marked as from the job's parts so the bill takes no more stock (AC-27.10) after the job's own lines and every line can still be changed; a part the job's own lines already name is not added a second time; a part with a sale price of ₹0 is added at ₹0 so it can be priced. *(changed CR-0012)* *(added CR-0011)*
- **AC-25.14** Given no signal, then I can still take parts for a job and record stock in, stock out and counts; each change is saved on the phone first, shown at once, counted in the sync mark and sent once when the signal returns, even after the app was closed; a move sent twice is applied once; two phones that both use the last unit are both counted, and after syncing both show **Short by 1**. *(added CR-0011)*
- **AC-25.15** Given the server, then the quantity in stock and a job's list of parts are worked out by the server from the moves and a phone's copy can't set them; a stock move can't be changed once saved ("Stock moves can't be changed. Add a correction instead."); a move for an item or job that isn't my business's, a stopped item (except a part put back), or a closed job is rejected with a plain reason, and the phone takes the move back and says why. *(added CR-0011)*
- **AC-25.16** Given two businesses, then neither can list, change or use the other's items, moves or item codes, through sync, import or a job; the same code can be used in both; items, moves and codes sit behind the same row-level security as other records. *(added CR-0011)*
- **AC-25.17** Given the permissions `view_inventory` (See inventory), `manage_inventory` (Add items, import, stock in and out, counts) and `use_parts` (Take parts for a job), then they are on for the owner and the office coordinator and **off for technicians**, and an owner can switch each per role or per person (for example let one technician take parts); without `manage_inventory` the server sends no cost prices or stock value and the screen shows no add, import, stock in, stock out or count controls, with "Ask the office to add or correct stock."; without `view_inventory` Inventory is not offered and is refused if opened; a person with only `use_parts` sees the items they can take and no Inventory screen, history or prices; a technician with none of them sees nothing about parts on a job. *(added CR-0011)*
- **AC-25.18** Given item changes, imports (with counts), stock in, stock out and counts, then each goes in the activity log with who and when; parts used and put back go in the job's history. *(added CR-0011)*
- **AC-25.19** Given the demo business, then it has sample stock on the device, labelled sample data, that never syncs and has no CSV import; and given data saved by v0.6.0, then it loads with no items, its jobs keep their parts text, and nothing is put into stock from old jobs. *(added CR-0011)*

Phase 1 "Bills that are right" (v0.8.0, CR-0012) follows the Product Spec v3 (https://claude.ai/artifact/AtyPCQQWYaVSmg1K8gPxgC). Money is worked in paise and rounded half up; tests use 2 Nov 2026 (financial year 2026-27) on the server and 1 Jan 2027 on the phone.

### US-26: Business type and packs
As an owner, I want to say once what kind of business I run so that KaryaHub shows only the parts I use.
- **AC-26.1** Given a business with no type set, when its owner first signs in, then one screen asks "What kind of business do you run?" (Repair and service, Trader or distributor, Shop or counter sales, Other), the GST registration (Regular, Composition, Not registered) and the business's state; saving switches on the core plus Field service for Repair and service, and the core only for the others, whose packs show "Coming soon" in Settings. *(added CR-0012)*
- **AC-26.2** Given a business created before v0.8.0, or the demo business, then it is Repair and service, GST Regular, Field service on, with its saved state code; it never sees the question, and every screen it had in v0.7.0 is still there. *(added CR-0012)*
- **AC-26.3** Given Field service is off, then no menu, tab, button, field, Home figure or + New choice for jobs, Chat, renewals, AMC or proof of work appears, and their addresses and API routes answer 403 pack_off "This part of KaryaHub is switched off for your business."; switching it on again brings everything back with its data. *(added CR-0012)*
- **AC-26.4** Given I have manage_settings, when I switch a pack or change the GST registration in Settings, then it applies to everyone in the business at their next screen load and goes in the activity log; without the permission the switches are not shown and the server refuses with 403. *(added CR-0012)*
- **AC-26.5** Given any main screen, then one + New button offers only what my packs and permissions allow, in this order: Bill, Estimate, Item, Job (Field service); on a phone it sits at the bottom right within thumb reach; from 900 px it sits in the top bar, also on Admin and Settings. *(added CR-0012, changed CR-0015)*
- **AC-26.6** Given the screens added or changed in this release, then their words come from one words file, and a test scanning the screen sources finds none of "voucher", "ledger", "debit note" or "credit note". *(added CR-0012)*

### US-27: Bills that are right
As an office person, I want to make a correct GST bill in 3 taps, with discounts, several rates and MRP prices, so that the customer gets the right bill the first time.
- **AC-27.1** Given + New → Bill, then the bill opens dated today for "Walk-in customer"; I can pick a customer (search by name or phone) or keep walk-in, add lines by searching items (as AC-25.2) or typing a free line, and Save and share is the one main button; discounts, notes, terms, due date and place of supply sit behind More options. *(added CR-0012)*
- **AC-27.2** Given I add an item, then the line takes the item's unit, sale price and GST rate; if this customer was billed this item before, the price is the one on their last bill, marked "Last price"; an item marked "Service, no stock" (for example "Gas refill") is offered like any item and never counted in stock. *(added CR-0012)*
- **AC-27.3** Given a line, then its discount is a % (0 to 100) or ₹ (up to the line amount); a whole-bill discount (% or ₹) is spread over the lines in proportion to their amounts after line discounts, before tax, the last line taking any paisa left over; each line shows its taxable value. *(added CR-0012)*
- **AC-27.4** Given a GST Regular business, then each line's taxable value is quantity × rate minus discounts, rounded to the paisa; with the place of supply in my state, CGST and SGST are each taxable × rate ÷ 2, rounded; otherwise IGST is taxable × rate, rounded; the total is all taxable values plus taxes rounded to the rupee, the difference shown as "Round off". Example: 2 × ₹1,250 at 18% less 10%, same state: taxable 2,250.00, CGST 202.50, SGST 202.50, total ₹2,655. *(added CR-0012)*
- **AC-27.5** Given an item marked "Price includes GST", then the line's taxable value is its amount after discounts × 100 ÷ (100 + rate), rounded to the paisa, and tax follows AC-27.4: ₹118 at 18% gives 100.00 + 9.00 + 9.00 = ₹118; ₹100 at 18% gives 84.75 + 7.63 + 7.63, round off −0.01, total ₹100. *(added CR-0012)*
- **AC-27.6** Given lines at different GST rates (0, 0.25, 3, 5, 18, 40%; items gain 0.25 and 3), then the bill has a tax summary with one row per rate (taxable, CGST and SGST, or IGST); the place of supply is the customer's state, from the first two digits of their GSTIN when given, else chosen (default: my state), printed with the state's name and code. *(added CR-0012)*
- **AC-27.7** Given a Composition business, then the bill is headed "Bill of Supply", shows no tax and carries "Composition taxable person, not eligible to collect tax on supplies"; given Not registered, it is headed "Bill" with no GSTIN and no tax; items keep their GST rate, unused. *(added CR-0012)*
- **AC-27.8** Given a customer GSTIN, then it must be 15 characters in the GSTIN pattern with a correct check character, else "This GSTIN doesn't look right. Check it with the customer."; a bill of ₹50,000 or more to a customer without a GSTIN needs their address and state before Save; every line needs a description and a quantity above 0. *(added CR-0012)*
- **AC-27.9** Given a bill is saved, then the server works its figures out again and stores and prints its own; the phone and the server give identical figures for every case in the shared file tests/fixtures/gst_cases.json (at least 20 cases: same state, other state, MRP, line and bill discounts, several rates, Composition, Not registered, rounding). *(added CR-0012)*
- **AC-27.10** Given a saved bill, then each item line not taken from a job's parts makes a stock-out move "Sold on <number>", and cancelling the bill returns it ("Bill <number> cancelled"); service items and lines from a job's parts used make no move. *(added CR-0012)*

### US-28: Numbers and status
As an owner, I want every bill numbered with no gaps and its status clear so that my books are right and I can see who hasn't paid.
- **AC-28.1** Given I save a bill, then the server gives it the next number in my business's bill series for the financial year of its date (1 April to 31 March, India time): <prefix><yy-yy>/<n>, n padded to 4 digits, for example 26-27/0001 or AC/26-27/0001; estimates have their own series, E/26-27/0001; there are no gaps, and two phones saving at once get different, consecutive numbers. *(added CR-0012)*
- **AC-28.2** Given Settings, then the prefix is optional, up to 6 letters, digits, "/" or "-", and Settings refuses a prefix that would make a number longer than 16 characters; a new prefix applies from the next bill and never renumbers old ones. *(added CR-0012)*
- **AC-28.3** Given no signal, then I can make and keep a draft, and Save queues it as "Number given when online"; it can't be shared until the server has numbered it, then shows its number everywhere. *(added CR-0012)*
- **AC-28.4** Given a bill, then its status is Draft (no number; can be changed or deleted, deletion undoable for 10 seconds), Saved (numbered; can still be changed), Sent (shared or marked sent), Paid (marked paid, with a date), Overdue (Saved or Sent, not Paid, due date passed; worked out, never stored) or Cancelled, shown as the same coloured chip on every screen. *(added CR-0012)*
- **AC-28.5** Given a Sent or Paid bill, then it can't be changed or deleted ("A sent bill can't be changed. Cancel it and make a copy."); Cancel takes an optional reason, keeps the number, marks the screen, link and PDF "Cancelled", and can be undone for 10 seconds; Make a copy opens a new draft with the same customer and lines. *(added CR-0012)*
- **AC-28.6** Given the Bills list, then search (number, customer name or phone) and the chips All, Draft, Unpaid, Overdue, Paid and Cancelled, with counts, filter it, newest first; each bill is a card on a phone and a row in a table from 760 px. *(added CR-0012)*
- **AC-28.7** Given quotes and invoices saved by v0.7.0 or earlier (numbers like QT-2026-0003, lines without GST rates), then they open with their old number, lines and totals unchanged, show as Saved, are never worked out again (AC-11.2 still holds), and the new series starts at 0001. *(added CR-0012)*
- **AC-28.8** Given permissions, then create_documents (now labelled "Make estimates and bills") lets a person make, save, send and mark paid; a new cancel_bills ("Cancel bills", on for the owner only, switchable per role or person) is needed to cancel; technicians have neither by default; the server refuses either action without its permission (403). *(added CR-0012)*

### US-29: Estimate to bill
As an office person, I want an estimate to become a bill in one tap so that nothing is typed twice.
- **AC-29.1** Given an estimate (from + New or a job's Make estimate), then it uses the same editor, maths and layouts as a bill, is headed "Estimate" with "Valid until" (default 15 days, changeable), and never takes stock. *(added CR-0012)*
- **AC-29.2** Given a Saved or Sent estimate, when I press Make bill, then a draft bill opens with the same customer, lines, discounts and place of supply; saving it marks the estimate "Billed as <number>", and each links to the other. *(added CR-0012)*
- **AC-29.3** Given an estimate already billed, when I press Make bill again, then it says "This estimate is already billed as <number>." with Open bill, and no second bill is made. *(added CR-0012)*
- **AC-29.4** Given a job (Field service), then Make estimate and Make bill start from the job's lines and parts used as in AC-25.13, and the bill links to the job. *(added CR-0012)*

### US-30: The business's own look and a PDF link
As an owner, I want bills in my own look that my customer opens from a link so that I look professional without printing.
- **AC-30.1** Given manage_settings, then Settings → Bill look sets the layout (A4 classic, A4 modern, small receipt 80 mm), a brand colour (one of 6 that pass contrast), the logo (from K3), GSTIN, address, phone, bank details (account name, number, IFSC), UPI ID, terms and a signature image (PNG or JPEG, up to 300 KB), with a live preview of a sample bill. *(added CR-0012)* *(changed CR-0019: the signature's size and type are in AC-52.2 and AC-52.3)*
- **AC-30.2** Given a GST Regular bill in any layout, then the page and the PDF text show "Tax Invoice"; my name, address and GSTIN; number and date; the customer's name, address and GSTIN (when they have one); place of supply with state name and code; per line the description, HSN or SAC (a column shown when any line has one), quantity, unit, rate, discount, taxable value, tax rate and amounts; the totals, round off, the total in words in Indian style ("Rupees Two Thousand Six Hundred Fifty-Five only"); and the signature or "Authorised signatory". *(added CR-0012)*
- **AC-30.3** Given a saved bill, then its link https://karyahub-akkiverse.vercel.app/b/<token> (at least 128 random bits) opens without sign-in, shows only that bill with Download PDF, and is marked noindex; a wrong token says "This bill link isn't valid." without saying whether a bill exists. *(added CR-0012)*
- **AC-30.4** Given a bill link, then its PDF downloads in under 3 seconds, is under 300 KB (with a logo under 200 KB), prints ₹ correctly and follows the chosen layout; a cancelled bill's page and PDF show "Cancelled" across them. *(added CR-0012)* *(changed CR-0019: with a logo and a signature of up to 1 MB each, see AC-52.4)*
- **AC-30.5** Given I can make bills, when I turn a bill's link off, then it answers "This bill link has been turned off by <business>.", and turning it on brings back the same link; links stay on until turned off. *(added CR-0012)*
- **AC-30.6** Given the demo business, then bills are made and shown on the device with a "Sample" mark, never sync and get no link (the bill says "Links work for real businesses"), and Send on WhatsApp opens with sample text. *(added CR-0012)*

### US-31: Send on WhatsApp
As an office person, I want to send a bill or estimate on WhatsApp in one tap so that the customer has it at once, before KaryaHub has its own WhatsApp number.
- **AC-31.1** Given a saved bill or estimate, when I press Send on WhatsApp, then it opens https://wa.me/91<customer mobile>?text=<message> (no mobile: https://wa.me/?text=<message>) with "Namaste <name>, here is your bill <number> from <business> for ₹<total>: <link>" (an estimate says "your estimate <number>, valid until <date>"), and the bill becomes Sent. *(added CR-0012)*
- **AC-31.2** Given the one sender layer (rule 5), then Send goes through it: in v0.8.0 it answers with the link, because no business has WhatsApp connected, and a test shows the same call sends directly once K6 connects a number, with no screen change. *(added CR-0012)*
- **AC-31.3** Given Copy link or Share (the phone's share sheet where available), then the bill also becomes Sent; Mark as sent does the same without sharing, for a bill handed over on paper. *(added CR-0012)*
- **AC-31.4** Given a send, copy, share or mark as sent, then the bill's history and the activity log record who, when and how, and the business's monthly message count goes up by one (links included). *(added CR-0012)*

### US-32: The business's own item details and lists
As an owner, I want to decide what details my items carry (Brand, Material type, Size, Colour) and to keep my own lists of brands and the like, so that KaryaHub fits my trade and my staff pick instead of typing.
- **AC-32.1** Given I am the owner (permission manage_settings), when I open Inventory → Item details, then I can add a detail at the start or at any later time with a name (2 to 40 characters, not used twice, never one of the standard CSV columns such as unit or hsn) and a kind (text, number or pick-list), say whether it is needed on every item, shows in the item list, can be used to filter (pick-lists) and prints on bills, rename it, and stop it and use it again; a stopped detail keeps its values on the items; up to 15 details are in use at once; a business that has none is offered a short starter set for its kind of business (Brand, Material type, Size, Colour for a trader or shop; Brand and Model for a repair firm), added with one tap. *(added CR-0013)*
- **AC-32.2** Given a detail has values, when I change its kind, then text and number may swap only when every value fits (otherwise the values that don't fit are named), and a pick-list can't change into another kind. *(added CR-0013)*
- **AC-32.3** Given a pick-list detail, when anyone who manages inventory adds an entry (on the Item details screen, or by typing a new one while adding an item), renames it or stops it, then the list changes for everyone, an entry's name is unique in its list ignoring capitals and spaces, items point to the entry and not to its words (so a rename changes every item), a stopped entry can't be picked for a new item but old items keep it, and when two phones add the same name while offline the server keeps one, the second becomes a hidden alias, and an item that points to the alias is saved pointing to the first. *(added CR-0013)*
- **AC-32.4** Given the business has details, when I add or edit an item, then the form asks for each detail in use (a text box, a number box, or a box that suggests the list and accepts a new word), each wrong value shows its own message (a number that isn't one, a required detail left empty, a value that isn't in that list), the server checks them again and refuses what doesn't fit, and an item saved before details existed opens with empty details and can be saved. *(added CR-0013)*
- **AC-32.5** Given items with details, when I look at Inventory, then the details marked "show in the item list" appear on each card and as a column of the table, the search finds an item by any detail it holds (also those not shown), and each pick-list marked as a filter gives a menu that narrows the list to one entry; the item page shows all its details. *(added CR-0013)*
- **AC-32.6** Given a detail marked "print on bills", when an item is added to an estimate or bill, then its value joins the line's description (Wire (Havells, 0.75 sq mm)); details not marked are never printed; a line already on a bill is never changed when an entry is renamed later. *(added CR-0013)*
- **AC-32.7** Given the roles, then details are changed only with manage_settings (the owner), entries and units with manage_inventory (also the coordinator), and every person who sees items (view_inventory or use_parts) receives the details so the item reads in words; a technician with none of these receives none. *(added CR-0013)*
- **AC-32.8** Given two businesses, then neither sees the other's details, entries or units, and an item can point only to its own business's entries (a pointer to another business's entry is dropped). *(added CR-0013)*

### US-33: Units of my own
As an owner or office person, I want units such as Coil, Box or Dozen besides nos, kg and metre, so that I count and sell in the units my trade uses.
- **AC-33.1** Given I manage inventory, when I add a unit (a name of up to 12 characters that is not only digits) and say whether it takes whole numbers only, then it is offered on the item form, a name already used (also a built-in unit or one of its short forms, such as Metres) is merged into the existing unit, and the six built-in units stay as they were. *(added CR-0013)*
- **AC-33.2** Given an item with a unit of the business's own, then stock in, stock out, counts, parts used on a job and messages use its name, and a quantity must be whole when the unit says so ("Use a whole number for Coil."); a bill line prints the unit's name. *(added CR-0013)*
- **AC-33.3** Given a unit is stopped, then it is not offered for new items but stays on the items that have it; the item form can also make a unit on the spot ("New unit…"). *(added CR-0013)*

### US-34: Bulk upload with my own columns
As an owner, I want one CSV file to bring all my items in, with my own details as columns, so that I don't type hundreds of items.
- **AC-34.1** Given I have details, when I download the template, then it has code and name, a column for each detail in use (named as the detail is named; a header written with capitals, spaces or underscores reaches the same detail), then unit, sale_price, cost_price, hsn, gst_rate, low_stock_at and opening_stock, with one example row; with no details it is the same as before. *(added CR-0013)*
- **AC-34.2** Given a file, when I press Check, then nothing is saved and I am told which entries and units the import would add to my lists, which columns it will not import (and that I can add them as details), and each row's result; a "Sno" or serial-number column is quietly ignored. *(added CR-0013)*
- **AC-34.3** Given a brand or unit in the file looks like a typo of one I have (Havels for Havells), then the row says so before I import; the row is still imported if I go on. *(added CR-0013)*
- **AC-34.4** Given I press Import, then the good rows are saved with their details, new list entries and units are made first and the items point to them, a unit that is a number, a number detail with words or a required detail left empty is a problem for that row only, a row whose code or name exists updates it and keeps its quantity, and importing the same file again changes nothing. *(added CR-0013)*
- **AC-34.5** Given a file of more than 500 rows, then the phone sends it in parts of 500 (each with the column names), joins the answers and numbers the rows as the spreadsheet does. *(added CR-0013)*

### US-35: The phone says when it is nearly full
As a person using KaryaHub on a phone, I want to be told before the phone runs out of room, so that nothing I make is lost without my knowing.
- **AC-35.1** Given the business's data on the phone takes more than about 3 million characters, or the phone refuses to keep a save, then a plain message at the top says the phone is nearly full (or has no room left), what to do, and that what has already reached the server is safe. *(added CR-0013)*

### US-36: An item sold in several units
As an owner, I want one item to be sold in as many units as my trade uses (a wire by the coil, by the metre and by the box), each with its own price and its own stock, so that coils and loose wire are counted apart and a bill takes stock from the unit that was sold.
- **AC-36.1** Given I manage inventory, when I add or edit an item, then under "Also sold as" I can add other units (up to 49 besides the main one), each with its own sale price, optional cost price, optional low-stock level, optional opening stock (new items) and optionally the unit it is made by cutting and how many one of that unit gives; the unit first chosen stays the item's main unit; the form keeps what was typed when a row is added or taken off; the server refuses a unit twice, an unknown unit, a cut that starts from a unit the item doesn't have, units on a service item, and taking a unit off while it holds stock; editing never changes any unit's quantity; items made before this change read with no other units. *(added CR-0014)*
- **AC-36.2** Given an item with several units, then stock in, stock out and count each ask which unit, every unit's quantity moves on its own (a move says which unit; the main unit needs no label), the list and the item page show every unit's quantity and price, a unit's quantity can't go below zero by stock out, whole-number units take whole numbers, and a unit other than the main one is marked Low only when it has a level set (or Short when below zero), so a unit cut on demand is not "Out" all day; the Low and Out chips count an item with any such unit. *(added CR-0014)*
- **AC-36.3** Given an estimate or bill line for an item with several units, then the line has a Unit menu (the item's main unit first) and choosing one changes the line's unit name and its price to that unit's; a saved bill takes its stock from the unit sold, cancelling puts it back into that unit, and changing a saved bill moves only the difference in each unit; a bill saved before this change, whose lines name no unit, takes the main unit. *(added CR-0014)*
- **AC-36.4** Given parts taken for a job, then they are taken in the item's main unit; another unit is refused in plain words. *(added CR-0014)*
- **AC-36.5** Given a CSV file, then rows with the same code (or, with no code, the same name) are the units of one item: the first row is the main unit and each later row has its own unit, prices, opening stock and optionally cut_from (a unit of the same item in an earlier row) and cut_gives; the check counts items and unit rows separately, a cut from a unit the item doesn't have or the same unit twice is that row's problem, the import makes the item with every unit's stock, and importing the same file again changes nothing; an update from a file keeps a service item a service and a price that includes GST. *(added CR-0014)*
- **AC-36.6** Given I do not manage inventory, then cost prices of every unit are left out of what the server sends. *(added CR-0014)*

### US-37: Cut
As an owner or assistant, I want to cut a coil into loose metres in the app, so that the coil count and the loose-metre count stay true to the shelf.
- **AC-37.1** Given an item with two or more units and I manage inventory, when I press Cut and say which unit I cut, how many, the unit it makes and how many it gives, then the first unit goes down and the second goes up in one move (with the person, the date and an optional note), it is refused with a reason when there is not enough of the first unit, the numbers are not above 0, a whole-number unit is cut in parts, the two units are the same or the item isn't sold in both; with no signal it shows at once as waiting and is sent once; an item with one unit has no Cut button and a person who may not manage inventory can't cut. *(added CR-0014)*
- **AC-37.2** Given a unit that is made by cutting (AC-36.1), then the Cut sheet fills in its usual number (90) and the person may change it (88); the usual number is not changed. *(added CR-0014)*
- **AC-37.3** Given a saved cut, then it shows in the history of both units ("Cut into 90 m", "Cut from Coil") with who and when, the history of an item can be shown one unit at a time, and a saved move can't be changed (a mistake is fixed with a new move). *(added CR-0014)*

### US-38: Aurora Dark and Clean Light
As anyone using KaryaHub, I want to switch between a dark and a light look at any moment, so that it suits where I am working.
- **AC-38.1** Given a first visit, then the theme is Aurora Dark; given the Sun or Moon button in the top bar or on the sign-in screen, when I press it, then the theme changes at once, the button says which is on, and my choice is kept on this device under `kh-theme`. *(added CR-0015)*
- **AC-38.2** Given Settings, then I can choose Dark, Light or System; on System the app follows the device, also when the device changes; the button and the choice stay in step. *(added CR-0015)*
- **AC-38.3** Given a light or dark choice made on an earlier version, then it is kept; an earlier "Follow system", which was the default, starts dark. *(added CR-0015)*
- **AC-38.4** Given any page load, then the theme is set before the first paint; given something being typed, then switching theme leaves it alone. *(added CR-0015)*
- **AC-38.5** Given the stylesheet, then it holds the design system's exact colours for both themes, and the theme comes only from `data-theme`. *(added CR-0015)*
- **AC-38.6** Given any screen, then headings use Plus Jakarta Sans, the interface Inter, and rupee figures, GSTIN, HSN or SAC codes, bill numbers, mobile numbers, PINs and quantities JetBrains Mono; the fonts come with the app, with no outside request. *(added CR-0015)*
- **AC-38.7** Given either theme, then the bill paper is white with dark text; its A4 layouts carry the brand gradient in the default colour and the business's own colour otherwise; printing gives the paper alone on white. *(added CR-0015)*

### US-39: The shell
As anyone signed in, I want the same frame on every screen, so that I always know where I am and can get anywhere quickly.
- **AC-39.1** Given any signed-in screen, then the top bar shows "Workspace / <screen>"; on a phone a menu button opens the sidebar as a drawer, which closes on Escape, on the backdrop and on a link. *(added CR-0015)*
- **AC-39.2** Given Ctrl or Cmd + K or the box in the top bar (from 900 px), when I type, then it finds bills, estimates, items and jobs on this device, and a result opens it. *(added CR-0015)*
- **AC-39.3** Given search, then it shows only what this person may open. *(added CR-0015)*
- **AC-39.4** Given a main screen, then there is one + New button (AC-26.5). *(added CR-0015)*
- **AC-39.5** Given a change of screen, then the content enters with a short movement (280 ms), which never replays on a redraw of the same screen and is off under reduced motion. *(added CR-0015)*

### US-40: Home
As an owner, I want the money, the field work and the renewals on one screen, so that I can act without opening anything else.
- **AC-40.1** Given I may make bills, then four figures show: Billed today, Unpaid balance, Overdue with its rupees and how many, and, if I manage inventory, Stock valuation with how many items are low. Overdue means past its due date. *(added CR-0015)*
- **AC-40.2** Given technician messages, then the WhatsApp Field Feed shows the latest four with who, kind, time and what was read; a job waiting for a check links to Chat; an approved job offers Generate Bill from Note and Or make a GST quote, each opening the editor with the job's lines, and then Open bill or Open quote. *(added CR-0015)*
- **AC-40.3** Given I may see renewals, then the list shows the next five with customer, equipment, urgency and ₹ value, and Remind opens the same preview as on Renewals; no message is sent. *(added CR-0015)*
- **AC-40.4** Given I may make bills, then GST this month adds the taxable value, CGST, SGST, IGST and total of this month's saved bills only, with Make a bill. *(added CR-0015)*
- **AC-40.5** Given a technician, then Home shows no money. *(added CR-0015)*

### US-42: The Home dashboard
As an owner, I want Home to open on a clear banner and my latest bills in the form I prefer, so that I see the day's work in one look.
- **AC-42.1** Given Home, then a banner shows the headline, Create GST Bill Now, Switch to Kanban Board View, the next AMC job, the next four renewals as dots (green when reminded), a note, and three steps, for real and demo businesses alike. With Field service off it says nothing about jobs, WhatsApp or AMC. *(added CR-0015)*
- **AC-42.2** Given Hide banner, then the banner goes, this device remembers it, and Show banner brings it back. *(added CR-0015)*
- **AC-42.3** Given I may make bills, then Recent Bills & Job Sheets lists the latest six, bills and jobs with no bill yet, with number and date, customer and phone, job or items, amount, status, and Share or Make bill; cards on a phone. *(added CR-0015)*
- **AC-42.4** Given the Table and Kanban Board switch, then the board has the columns To bill (with Field service), Draft, Unpaid, Overdue and Paid, each with its count and ₹ total, and cards that open the bill or job; this device remembers the choice. The board shows work; it doesn't change a status. *(added CR-0015)*
- **AC-42.5** Given the Get Started Checklist, then it ticks Add your team when the business has more than one person and Business and GSTIN details when they are filled in, counts them, links the rest, and goes away once all are done. Connect WhatsApp ticks when K6 connects a number. *(added CR-0015)*

### US-43: History: who did what
As an owner, I want every change logged with the name of who made it, so that I can see what happened and ask the right person.
- **AC-43.1** Given anyone adds, changes or stops an item, moves stock (in, out, count, cut, sold or returned on a bill, used on or put back from a job), or saves, changes, sends, cancels or marks a bill paid, then it is logged with their name and shows in History. *(added CR-0016)*
- **AC-43.2** Given an item, then its History also shows who added it, who changed what ("sale price ₹350 to ₹400"; cost figures are not shown) and who stopped using it, among its stock moves; each line says "By <name>" on a line of its own, with the time; an item added with opening stock is one line, here and in History; only the server writes these lines. *(added CR-0016)*
- **AC-43.3** Given a saved bill, then its history is open on its page, newest first, with who and when; customers added or changed, renewal reminders, jobs recorded and job steps are in History too. *(added CR-0016)*
- **AC-43.4** Given History, then I can filter by Items and stock, Bills, Jobs and customers, Team and sign-in or Settings, by person, and by words, and show older lines. *(added CR-0016)*
- **AC-43.5** Given the permission "See the history (who did what)", then the owner has it, others don't unless the owner switches it on for a role or a person; without it History isn't in the menu and the server answers 403. *(added CR-0016)*
- **AC-43.6** Given two businesses, then each sees only its own History. *(added CR-0016)*
- **AC-43.7** Given a time from the server, then it shows on the device's own clock, in History, on bills and in Admin. *(added CR-0016)*

### US-41: Bills, Inventory, Team and Settings at full width
As an owner on a laptop, I want these screens to use the width, so that I see more and scroll less.
- **AC-41.1** Given 760 px or more, then the bills table shows number and date, customer and GSTIN (or Unregistered), source (WhatsApp voice, photo or text from its job, or Counter), taxable with tax, total and status; search also finds a GSTIN. *(added CR-0015)*
- **AC-41.2** Given a saved bill and permission to make bills, then its row has Send on WhatsApp and, for a real business, its PDF (shown on hover or focus; always on touch); the answer of a send shows on the list. *(added CR-0015)*
- **AC-41.3** Given I manage inventory, then each stocked item's row has − and + beside its quantity with the low level under it; each press is an ordinary stock move of one main unit, in the item's history; − is off with nothing in stock; without the permission, or for a service or stopped item, there are no buttons. *(added CR-0015)*
- **AC-41.4** Given Admin from 1100 px, then the team and the add forms are on the left (5 of 12 columns), the roles and activity log on the right (7). *(added CR-0015)*
- **AC-41.5** Given Settings from 1100 px, then the forms are on the left (6 of 12), and the live paper stays in view in its own column on the right (6). *(added CR-0015)*

### US-50: The logo, and where it goes on a bill
As a business owner, I want to add my logo next to my signature in Settings and choose where it goes on my bills, so that my estimates and bills look like mine, on the screen, the link and the PDF.
- **AC-50.1** Given I may change settings, then the logo (add, replace, remove; the same picture rules as AC-23.11) sits in Settings → Bill look beside the signature, and no longer under Business details. Adding or removing it keeps what I have typed in the form but not saved. *(added CR-0019)*
- **AC-50.2** Given a logo exists, then Bill look asks "Where should the logo go?" with Top left (above the business name), Top centre and Top right; the live paper preview moves the logo as I choose, and Save bill look keeps it. *(added CR-0019)*
- **AC-50.3** Given no logo exists, then the question is not shown and a hint says to add a logo first. *(added CR-0019)*
- **AC-50.4** Given a bill or estimate on the screen or its public link, then the logo is in the chosen place: left is above the business name, as it always was; centre is a centred row above the header; right is above the bill heading at the right edge. On A4 modern the logo sits on a white chip so a dark logo stays readable on the coloured header. *(added CR-0019)*
- **AC-50.5** Given the PDF of an A4 classic or A4 modern bill, then the logo is in the chosen place, keeps its own proportions (at most 14 mm high and 45 mm wide), nothing is printed over it, and the PDF stays under 300 KB (AC-30.4). *(added CR-0019)*
- **AC-50.6** Given the small receipt (80 mm), then the logo is always centred at the top, whatever was chosen, on the screen, the link and now also the PDF (it was left out of the receipt PDF before). *(added CR-0019)*
- **AC-50.7** Given a business that saved its look before this change, then its logo stays top left and its bills do not change. Given a position other than left, centre or right, then the server answers 422; the change is logged in History. *(added CR-0019)*
- **AC-50.8** Given the PDF of an A4 modern bill, then only the thin bar at the top of the page is painted in the brand colour; the item table and tax summary are on white with brand-coloured headings (they were painted solid before). *(added CR-0019, a fix)*

### US-51: Pick the state by name when adding a business
As the platform admin, I want to pick the state by name when I add a business, and have KaryaHub set the state code itself, so that I never have to know or type a GST state code.
- **AC-51.1** Given Businesses → Add a business, then the form asks for "State" as a list of state and union territory names (no code box, no digits), with Maharashtra chosen first, and it keeps the chosen state after a refused attempt. *(added CR-0019)*
- **AC-51.2** Given I pick a state, when the business is created, then the server sets the state code from the name (Karnataka gives 29) and returns it; the business's bills use it as their own state. *(added CR-0019)*
- **AC-51.3** Given a state name that is not on the list, then the server answers 422 "Pick a state from the list." and no business is made. *(added CR-0019)*
- **AC-51.4** Given an older request that sends only a state code, then it still works when the code is on the list and is refused (422) when it is not; given a name and a code, the name wins; given neither, the state is Maharashtra (27) as before. *(added CR-0019)*

### US-52: A transparent, sharp logo and signature of a normal file size
As a business owner, I want to add my logo and my signature or stamp as transparent, sharp pictures of a normal file size, so that they look good on my bills, the link and the PDF, instead of being refused or turned soft.
- **AC-52.1** Given a logo or signature with a transparent background (PNG or WebP), then it can be added and stays transparent on the screen, the link and the PDF; it is never turned into a picture with a solid box. *(added CR-0019)*
- **AC-52.2** Given a logo or signature of up to 10 MB (PNG, JPEG or WebP), then it can be chosen; the browser scales it to at most 800 px on its longest side, never up, with smoothing; a transparent picture stays a PNG and is scaled down further if it is still too big, instead of becoming a JPEG; a solid picture is a PNG while that is small and a high-quality JPEG when it is not; a larger file or one that is not a picture gets a plain message. *(added CR-0019)*
- **AC-52.3** Given the server receives a logo or signature, then it accepts PNG, JPEG or WebP of up to 1 MB as stored that really is that kind of picture, at most 4000 px on a side, and refuses anything else (422) with a plain message. *(added CR-0019)*
- **AC-52.4** Given the PDF, then each picture is printed at 300 dpi for the size it is drawn at (never more), so it is sharp, and the PDF stays under 300 KB with a large logo and a large signature; the public page shows them at three times their display size. *(added CR-0019)*
- **AC-52.5** Given a WebP logo or signature, then it appears in the PDF (it was silently left out before) and keeps its transparency. *(added CR-0019)*
- **AC-52.6** Given a wide, tall or small signature, then on A4 it is at most 14 mm high and 40 mm wide, against the right margin, clear of the text under it; on the receipt it is at most 10 mm high and 30 mm wide, centred. *(added CR-0019)*

### US-53: A fake-transparent logo or stamp is cleaned and fills its space
As a business owner, I want a logo or stamp I saved from a website, with its grey-and-white "transparent" checkerboard, to come out really transparent and filling its space, so that my bills show only the logo, not a checkerboard box with a tiny logo inside.
- **AC-53.1** Given a logo or signature whose edge is a checkerboard (two light greys or whites, with soft joins) or one plain light colour, when it is added, then the browser removes that background from the edges inwards, so the picture is transparent; checkerboard enclosed by the logo (inside a ring or a letter) goes too, while a plain white centre that does not touch the outside stays. *(added CR-0019)*
- **AC-53.2** Given a picture with empty margins (transparent or removed), then the margins are trimmed, keeping a small border, so the logo or stamp fills its space instead of looking small. *(added CR-0019)*
- **AC-53.3** Given a coloured or dark background, a photo, or an edge that is not made of light colourless shades, then the picture is not cleaned; a light-grey detail that differs from the background shades stays; if the clean-up would remove almost everything, nothing is removed. *(added CR-0019)*
- **AC-53.4** Given a picture was cleaned, then the owner is told ("We removed the background ... and trimmed its empty edges") and a button "Keep my original" saves the picture as it was chosen, still scaled to a sharp size. *(added CR-0019)*
- **AC-53.5** Given the logo and the signature or stamp, then both are cleaned and trimmed, and the owner is told. *(added CR-0019)* *(changed CR-0019, US-54: the signature or stamp is cleaned by the ink-on-paper rule of AC-54.1 first; the logo is cleaned as before)*

### US-54: A signature or stamp from a photo or scan becomes see-through
As a business owner, I want the paper of a signature or stamp I photographed or scanned to disappear, so that only the ink shows on my bills, not a white or cream box. *(Found on the CR-0019 preview: the logo's background was removed but the signature's was not, because a photo of paper is tinted and unevenly lit and the flat-background rule of US-53 finds no clean shade in it.)*
- **AC-54.1** Given a signature or stamp on photographed or scanned paper (tinted, unevenly lit, with some noise), when it is added, then the paper becomes see-through and only the ink stays solid: the browser measures the paper colour locally (cell by cell, so shading and tint drop out) and keeps each pixel as much as it is darker than its own paper. A big solid stamp is not taken for paper. *(added CR-0019)*
- **AC-54.2** Given the pen's soft edges, then they stay soft (no hard edge, no halo of paper colour), the ink keeps its colour (black, blue, red), and laid back on its own paper each kept pixel looks as it did. *(added CR-0019)*
- **AC-54.3** Given a signature or stamp that was made see-through, then the empty margins are trimmed, keeping a small border, so it fills its space. *(added CR-0019)*
- **AC-54.4** Given a dark or coloured background, a picture that is mostly filled with ink, or paper with no ink on it, then the picture is not changed, it is saved as chosen, and the owner is told why nothing was removed. A picture that is already see-through is only trimmed. *(added CR-0019)*
- **AC-54.5** Given a signature or stamp that was made see-through, then the owner is told ("We made the paper see-through so only your ink shows ...") and "Keep my original" saves the picture as it was chosen, still scaled to a sharp size. *(added CR-0019)*
- **AC-54.6** Given the logo, then it is cleaned exactly as before (AC-53.1 to AC-53.4); only the signature or stamp gets the ink-on-paper rule. *(added CR-0019)*

### US-55: Choose the size of the logo and of the signature
As a business owner, I want a size bar for the logo and another for the signature, so that I can make each bigger or smaller on my bills without the spacing around it changing.
- **AC-55.1** Given a logo exists, then Settings → Bill look shows a horizontal bar "Logo size" under it, and given a signature exists, another "Signature size" under that: 50% to 200% in steps of 5, at 100% (today's size) until chosen, with the value shown beside the name. Without a picture there is no bar. *(added CR-0019)*
- **AC-55.2** Given I move a bar, then the picture on the live paper preview changes at once, nothing is saved until Save bill look, and Save sends both sizes. *(added CR-0019)*
- **AC-55.3** Given a saved size, then it shows on the bill page, the public link and the PDF (A4 classic, A4 modern and the small receipt): the logo is at most 160 x 56 px on the page and 45 x 14 mm on A4 at 100%, the signature at most 60 px and 40 x 14 mm, all scaled by the chosen percent. *(added CR-0019)*
- **AC-55.4** Given a bigger picture, then the gaps around it do not widen: the text near it moves down or aside by exactly the picture's growth (on A4 the name still starts 2 mm under a left or centre logo), the picture never leaves the page margins (on the 80 mm receipt it is at most the 72 mm column), and a signature that would run off the bottom of an A4 page starts the next page. *(added CR-0019)*
- **AC-55.5** Given a picture at any size, then the PDF prints it at 300 dpi for the size drawn and stays under 300 KB. *(added CR-0019)*
- **AC-55.6** Given a business that saved its look before this change, then both sizes are 100% and its bills do not change. Given a size that is not a whole number from 50 to 200, then the server answers 422 "Pick a size for the logo (or signature) from 50% to 200%." and saves nothing; the change is logged in History with its value. *(added CR-0019)*

### US-56: Clear warnings and logs when a logo or signature fails
As a business owner, I want a clear message when a logo or signature cannot be used, and as the person supporting the product I want each failure logged with its reason, so that a missing picture is never a silent mystery.
- **AC-56.1** Given a picture cannot be added, then the owner gets its own plain message as an alert: too big (over 10 MB), not a readable picture, too detailed to keep sharp, no connection, or the server's own reason when it refuses it; nothing is saved. *(added CR-0019)*
- **AC-56.2** Given cleaning the background fails or finds nothing to remove (dark or coloured, filled, no ink), then the picture is still saved as chosen and a warning, not an error, says what happened. If the browser will not let the pixels be read, the picture stays a PNG. *(added CR-0019)*
- **AC-56.3** Given a saved logo or signature that the browser cannot show, on Bill look or on a bill, then a warning in its place says "We couldn't show your logo (or signature). Choose the file again." *(added CR-0019)*
- **AC-56.4** Given the server refuses a picture, or cannot use a saved one in a page or PDF, then it logs one line to the runtime logs (`karyahub.pictures`): which picture (logo or signature), the reason (for example too-big, unreadable, dimensions, prepare-failed, draw-failed), its type and size, and the business id; never the picture and never any personal data. A good picture logs nothing. *(added CR-0019)*
- **AC-56.5** Given a picture that failed, then the bill page and the PDF are still made without it (no error page). *(added CR-0019)*
- **AC-56.6** Given a failure in the browser, then one console line (`[karyahub] picture: <reason>`) carries its kind, type, size and reason, and never the picture or the file name. *(added CR-0019)*

> **Planned, not built (CR-0018, Phase Alpha, v0.12.0).** US-44 to US-49 are approved. Their criteria become named tests when the build lands; until then no test exists for them. Background: [PHASE-ALPHA.md](../product/PHASE-ALPHA.md).

### US-44: See how KaryaHub is doing

As the platform admin, I want one overview, so that I know the state of KaryaHub in a minute.

- **AC-44.1** Given I'm the platform admin, when I sign in, then I land on Overview with the seven tabs. Given any other role, when I open a console address, then I get the no-access page, and the server answers 403. *(added CR-0018)*
- **AC-44.2** Given real businesses exist, when Overview opens, then it shows businesses active this week of the total, people seen this week, new businesses this month, money recorded this month, and plans ending in 30 days. *(added CR-0018)*
- **AC-44.3** Given a change made at 23:30 UTC, when graphs are drawn, then it counts on the next India day. *(added CR-0018)*
- **AC-44.4** Given a day with no activity, when a graph is drawn, then that day shows as 0 rather than being skipped. *(added CR-0018)*
- **AC-44.5** Given any graph, when I press Show as table, then the same numbers appear in a labelled table. *(added CR-0018)*
- **AC-44.6** Given sign-ins saved before this release, when the sign-in graph opens, then those days are included. Given the wrong-PIN count, then it starts at release and says so. *(added CR-0018)*
- **AC-44.7** Given bills, jobs and items made before this release, when their graph opens, then those days are marked as estimates. *(added CR-0018)*
- **AC-44.8** Given businesses at different steps, when the ladder is shown, then each of the seven steps shows the right count. *(added CR-0018)*
- **AC-44.9** Given no real business exists, when Overview opens, then it says so and offers Add a business, instead of empty graphs. *(added CR-0018)*

### US-45: Know each business and each person

As the platform admin, I want details of every business and person, so that I can see who is working and who is not.

- **AC-45.1** Given the Businesses tab, when I search or filter by plan, stage, health, trade or state, then the list and its count change, and the filters survive a page reload. *(added CR-0018)*
- **AC-45.2** Given a business, when I open its page, then it shows summary and health, people, usage, plan, notes, payments and admin actions. *(added CR-0018)*
- **AC-45.3** Given the People tab, when I filter by business, role, active or off, never signed in, temporary PIN, locked or not seen for 14 days, then the right people and their total are shown. *(added CR-0018)*
- **AC-45.4** Given a phone syncs, then that person's last seen updates, at most once an hour, and shows in India time. *(added CR-0018)*
- **AC-45.5** Given fixed dates, when health is worked out, then each state in the rules table appears with its reason. *(added CR-0018)*
- **AC-45.6** Given a business ticked as test, or the demo, when totals and graphs are counted, then it is left out. Given Include test businesses is on, then a test business is counted. *(added CR-0018)*
- **AC-45.7** Given a staff member who isn't an owner, when listed, then the phone shows only its last 4 digits. When I press Reveal, then the full number shows and the reveal is logged. *(added CR-0018)*
- **AC-45.8** Given a turned-off business, when someone signs in with the right PIN, then they see that the business is paused and whom to contact. With a wrong PIN, they see the same message as today. *(added CR-0018)*
- **AC-45.9** Given filters on Businesses, when I press Export, then I get a CSV of that list without staff phones, and the export is logged. *(added CR-0018)*

### US-46: Be warned, with something to do

As the platform admin, I want a list of what needs me, so that nothing slips.

- **AC-46.1** Given each rule in the warnings table, when its condition is met on fixed dates, then that warning appears, and it does not appear one day earlier. *(added CR-0018)*
- **AC-46.2** Given a technician who never signed in, then no warning appears for them. *(added CR-0018)*
- **AC-46.3** Given a warning, then it shows its level, business, reason in plain words, since when, and one working action. *(added CR-0018)*
- **AC-46.4** Given several warnings, then the most serious come first, and the tab shows how many are open. *(added CR-0018)*
- **AC-46.5** Given a warning, when I snooze it for 1, 7 or 30 days, then a reason is required, it hides until then, and the snooze is logged. *(added CR-0018)*
- **AC-46.6** Given the cause is fixed, then the warning disappears by itself. *(added CR-0018)*
- **AC-46.7** Given any failed sign-in, then time, result and masked number are recorded, and never the PIN. The person sees the same message as today, whether or not the number exists. *(added CR-0018)*
- **AC-46.8** Given sign-in records older than 13 months, then they are removed. *(added CR-0018)*
- **AC-46.9** Given the AI server is unreachable, when any console tab opens, then the tab still loads and the warning shows. *(added CR-0018)*

### US-47: Control plans and features

As the platform admin, I want to switch features and limits per plan and per business, so that I can sell tiers and add features later without rebuilding this.

- **AC-47.1** Given a business saved by v0.11.0, when v0.12.0 starts, then it is on Early access with every feature on, and its people see no change. *(added CR-0018)*
- **AC-47.2** Given one new entry in the feature catalogue, then it appears in Plans and on every business page with no other screen change. *(added CR-0018)*
- **AC-47.3** Given Plans, when I change a name, price, switch or limit, or add a plan, then it applies at once and is logged. A plan in use can be retired but not deleted. *(added CR-0018)*
- **AC-47.4** Given a plan and an exception disagree, then the exception wins. Given a feature name the server doesn't know, then it counts as off and is logged. *(added CR-0018)*
- **AC-47.5** Given core features (bills, items, customers, seeing saved data), then no plan or exception can turn them off. *(added CR-0018)*
- **AC-47.6** Given an exception, when I save it, then a reason is required. Given its end date passes, then it stops by itself. *(added CR-0018)*
- **AC-47.7** Given a feature marked Beta, then it is on only for businesses given an exception. *(added CR-0018)*
- **AC-47.8** Given a feature is off, when its route is called, then the server answers 403 `feature_off` with a plain message, and the screen offers Ask for this. When it's turned back on, then the data is still there. *(added CR-0018)*
- **AC-47.9** Given AI is off for a business, when someone uses Chat, then the labelled manual path works and nothing typed is lost. *(added CR-0018)*
- **AC-47.10** Given the plan allows a feature but the owner's pack or a person's permission is off, then that person doesn't get it. Given the plan doesn't allow it, then no owner setting can turn it on. *(added CR-0018)*
- **AC-47.11** Given a successful AI call, then it counts once for that business and day. A failed call does not count. *(added CR-0018)*
- **AC-47.12** Given the AI limit is reached, when someone uses AI, then the manual path opens and says why. Given the people limit is reached, then adding a person is refused and says why. *(added CR-0018)*
- **AC-47.13** Given any plan or limit, when a bill, item or customer change arrives, including one queued offline, then it is never refused because of the plan. *(added CR-0018)*
- **AC-47.14** Given a plan's end date is within 14 days, then the owner sees a notice. Given it has passed, then 7 days of grace follow, then the business falls to the plan's fallback. Nobody is locked out and no data is lost. *(added CR-0018)*
- **AC-47.15** Given I'm an owner, when I open Settings, then Your plan shows plan, end date, features and usage. Other roles don't see it. *(added CR-0018)*

### US-48: Run customers and growth

As the platform admin, I want my customers, money and demand in one place, so that I can decide whom to call and what to build.

- **AC-48.1** Given a business, when I set its stage, trade, city or source, then the Growth list and its counts by stage change, and the stage change is logged with its date. *(added CR-0018)*
- **AC-48.2** Given a note with a follow-up date, when the date passes, then it appears in Attention. *(added CR-0018)*
- **AC-48.3** Given a note, stage or payment, when an owner calls any owner route or opens History, then none of it appears. *(added CR-0018)*
- **AC-48.4** Given I record a payment with amount, date, mode, period and note, then money received and the business's page update. Any later change is logged with old and new values. *(added CR-0018)*
- **AC-48.5** Given plans with monthly or yearly prices, then monthly run rate adds paying businesses, with yearly prices divided by 12, labelled "recorded by hand". *(added CR-0018)*
- **AC-48.6** Given plans ending in the next 30 days, then Renewals due lists them with the last payment. *(added CR-0018)*
- **AC-48.7** Given feature use in the last 30 days, then the table shows how many businesses used each feature. *(added CR-0018)*
- **AC-48.8** Given someone presses Ask for this, then one request per business and feature appears in Growth with who and when, and the person sees it was sent. *(added CR-0018)*
- **AC-48.9** Given rates I set for AI calls and messages, then each business shows estimated cost beside what it pays, labelled as an estimate. *(added CR-0018)*
- **AC-48.10** Given an announcement for everyone, one plan or one business with start and end dates, then a banner shows to those people only in that period. Each person can dismiss it once. *(added CR-0018)*

### US-49: Keep the console safe

As the platform admin, I want this much power to be safe, so that one mistake or a stolen PIN does limited harm.

- **AC-49.1** Given System, when it opens, then it shows version, database state and time, row-level security, server mode and AI servers. *(added CR-0018)*
- **AC-49.2** Given turning off a business, changing a plan or exception, revealing a phone or exporting, then my PIN is asked again. A wrong PIN refuses the action and counts towards lockout. *(added CR-0018)*
- **AC-49.3** Given any change in the console, then the admin log shows who, when, what, and old and new values, and it can't be edited. *(added CR-0018)*
- **AC-49.4** Given my plan or feature change on a business, then its owner's History says the KaryaHub team changed it. *(added CR-0018)*
- **AC-49.5** Given every console route, when a business user or a signed-out visitor calls it, then it is refused. *(added CR-0018)*
- **AC-49.6** Given any console screen except the rebuild, then it doesn't read the `records` table, and its answer holds no customer name, customer phone or bill amount. *(added CR-0018)*
- **AC-49.7** Given Rebuild numbers runs, then it reads one business at a time inside that business's wall. Running it twice gives the same numbers. *(added CR-0018)*
- **AC-49.8** Given a change to row-level security on the business tables, then existing wall tests still pass with the new tables present. *(added CR-0018)*
- **AC-49.9** Given any console screen, then it works from 360 px to 1440 px, in light and dark, by keyboard, with labelled forms. *(added CR-0018)*

## Screens and flows
Sign in first (CR-0003). Then a bottom tab bar and a drawer on phones and a sidebar on desktop, showing only the screens the person's role and packs allow: Home, Bills, Chat, Jobs, Inventory, Renewals (Workspace; on a phone Renewals is in the account menu, CR-0012) and Admin, Settings (Manage). An account menu in the top bar shows the person and role, with Settings, Admin and Sign out.

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
| Inventory (CR-0011, people with *See inventory*) | Tiles, search, chips (All, Low, Out, Stopped), items as cards or a table with marks; an item page with Stock in, Stock out, Count, Edit, Stop using and its history; Add item; Import CSV; on a job, Parts used with suggestions from the note | "No items yet.", "No items match “…”" | Field messages; "Only N in stock…"; "This job is closed…"; an import that needs a signal |
| Bills (CR-0012) | Bills and Estimates tabs, search, chips All, Draft, Unpaid, Overdue, Paid, Cancelled with counts, cards or a table; the editor (customer, items, sticky total, Save and share, More options); the bill view in its layout with Send on WhatsApp, Copy link, Mark as paid and More | "No bills yet. Tap New to make your first bill." | Field messages; save problems kept on the draft; "Number given when online" |
| Business type (CR-0012, first sign-in of a new business's owner) | Type, GST registration, state | n/a | "Pick your state to work out GST." |
| Public bill page /b/<token> (CR-0012) | One bill and Download PDF, no sign-in | n/a | "This bill link isn't valid." or "turned off" |
| Settings | Business type and packs, Bill look with a live preview (CR-0012); where messages are processed (server, in browser, live keys), server connection, service status and needed keys, Simulate failure switch, Reset demo, theme | "Checking the KaryaHub server…" | "Can't reach the KaryaHub server" |

Demo flow (3 minutes): Sign in as the owner → Home → See how it works → pick voice note → watch processing → Approve → Create invoice → Send code → Verify → Close → Renewals → Send reminder. Then (1 minute) Admin → sign out → sign in as Santosh (technician) to show limited access.

## Look and feel
- **Personality:** dependable, quick, money-aware.
- **Who and where:** an owner watching over the founder's shoulder on a phone in a busy shop, or on a laptop video call.
- **Colour mood:** calm, trustworthy teal with a familiar WhatsApp-like chat area; money in strong green, lapsed in red. Main brand colour: deep teal **#0F766E**. Do not copy WhatsApp's logo or exact green.
- **Typography:** Plus Jakarta Sans for headings, Inter for the interface, JetBrains Mono for ₹ figures and other numbers (CR-0015); Noto Sans as the Devanagari fallback.
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
| Job | id, customer_id, date, work_done, parts, source_sample_id, approved_at, state (NEW, ASSIGNED, IN_PROGRESS, WORK_DONE, VERIFIED, CLOSED, CANCELLED; added CR-0002), events [{id, action, from_state, to_state, client_op_id, actor, channel, detail, received_at}] (added CR-0002), otp {challenge, expires_at, demo_code} (added CR-0002), parts_used {item id: quantity} (server-owned, added CR-0011) |
| Document | id, job_id, type (quote or invoice), lines [{description, qty, rate}], cgst, sgst, total (version 1, v0.7.0 and earlier; never worked out again, AC-28.7) |
| Document version 2 (added CR-0012) | doc_version 2, type (quote = estimate, invoice = bill), number, series (bill:26-27 or estimate:26-27), fy, status (draft, saved, sent, paid, cancelled; Overdue is worked out), date, due_date, valid_until, customer {id, name, phone, address, gstin, state_code}, place_of_supply, tax_mode (intra, inter, composition, none), lines [{item_id, description, hsn, qty, unit, rate (paise), price_includes_gst, discount {kind percent or amount, value}, gst_rate, from_job_parts, and the server's amount, line_discount, bill_discount, taxable, cgst, sgst, igst}], bill_discount, summary per rate, totals {taxable, cgst, sgst, igst, bill_discount, round_off, total, in_words}, seller (the business at saving), notes, terms, job_id, estimate_id, bill_id, bill_number, link_token, link_on, sent_at, sent_how, paid_at, cancelled_at, cancel_reason, stock_taken, history [{at, who, what}], save_problem; all money in paise |
| Business (added CR-0012) | business_type (service, trading, shop, other; empty until asked), packs (empty means Field service, as before v0.8.0), gst_registration (regular, composition, unregistered), state_code, bill_look {layout, colour, phone, bank, upi_id, terms, prefix, due_days, estimate_valid_days}, signature |
| Document link (server, added CR-0012) | token_hash (SHA-256 of the 192-bit token), business_id, doc_id; read before the business is known, so it holds nothing else |
| Settings | business_name, gstin (dummy), mode (server, mock or live; server added CR-0002), simulate_failure, theme |
| Staff (added CR-0003) | id, name, phone, role (owner, coordinator, technician), active, pin_hash (salted SHA-256), created_at, last_sign_in |
| Access log entry (added CR-0003) | id, at, who, text |
| Session (added CR-0003, separate storage key) | staff_id, signed_in_at |
| Record (server, added CR-0009) | business_id, kind (customer, job, document, message; item and stock_move added CR-0011), id (unique per business), number (jobs and documents, given by the server), body (the item as above), seq (change counter), updated_at |
| Item (inventory, added CR-0011; a record of kind item) | id, name, code (unique in the business, ignoring capitals), unit (nos, kg, metre, litre, set, roll, or the id of one of the business's own units), attrs (CR-0013: detail id to its value; a pick-list value is an entry id), sale and cost (paise; cost is sent only to people who manage inventory), hsn, gst (0, 0.25, 3, 5, 18, 40; 0.25 and 3 added CR-0012), price_includes_gst and service (added CR-0012), low (low-stock level), stopped, qty (the quantity in stock, server-owned) |
| Stock move (added CR-0011; a record of kind stock_move) | id, item_id, kind (opening, in, out, used, returned, count; sold and sale_cancelled, made only by a bill, added CR-0012; cut, added CR-0014), unit (only when not the item's main unit; CR-0014), to_unit and gave (a cut), qty (signed), after (quantity left), date, at, who, job_id, note, supplier, bill, cost, counted; never changed once saved |
| Item field (added CR-0013; a record of kind item_field) | id, name, type (text, number, list), required, in_list, in_filter (pick-lists), on_bills, stopped, order (given by the server) |
| List entry (added CR-0013; kind list_entry) | id, field_id, name, stopped, alias_of (set by the server when a second phone added the same name) |
| Unit of the business (added CR-0013; kind unit) | id, name (up to 12 characters), whole (whole numbers only), stopped, alias_of |
| Selling unit of an item (added CR-0014; the `sells` list of an item) | unit (a unit id), sale and cost (paise), low, cut_from (a unit id of the same item) and cut_gives, qty (the server's) |
| Item code (server, added CR-0011) | business_id, code_key (the code in lower case), item_id; keeps codes unique per business at the database |
| Sync operation (server, added CR-0009) | business_id, op_id (unique per business), result; makes a repeated change harmless |
| Counter (server, added CR-0009) | business_id, name (seq, job, quote, invoice; bill:<fy> and estimate:<fy> per financial year and msg:<yyyy-mm> messages per month added CR-0012), value |
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
- Inventory (CR-0011): the server owns the quantity in stock and a job's list of parts and changes them in the same transaction as the stock move; a move can't be changed; cost prices are sent only to people with `manage_inventory`; a CSV import takes up to 500 rows or 1 MB, needs a signal, and is safe to run twice; the phone shows the server's quantity plus its own moves not yet answered.
- Bills (CR-0012): the server works out and stores every figure with one tax engine (`backend/karyahub/domain/tax.py`); the phone's copy (`src/domain/tax.js`) gives the same figures for every case in `tests/fixtures/gst_cases.json`; numbers are given in the same transaction as the save, so a failed save uses none; a bill's public link is the only way to read it without signing in, is marked noindex, and only the token's SHA-256 is stored; screen words for new screens live in `src/words.js`.
- Weak signal (CR-0009): the app works from its on-device copy and sends queued changes when it can; one sync call sends up to 100 changes and brings back what changed; the server ignores a change it has already applied.

## Out of scope
- Real WhatsApp phone numbers or message sending (the webhook exists and is tested, but no number is connected; changed CR-0002).
- Real speech-to-text and paid LLM or OCR services (speech stays a demo adapter). Changed CR-0004: messages and photos are read by Studio AI, the founder's own AI server, once its settings are linked.
- A server database, background queue, attempt limits on customer codes, and cross-delivery de-duplication (see RISKS.md R-04, R-05, R-07, R-13).
- E-invoicing, e-way bills, credit and debit notes, reverse charge, cess, TDS and TCS, export invoices and several GSTINs in one business; recorded payments, part payments and UPI QR codes (v0.9.0); payment reminders. Real GST bills are built in CR-0012.
- Real server-side accounts, PIN attempt limits and a database for people (done in CR-0005; ADR-0012). Done in CR-0009: jobs, customers, documents and chat on the server. Done in CR-0011: inventory per business (items, stock moves, parts used on a job, CSV import). Still out of scope: a technician's own van stock, returning old parts, serial numbers and barcodes, purchase orders, a parts-variance report, editing the same record on two phones at once without the later change winning, and delivering sign-in codes by SMS or WhatsApp to real numbers until WhatsApp is live.
- Technician app, GPS or photo-based risk scoring and attendance (see REFERENCE-REVIEW.md). Inventory is built (CR-0011) as one store per business.
- Regional language UI (sample voice notes may be Hinglish with English transcripts).

## Open questions
Answered for CR-0001 with the analyst's recommended defaults; the founder can change them with a change request:
- Demo vertical: **AC service** (alternatives: RO purifiers, fire safety).
- Firm name: a dummy firm, **"CoolCare AC Services (demo)"**, presented by KaryaHub.
- Reminder language: **English** (Hindi can be added later).
