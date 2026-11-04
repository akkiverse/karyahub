# KaryaHub: Roadmap and rules

**Goal (founder, 31 Oct 2026): a real AC-service firm can run its whole day on KaryaHub.** Widened on 2 Nov 2026 (Idea Document v2, F19): one core for every business plus switch-on packs (Field service, Trading, Shop counter); service firms first, billing core first; traders before shops.

KaryaHub is one portal that many firms use. Each firm signs in with mobile numbers and PINs, sees only its own business, and its owner controls who can do what. This page holds the rules every change must keep and the plan, step by step. The live task list is `idea-studio/TASKS.md` in the hub (section K); this page is the copy that lives with the code, so any agent or person working on KaryaHub reads it first.

## Rules to keep in every KaryaHub change

1. **Each business is a wall.** Every row carries `business_id`, every query filters by it, row-level security is the second wall, and tests prove one business can't see another's data.
2. **Works without extras.** If the AI PC, WhatsApp or a speech service is off, every screen still works through a manual path, with a plain label, and nothing typed is lost.
3. **Field first.** Technician screens are phone-sized and work on a weak signal: changes wait on the device and sync when the signal returns, with no duplicates.
4. **The owner controls access.** Every new feature gets a permission the owner can switch per role or per person, and important actions go in the activity log.
5. **One way out for messages.** Every outgoing message (codes, quotes, invoices, reminders, PIN codes) goes through one sender layer that picks: the business's own WhatsApp number if connected, then the Studio test account, then a "Send on WhatsApp" link that opens the person's own WhatsApp with the text typed in. Use utility templates (cheaper than marketing ones) and count messages per business per month.
6. **Secrets stay secret.** Per-business keys (Meta tokens, app secrets) are encrypted in the database, never shown again after saving, changeable only by that business's owner or the platform admin, and each has a **Test** button.
7. **India-ready.** ₹, GST, +91 numbers, dd-mm-yyyy dates, plain English now and Hindi later; customer phone numbers are personal data (privacy notice, export and delete on request).

### How the rules show up in the code (K3, CR-0009)

| Rule | Where it lives today |
|---|---|
| 1 | `records`, `sync_ops`, `counters` and `device_imports` all carry `business_id`; `backend/karyahub/data/service.py` filters every statement by it; migration `0002` turns on row-level security with a policy on `business_id`; `tests/api/test_us23_business_data.py` proves the wall. |
| 2 | The app keeps working from its on-device copy when the server can't be reached; the AI and WhatsApp fall-backs are older (CR-0004). |
| 3 | `src/sync.js`: changes are written to the device first, queued with an operation id, sent when there is signal, and the server ignores repeats. |
| 4 | Each kind of record needs a permission to read and to change (`backend/karyahub/data/service.py`, `READ_PERMISSIONS` and `WRITE_PERMISSIONS`); the owner's switches decide. Importing from a device and changing the logo go in the activity log. Inventory (K2) adds `view_inventory`, `manage_inventory` and `use_parts`, off for technicians, and logs item changes, stock moves and imports. |
| 5 | `backend/karyahub/sender.py` (CR-0012): bills and estimates go out through `sender_for(business)`; with no number connected it answers with a wa.me link; K6 registers a connected sender and the screens stay the same. Messages are counted per business per month (`msg:<yyyy-mm>` counter). |
| 6 | Not built yet (K6, stage B). |
| 7 | ₹, +91 numbers and dd-mm-yyyy are in place; the privacy notice, export and delete come with K8. |

## The plan

Each step is one change request (CR) and one pull request, approved by the founder before it is merged. Steps marked *(founder)* need an account or a decision only the founder can make.

