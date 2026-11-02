# CR-0012: Bills that are right (phase 1 of KaryaHub for every business)

- **Status:** In review
- **Requested by:** Founder. Idea Document v2 "KaryaHub for every business" approved on 2 Nov 2026 (F19: one core plus packs, service firms first, billing core first, traders before shops). Business Brief v3 (GO 72/100) and Product Spec v3 approved on 2 Nov 2026 (F22: "approve the build of phase 1" and "use the suggested defaults" for all six open questions). TASKS.md K5.
- **Date:** 2026-11-02
- **Kind:** Feature (minor version)
- **Release:** v0.8.0 (planned)
- **Branch:** `cr/0012-bills-that-are-right`
- **Pull request:** [#15](https://github.com/akkiverse/karyahub/pull/15)
- **References:** [Product Spec v3](https://claude.ai/artifact/AtyPCQQWYaVSmg1K8gPxgC) (US-26 to US-31, 38 criteria, the 10 easy-UI rules), [Business Brief v3](https://claude.ai/artifact/5mTrLnxr7tM48yVfN2P7aR), [Idea Document v2](https://claude.ai/artifact/XKdtbEg3dxPaCS62WTSVuL)

## Why
KaryaHub was built for AC-service firms, and its quotes and invoices were a demo: one GST rate, no discounts, numbers like `QT-2026-0003` that ignore the financial year, no PDF, and "sent" meant a simulated chat bubble. The founder widened KaryaHub to every small business: one core that every business uses, and packs it switches on (Field service now; Trading and Shop counter later). The core starts with billing, because every business bills and a wrong bill costs money and trust. Phase 1 makes bills that are right the first time, in three taps, and puts them in the customer's hands on WhatsApp.

## Decisions taken with the founder (F22: the Spec's suggested defaults)
| Open question | Decision |
|---|---|
| Change the tagline to "Bills, stock, jobs and your team in one place"? | Yes, on the showcase with this release (the hub's registry entry, at release) |
| Bill links: until turned off, or expire? | Until turned off (AC-30.5) |
| Number prefix chosen by the owner? | Yes, optional (AC-28.2) |
| Composition and Not registered in phase 1? | Yes (AC-27.7) |
| Default due date | On receipt, changeable in Settings |
| A bill without a job takes stock? | Yes (AC-27.10) |

## What changes
What people see:
- **Business type and packs (US-26).** A new business's owner is asked once: what kind of business (Repair and service, Trader or distributor, Shop or counter sales, Other), its GST registration (Regular, Composition, Not registered) and its state. Repair and service gets Field service; the others get the core, with their packs marked "Coming soon". Every business that exists today is Repair and service with Field service on and is never asked. With Field service off, jobs, Chat, renewals, AMC and proof of work disappear from every screen and their server routes answer 403 `pack_off`; switching it on brings everything back with its data. Settings has the type, the GST registration, the state and the switch, for people with `manage_settings`, logged.
- **+ New** on the main screens (bottom right, within thumb reach): Bill, Estimate, Item, Job, as permissions and packs allow.
- **Bills that are right (US-27).** A bill opens dated today for "Walk-in customer". Pick a customer by name or phone (or type a new one), add lines from items (unit, sale price, GST rate, and this customer's last price, marked) or type a free line; items can be **Service, no stock**. Line discounts and a whole-bill discount (% or ₹) are behind More options with dates, place of supply, the customer's GSTIN, address and state, notes and terms. GST 0, 0.25, 3, 5, 18 and 40 %; CGST and SGST in the business's state, IGST outside it; place of supply from the GSTIN; prices that include GST; Composition ("Bill of Supply") and Not registered ("Bill"). The phone shows the figures while typing; the server works them out again and stores its own. A wrong GSTIN, a bill of ₹50,000 or more without the customer's address and state, or a line with no description is caught. A bill made without a job takes its items out of stock and cancelling puts them back.
- **Numbers and status (US-28).** `26-27/0001` per business and financial year, estimates `E/26-27/0001`, an optional prefix (`AC/26-27/0001`, never longer than 16 characters); no gaps. With no signal a bill is kept and saved as "Number given when online". Draft, Saved, Sent, Paid, Overdue (worked out) and Cancelled, with the same chip everywhere; sent and paid bills are locked; Cancel keeps the number and can be undone; Make a copy. A new permission **Cancel bills** (owner only); "Create quotes and invoices" is now "Make estimates and bills". The Bills list has search, chips with counts, cards on a phone and a table from 760 px. Quotes and invoices from v0.7.0 open unchanged and show as Saved.
- **Estimate to bill (US-29).** An estimate (valid 15 days by default) becomes a draft bill in one tap, once; each links to the other. A job's **Make estimate** and **Make bill** (were Create quote and Create invoice) open the editor with the job's lines and parts used.
- **The business's own look and a PDF link (US-30).** Settings → Bill look: A4 classic, A4 modern or an 80 mm receipt, six colours, phone, bank details, UPI ID, terms, prefix, due days and a signature, with a live preview. Every saved bill has a link (`/b/<token>`, no sign-in, noindex) with Download PDF; it can be turned off and on. The demo's bills carry "Sample", never sync and get no link.
- **Send on WhatsApp (US-31).** Send opens WhatsApp with "Namaste <name>, here is your bill <number> from <business> for ₹<total>: <link>" and the bill becomes Sent. Copy link, Share and Mark as sent do the same. Each is in the bill's history and the activity log and counts toward the month's messages.
- **Home** shows Billed today, Unpaid and Overdue. **Bills** joins the phone tab bar; Renewals moves to the account menu there.

What changes underneath:
- **One tax engine** (`backend/karyahub/domain/tax.py`), a JavaScript copy (`src/domain/tax.js`) and 36 shared cases (`tests/fixtures/gst_cases.json`) both must pass. See [ADR-0016](../adr/0016-one-tax-engine-and-pdf-with-fpdf2.md).
- **Documents version 2** (`backend/karyahub/data/bills.py`): drafts and the request to save travel through the existing sync queue; Save numbers the bill in the same transaction (counters `bill:<fy>`, `estimate:<fy>`); a refused save stays a draft with `save_problem`. New calls `POST /api/v1/documents/{id}/actions` (mark_sent, mark_paid, cancel, undo_cancel), `/send`, `/make-bill`, `PUT /link`; `GET, PUT /api/v1/business/setup` and `/business/bill-look`; `PUT, GET, DELETE /business/signature`; public `GET /b/{token}` and `/b/{token}/pdf` (Vercel rewrite added).
- **Packs** (`access.apply_packs`): a pack that is off removes its permissions from everyone in the business; `require()` answers `pack_off`.
- **The one sender layer** (`backend/karyahub/sender.py`, rule 5): answers with a wa.me link until K6 connects a number.
- **Migration 0004:** `business_type`, `packs`, `gst_registration`, `bill_look`, `signature_data`, `signature_version` on businesses (existing rows become `service`), and `doc_links` (token SHA-256, business, document) with a grant to the restricted role. `SCHEMA_HEAD` is `0004`.
- **PDFs** with fpdf2 and the bundled Noto Sans (OFL); pypdf for tests only.
- **Web:** screen words in one file (`src/words.js`, rule 9); `src/domain/bills.js`, `src/views/bills.js`, `src/bills-app.js`.

## How the 7 rules are kept
1. **Each business is a wall.** Bills are `records` with `business_id` under row-level security. The link table holds only a token hash, a business id and a document id; the bill itself is read under that business's scope.
2. **Works without extras.** No AI, WhatsApp number or paid service is needed; sending opens the person's own WhatsApp.
3. **Field first.** Bills are made and kept with no signal and get their number when the signal returns; nothing typed is lost (a refused save stays a draft).
4. **The owner controls access.** `create_documents` (Make estimates and bills) and the new `cancel_bills`, per role or person; packs and GST registration need `manage_settings`; saves, sends, payments, cancels and link changes are in the activity log.
5. **One way out for messages.** Every send goes through `sender.py` and is counted per business per month.
6. **Secrets stay secret.** No new secrets. A link token is never logged or stored, only its hash.
7. **India-ready.** GST as it stands since September 2025 (0, 5, 18, 40 % plus 0.25 and 3 %), state names and codes, the financial year from 1 April by India time, ₹ in Indian format, totals in Indian words (lakh, crore), dd-mm-yyyy.

## Spec impact
| Criterion | Change |
|---|---|
| AC-26.1 to AC-26.6, AC-27.1 to AC-27.10, AC-28.1 to AC-28.8, AC-29.1 to AC-29.4, AC-30.1 to AC-30.6, AC-31.1 to AC-31.4 | Added (US-26 to US-31, 38 criteria) |
| AC-4.1, AC-4.2, AC-4.3 | Changed: Make estimate and Make bill open the editor; the demo's mark is "Sample"; Print (and Download PDF for real businesses) |
| AC-4.4 | Retired: sending is Send on WhatsApp (US-31) |
| AC-14.1, AC-14.3 | Changed: "Estimates and bills are made by the office."; the coordinator's navigation adds Bills |
| AC-25.13 | Changed: a job's parts become lines of its estimate and bill, marked so the bill takes no more stock |
| Screens, Data model, Non-functional, Out of scope | Updated |

## Architecture impact
- ADR-0016 (new): one tax engine with a JavaScript copy and shared cases; PDFs with fpdf2 and Noto Sans; the public link table.
- Migration 0004; `SCHEMA_HEAD` 0004; `doc_links` outside row-level security by design (the wall coverage test lists it with the account tables).
- New server modules `domain/tax.py`, `data/bills.py`, `data/bill_render.py`, `data/business_setup.py`, `sender.py`; new web modules `words.js`, `bills-app.js`, `domain/bills.js`, `domain/tax.js`, `views/bills.js`.
- New dependencies: `fpdf2` (and its Pillow and fontTools), `pypdf` (tests only); fonts in `backend/karyahub/fonts/`.
- DESIGN.md (the 10 easy-UI rules and the bill screens), ROADMAP.md (new release order and what K5 phase 1 settled), SPEC.md.

## Verification
- **Server (pytest):** 90 new tests: packs and setup (`test_us26_packs.py`), the tax engine with the 36 shared cases, the Spec's worked examples, GSTIN and Indian words (`test_us27_tax.py`), saved figures, checks, stock, numbers, status, old documents and permissions (`test_us28_bills.py`), estimate to bill, bill look, the PDF in all three layouts read back with pypdf, the public link, link off and on, Send and the connected-number path, Copy, Share and Mark as sent, history, activity log and the monthly count (`test_us30_links.py`).
- **Web (Vitest):** 65 new tests: the phone's engine against the same 36 cases (`us27-tax.test.js`) and 26 screen tests (`us26-bills.test.js`) for every story, on the demo and on a real business through the fake server (offline save, Send, Copy link, Cancel and Undo, link off and on). The US-4, AC-25.13, AC-14 and Admin tests were moved to the new behaviour.
- **Real PostgreSQL 16.2:** the Postgres-only test with migration 0004, and an end-to-end run of the API with the restricted role on: setup, sync of an item, opening stock and a saved bill (26-27/0001), Send, the public page and PDF, a wrong token, Cancel and stock back.
- **Visual:** Playwright at 375 and 1280 px, light and dark (see the test report); fixes made after looking.
- **Totals:** 443 of 443 tests (241 server, 202 web), plus the Postgres-only test; Ruff and `npm run build` clean.

## Notes
- **Not covered, on purpose (later phases):** recorded payments and part payments, UPI QR codes, payment and renewal reminders, bill-wise profit (K5b, v0.9.0); credit and debit notes, reverse charge, cess, TDS and TCS, exports, several GSTINs; e-invoice and e-way bill; Hindi screen words (the words file makes it a translation).
- **Known limits:** two phones editing the same draft offline: the later save wins (as for other records). Changing a saved bill re-takes stock by the difference. Real businesses bill on the phone's real date (the demo keeps its fixed 1 Jan 2027); the server refuses to number a bill dated after tomorrow in India, because the date decides the series.
- **The founder still has to do:** find the 5 owners for the first test and a CA to check sample bills (F22 part 3); merge the PR after checking the preview; approve the release.
