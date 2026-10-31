# KaryaHub: Roadmap and rules

**Goal (founder, 31 Oct 2026): a real AC-service firm can run its whole day on KaryaHub.**

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
| 4 | Each kind of record needs a permission to read and to change (`backend/karyahub/data/service.py`, `READ_PERMISSIONS` and `WRITE_PERMISSIONS`); the owner's switches decide. Importing from a device and changing the logo go in the activity log. |
| 5 | Not built yet (K5, K6). The WhatsApp adapter is the only sender today. |
| 6 | Not built yet (K6, stage B). |
| 7 | ₹, +91 numbers and dd-mm-yyyy are in place; the privacy notice, export and delete come with K8. |

## The plan

Each step is one change request (CR) and one pull request, approved by the founder before it is merged. Steps marked *(founder)* need an account or a decision only the founder can make.

| Step | What | CR | Version | State |
|---|---|---|---|---|
| Done | Accounts and businesses on the server; sign-in with mobile and PIN; owners manage their team and access | CR-0005 | v0.4.0 | Live |
| Done | Clear feedback, faster sign-in, AI over a slow link | CR-0006, 0007, 0008 | v0.4.1 to v0.4.3 | Live |
| **1. K3** | **Business data on the server**: jobs, customers, documents, chat and reminders move from the browser to the database, scoped by business with row-level security; offline changes queue and sync without duplicates; one-time import from the device; business details and logo on the server | CR-0009 | v0.5.0 | This change |
| 2. B2 | Chat works and AI is smooth (diagnose why Chat fails while AI works elsewhere; longer AI step limit, warm model, streaming) | CR-0010 | v0.6.0 | Planned |
| 3. K2 | Inventory per business: own items, CSV import, stock in and out, low-stock marks, parts used on a job; permission `manage_inventory` | CR-0011 | v0.7.0 | Planned |
| 4. K5 | Real paperwork and reminders: numbers per business and financial year with no gaps, the business's own GSTIN, address and logo on every document, a PDF from a link, a rate card, a daily list of AMC renewals due, and the "Send on WhatsApp" link (rule 5) | CR-0012 | v0.8.0 | Planned |
| 5. D1 | Owner dashboard | CR-0013 | v0.9.0 | Planned |
| 6. K6 | WhatsApp for every business: stage A Studio test account *(founder)*, stage B "Use our own WhatsApp number", stage C one-click Connect WhatsApp *(founder: Meta Tech Provider)* | one CR per stage | | Planned |
| 6. K4 | Forgot-PIN codes to real numbers, through the sender layer | with K6 | | Planned |
| 7. K7 | Voice notes to text *(founder decision: Whisper on the Mac or Sarvam AI)* | | | Planned |
| 8. K8 | First real firm (pilot): onboarding wizard, privacy notice and terms, data export for the owner, one week of real use, then a fix list *(founder and Claude)* | | | Planned |

## What K3 settled (so later steps can lean on it)

- **Where data lives.** A real business's customers, jobs, documents and chat messages are rows in the `records` table, one row per item, with the item's full content in a JSON column. K2, K5 and D1 add their own kinds of record or their own tables, with `business_id` and a row-level security policy from the start.
- **How a phone talks to the server.** One call, `POST /api/v1/sync`: the phone sends the changes it queued (each with an operation id), and gets back what changed on the server since its last call. Nothing else writes records, except the proof-of-work step on a job (`/jobs/{id}/transitions`), which the server now saves itself.
- **Numbers.** Job and document numbers (`J-0007`, `QT-2026-0003`) are given by the server, one counter per business, so two phones can never choose the same number. Until a new item reaches the server, the phone shows it as "New". K5 turns the document counters into per-financial-year, gap-free numbers.
- **The demo business** stays on the device and read-only for visitors; it never syncs.
- **Known limit.** If two people change the same record while both are offline, the later sync wins for ordinary fields. Job state, history and customer codes are the server's and a phone can't overwrite them.