| Step | What | CR | Version | State |
|---|---|---|---|---|
| Done | Accounts and businesses on the server; sign-in with mobile and PIN; owners manage their team and access | CR-0005 | v0.4.0 | Live |
| Done | Clear feedback, faster sign-in, AI over a slow link | CR-0006, 0007, 0008 | v0.4.1 to v0.4.3 | Live |
| 1. K3 | Business data on the server: jobs, customers, documents, chat and reminders move from the browser to the database, scoped by business with row-level security; offline changes queue and sync without duplicates; one-time import from the device; business details and logo on the server | CR-0009 | v0.5.0 | Live |
| 2. B2 | Chat works and AI is smooth (diagnose why Chat fails while AI works elsewhere; longer AI step limit, warm model, streaming) | CR-0010 | v0.6.0 | Live |
| 3. K2 | Inventory per business: own items, CSV import, stock in and out, counts, low-stock marks, parts used on a job; permissions `view_inventory`, `manage_inventory`, `use_parts` (off for technicians) | CR-0011 | v0.7.0 | Live |
| **4. K5** | **Phase 1 "Bills that are right"**: business type and packs; + New; GST bills with line and bill discounts, several rates, CGST and SGST or IGST, MRP prices, Composition and Not registered; numbers per business and financial year with no gaps and an optional prefix; Draft, Saved, Sent, Paid, Overdue, Cancelled; estimate to bill; 3 layouts with a PDF link; Send on WhatsApp through the sender layer; bills take stock | CR-0012 | v0.8.0 | This change |
| **5. K5c** | **Your own item details, lists and units** (founder, 4 Nov 2026: before the CA and the trial owners): fields, brands and units of the business's own, per-business CSV template, details on bills. Part 1 | CR-0013 | v0.9.0 | Live |
| 6. K5d | Selling one item in several units (coil and loose metres), each with its own stock and price; Cut; units on bills and counts and the CSV (job parts stay in the main unit). Part 2 | CR-0014 | v0.10.0 | In review |
| 6b. K9 | The Deep Ocean Teal look (founder, 4 Nov 2026: before Getting paid): Aurora Dark and Clean Light, new shell and layouts; no logic change; History with who did what | CR-0015, CR-0016 | v0.11.0 | Live |
| 7. K5b | Getting paid: payments (cash, UPI, card, bank; part payments), UPI QR on every bill, payment reminders and the daily AMC renewals list, bill-wise profit | next | v0.12.0 | Planned |
| 8. D1 | Owner dashboard | next | v0.13.0 | Planned |
| 7. K6 | WhatsApp for every business: stage A Studio test account *(founder)*, stage B "Use our own WhatsApp number", stage C one-click Connect WhatsApp *(founder: Meta Tech Provider)* | one CR per stage | | Planned |
| 7. K4 | Forgot-PIN codes to real numbers, through the sender layer | with K6 | | Planned |
| 8. K7 | Voice notes to text *(founder decision: Whisper on the Mac or Sarvam AI)* | | | Planned |
| 9. K8 | First real firm (pilot): onboarding wizard, privacy notice and terms, data export for the owner, one week of real use, then a fix list *(founder and Claude)* | | | Planned |
| 10. Packs | Trading pack (orders, challans, purchase bills from photos) v0.11.0, then Shop counter pack (barcodes, 58 mm receipts) v0.12.0, only after a real firm has used v0.8.0 to v0.10.0 | | v0.11.0, v0.12.0 | Planned |
| 11. | Tally export and government files (e-invoice, e-way bill) | | v0.13.0 | Planned |

## What K3 settled (so later steps can lean on it)

- **Where data lives.** A real business's customers, jobs, documents and chat messages are rows in the `records` table, one row per item, with the item's full content in a JSON column. K2, K5 and D1 add their own kinds of record or their own tables, with `business_id` and a row-level security policy from the start.
- **How a phone talks to the server.** One call, `POST /api/v1/sync`: the phone sends the changes it queued (each with an operation id), and gets back what changed on the server since its last call. Nothing else writes records, except the proof-of-work step on a job (`/jobs/{id}/transitions`), which the server now saves itself.
- **Numbers.** Job and document numbers (`J-0007`, `QT-2026-0003`) are given by the server, one counter per business, so two phones can never choose the same number. Until a new item reaches the server, the phone shows it as "New". K5 turns the document counters into per-financial-year, gap-free numbers.
- **The demo business** stays on the device and read-only for visitors; it never syncs.
- **Known limit.** If two people change the same record while both are offline, the later sync wins for ordinary fields. Job state, history and customer codes are the server's and a phone can't overwrite them.

## What K2 settled (so later steps can lean on it)

- **Items and stock moves** are rows of `records` (kinds `item` and `stock_move`), with `item_codes` keeping codes unique per business. The server owns each item's quantity and each job's `parts_used`; a phone only sends moves. K5 reads `parts_used` and item prices and GST rates for documents; D1 can total stock value and low items from the same records.
- **A move is never changed.** A mistake is fixed with a new move. Later kinds (van stock, part returns, serial numbers) add move kinds, not new rules.
- **Technicians get no inventory by default.** They report on WhatsApp; the office takes parts for a job from the technician's note (the suggestions on the job screen exist for this). The owner can allow one technician to take parts.
- **Still to come:** a technician's own van stock, returning old parts within a set time, serial numbers and barcodes, purchase orders and a parts-variance report; a low-stock message to the owner (K6, through the one sender layer).

## What K5 phase 1 settled (CR-0012, so later steps can lean on it)

- **One tax engine.** `backend/karyahub/domain/tax.py` is the truth (paise, half-up, exact integer maths); `src/domain/tax.js` is a line-for-line copy for showing figures while typing. Every change to GST maths adds a case to `tests/fixtures/gst_cases.json` first; both sides must pass it (ADR-0016).
- **Documents version 2** are records of kind `document` with `doc_version: 2`; v0.7.0 documents stay version 1 and are never worked out again. The server owns numbers, status, figures, the seller's details at saving, links, stock taken and history; the phone owns what a person types.
- **Numbers** come from counters `bill:<fy>` and `estimate:<fy>` per business, bumped in the same transaction as the save; a refused save stays a draft with `save_problem` and uses no number.
- **Packs.** `packs` on the business; empty means Field service (v0.7.0 behaviour). A pack that is off takes its permissions away (`access.apply_packs`) and its routes answer 403 `pack_off`; its data stays and comes back when it is switched on. Trading and Shop counter add their own packs and permissions the same way.
- **Sending.** `backend/karyahub/sender.py` is the one sender layer (rule 5); K6 registers a connected number there. K5b's payment reminders and renewals list go through it too.
- **Still to come (K5b):** payments and part payments, UPI QR, reminders, the daily renewals list, bill-wise profit.
