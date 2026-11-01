# CR-0011: Inventory per business

- **Status:** In review
- **Requested by:** Founder (TASKS.md K2, 30 Oct 2026: "each business has its own items: add and edit by hand, import from CSV, stock in and out, low-stock marks, and parts used on a job taken from stock"). On 1 Nov 2026, when approving the design: call it **Inventory**, and technicians get no inventory permission by default ("they use WhatsApp to share snaps or updates and are rarely given access to this portal"; the owner can give one technician access).
- **Date:** 2026-11-01
- **Release:** v0.7.0 (planned)
- **Pull request:** [#13](https://github.com/akkiverse/karyahub/pull/13)
- **Design mockup:** [docs/design/mockups/inventory.html](../design/mockups/inventory.html)

## Why
An AC-service firm keeps gas, capacitors, copper pipe, PCBs and motors in a store, and parts leave it for jobs. Until now KaryaHub knew a job's parts only as a line of text in the note ("R32 gas 1 kg, capacitor"). The owner couldn't see what is in the store, what is running low, or which job used which part, and parts that leave without being billed are a known loss for these firms. The reference platform's design calls this "parts leakage". To run a whole day on KaryaHub (the K goal), a firm needs its own inventory, kept per business and offline-safe like everything since K3.

## What we took from the reference platform, and what we left for later
Source: `kritvo-api` docs, LLD section 9 "Inventory ledger and part obligations" and HLD section 9.3 "Parts loop" (github.com/AbhishekKumarSingh07/kritvo-api); `kritvo-web` has no inventory screens yet, and its offline outbox matches what K3 built.

| Reference idea | In K2? |
|---|---|
| Items per business with a code unique in the business, a unit, a cost price and an HSN code | **Yes**, plus sale price, GST rate and a low-stock level. |
| Stock as a ledger: every change is a move, never edited, with an operation id so a repeat is harmless | **Yes.** Moves are create-only records in the K3 sync. |
| A part used must name the job | **Yes.** |
| A part used when the balance is short is not refused but flagged | **Yes**: the item shows "Short by N". |
| Corrections are their own move with a reason | **Yes**, as **Count**. |
| Several stock places (warehouse, each technician's bag, site, scrap, vendor) | **Later.** One store per business. |
| Serial-numbered parts, barcode scans, photo plus approver for manual entry | **Later** (needs media storage). |
| Return obligations (old part back within 48 hours), vendor returns, warranty claims | **Later.** |
| Purchase orders, transfers, a parts-variance report | **Later** (D1 and after). |

## What changes
What people see (the [mockup](../design/mockups/inventory.html) shows each screen):
- **A new Inventory screen** for anyone with *See inventory*: tiles for items, low, out or short and stock value (value only for people who manage inventory); a search box that finds items by name or code ("cap 45" finds "Capacitor 45 µF") with no signal; chips All, Low, Out and Stopped with counts; each item with its quantity and a mark (amber **Low**, red **Out**, red **Short by N**). Cards on a phone, a table from 760 px.
- **Add and edit an item:** name, code (unique in the business), unit, sale and cost price, HSN, GST rate, low-stock level, and opening stock for a new item. Each field has its own message. An item is never deleted: **Stop using** hides it and **Use again** brings it back.
- **CSV import with row errors:** download a template, choose a file, **Check** lists every row as new, update, no change or a problem with its row number and reason, then **Import** saves the good rows. A code (or, with no code, a name) that exists updates that item and keeps its quantity; importing the same file twice changes nothing. Needs a signal and says so.
- **Stock in** (supplier, bill number, cost, date), **Stock out** (returned to supplier, damaged or lost, used without a job; never below zero) and **Count** (type what is on the shelf; the difference is recorded as a correction). Each item has a history: date, what, ± quantity, who, the job, the quantity after.
- **Parts used on a job:** the job's screen has a **Parts used** panel. The office takes parts from inventory (also with no signal) and removes one if it was a mistake (it goes back). Parts named in the job note are offered as one-tap suggestions ("From the note: R32 refrigerant gas, take 1 kg"), matched by name with no AI. When the quote or invoice is made, each part used becomes a line at its sale price, unless a line of the job already names the part.
- **Who sees what (decided 1 Nov):** three permissions the owner can switch per role or per person: *See inventory* (`view_inventory`), *Add items, import, stock in and out, counts* (`manage_inventory`) and *Take parts for a job* (`use_parts`). They are **on for the owner and the office coordinator and off for technicians.** Technicians report on WhatsApp, so the office takes the parts for their jobs from the note. The owner can give one technician `use_parts` (that person sees the items and can take parts, but no Inventory screen, history or prices). Cost prices are not sent to people without `manage_inventory`.
- **Phones:** Inventory is on the tab bar; Admin moves into the account menu there so the bar keeps five places.
- **Activity log:** item changes, stock in and out, counts and imports; parts used and put back are in the job's history.
- **Demo business:** sample stock on the device (never synced), no CSV import.

What changes underneath:
- **Items and stock moves are records** (`item`, `stock_move`) in the K3 `records` table and the same `POST /api/v1/sync`, so `business_id`, row-level security and the offline queue already apply. See [ADR-0015](../adr/0015-inventory-as-stock-moves-with-a-server-owned-quantity.md).
- **The server owns the quantity** and each job's `parts_used`, and changes them in the same transaction as the move. A phone shows the server's quantity plus its own moves not yet answered.
- **Migration 0003** adds `item_codes` (unique code per business) with `business_id`, the row-level security policy and the grants, each step in a savepoint so start-up never fails.
- **New call** `POST /api/v1/inventory/import` (check, then import).

## How the 7 rules are kept
1. **Each business is a wall.** Items, moves and codes carry `business_id`, every statement filters by it, row-level security covers them (`item_codes` included; the coverage test and the real-Postgres test check it), and tests prove business A can't list, change or use B's items, or put a part from A's inventory on B's job.
2. **Works without extras.** Nothing needs AI, WhatsApp or speech. The suggestions from the note are plain name matching.
3. **Field first.** Parts used, stock in, stock out and counts are saved on the phone first, shown at once, and sent once each with an operation id. Two phones that both use the last unit are both counted ("Short by 1"). The one thing that needs a signal is the CSV import, and it says so.
4. **The owner controls access.** Three permissions, switchable per role and per person; important actions go in the activity log.
5. **One way out for messages.** K2 sends no messages. A low-stock message to the owner is noted for K6.
6. **Secrets stay secret.** No new secrets. Cost prices are business-sensitive, so the server doesn't send them to people without `manage_inventory`.
7. **India-ready.** ₹ in Indian format with prices kept in paise; quantities with their unit; dates dd-mm-yyyy; HSN codes of 4, 6 or 8 digits; GST rates 0, 5, 18 and 40 % (the slabs since September 2025; default 18), stored now for K5's documents.

## Spec impact
| Criterion | Change |
|---|---|
| AC-25.1 to AC-25.19 | Added (US-25 Inventory per business) |
| AC-14.3 | Changed: the office coordinator's navigation adds Inventory |
| Data model, Non-functional, Out of scope | Updated: item, stock move, item code, a job's `parts_used`; inventory no longer out of scope |

## Architecture impact
- ADR-0015 (new): stock as moves in the records table, a quantity the server owns.
- Migration 0003 (`item_codes`); `SCHEMA_HEAD` is `0003`; `rls.TABLES` has five tables.
- New server modules `backend/karyahub/data/inventory.py` (rules) and `inventory_import.py` (CSV); web modules `src/domain/inventory.js`, `src/domain/stock.js`, `src/views/inventory.js`, a panel in `src/views/jobs.js`.
- ARCHITECTURE.md (Inventory section), HLD.md, RISKS.md (R-25 to R-27), DESIGN.md, ROADMAP.md updated.

## Verification
- **Server (pytest):** 29 new tests in `tests/api/test_us25_inventory.py`, one or more per criterion: the wall between businesses (items, moves, jobs, codes, CSV), a move sent twice applied once, two phones using the last unit, moves that can't be changed, no move on a closed job or another business's job, the check and import run twice, cost hidden from people without `manage_inventory`, technicians with no access by default and one allowed per person, activity-log lines. The wall coverage test now covers migration 0003.
- **Web (Vitest):** 29 new tests in `tests/us25-inventory.test.js`: search and chips, marks, the add form's messages, stock in, out and count, parts used and suggestions, invoice lines, offline moves sent once, an answer lost and sent again, a refused move taken back, CSV check and import, technician screens, data from v0.6.0.
- **Real PostgreSQL 16.2:** the Postgres-only test extended to `item_codes`, and a smoke run of the API with the restricted role on (`row_level_security: on`).
- **Visual:** Playwright at 375 and 1280 px, light and dark, against the real server (see the test report).
- **Totals:** 289 of 289 tests (151 server, 138 web), plus the Postgres-only test; Ruff and `npm run build` clean.

## Notes
- **Decisions made with the founder:** the name is Inventory; one store per business; technicians have no inventory permission by default; using more than is in stock on a job is allowed with a warning, a manual Stock out of more than is in stock is refused.
- **Not covered, on purpose:** the real Neon database was not reachable from the coding PC (the first check is `/api/health` after the preview deploys; migration 0003 runs at start-up, and if the host refuses a grant the app keeps working and says `row_level_security: off`); a technician's own van stock, returning old parts, serial numbers and barcodes, purchase orders and a parts-variance report; a low-stock message to the owner (K6).
- **Known limits:** moves pile up (R-25); a part can show as short until someone counts (R-26); a job line and a part line can double-charge when the names differ (R-27: matched by name words only); the old `parts` text on existing jobs is not turned into stock.
- **Real-business dates:** inventory moves use the device's real date. The rest of the app still uses the fixed demo date for job and document dates; that is older behaviour, not changed here.
