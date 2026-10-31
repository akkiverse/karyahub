# CR-0011: Stock (inventory) per business

- **Status:** Proposed (design for the founder's approval; no app code yet)
- **Requested by:** Founder (TASKS.md K2, 30 Oct 2026: "each business has its own items: add and edit by hand, import from CSV, stock in and out, low-stock marks, and parts used on a job taken from stock. New permission `manage_inventory`.")
- **Date:** 2026-11-01
- **Release:** v0.7.0 (planned)
- **Pull request:** not opened yet
- **Mockup:** [docs/design/mockups/inventory.html](../design/mockups/inventory.html)

## Why
An AC-service firm keeps gas, capacitors, copper pipe, PCBs and motors in a store, and technicians take parts to jobs. Today KaryaHub only knows a job's parts as a line of text in the note ("R32 gas 1 kg, capacitor"). The owner can't see what is in the store, what is running low, or which job used which part. Parts that go missing without being billed are a known loss for these firms. Kritvo's design calls this "parts leakage" and makes closed-loop parts its strongest feature. To run their whole day on KaryaHub (the K goal), a firm needs its own stock list, kept per business like everything else since K3.

## What we took from Kritvo, and what we left for later
Source: `kritvo-api` docs, LLD section 9 "Inventory ledger and part obligations" and HLD section 9.3 "Parts loop" (github.com/AbhishekKumarSingh07/kritvo-api). `kritvo-web` has no inventory screens yet; its offline outbox matches what K3 already built.

| Kritvo idea | In K2? |
|---|---|
| Items per business with a code unique in the business, a unit (nos, litre, metre, kg), cost price and HSN code | **Yes.** We add sale price, GST rate and a low-stock level. |
| Stock as a ledger: every change is a stock move (receipt, issue, consume, return, adjustment), never edited, with an operation id so a repeat is harmless | **Yes.** Moves are create-only records in the K3 sync, with the K3 operation ids. |
| A part used on a job must name the job | **Yes.** |
| A part used when the balance is short is not refused but flagged as a shortfall for the store to resolve | **Yes.** The item shows "Short by N, count it". |
| Corrections are their own move with a reason, reported as variance | **Yes**, as **Count**. |
| Several stock places: warehouse, each technician's bag, site, scrap, vendor | **Later.** One store per business in K2. Stock in a technician's van is a later step. |
| Serial-numbered parts, barcode scans, photo plus approver for manual entry | **Later** (needs media storage). |
| Return obligations (the old part must come back within 48 hours), vendor returns and warranty claims | **Later.** The return-to-supplier reason in Stock out covers the simple case. |
| Purchase orders, transfers, a parts-variance report | **Later** (D1 dashboard and after). |

## What changes
What people will see (the [mockup](../design/mockups/inventory.html) shows each screen on a phone and a desktop, light and dark):
- **A new Stock screen** in the menu, for anyone with **See stock**:
  - tiles for items, low, out of stock and stock value (the value only for people who manage stock);
  - a search box that finds items by name or code ("cap 45" finds "Capacitor 45 µF") with no signal;
  - chips for All, Low, Out and Stopped;
  - each item with its quantity and a mark: amber **Low**, red **Out**, or red **Short by 1 nos**.
  - On a phone each item is a card; on a desktop it's a table.
- **Add and edit an item:** name, code, unit, sale price, cost price, HSN code, GST rate, low-stock level, and opening stock for a new item. Each field has its own error message. An item with history is never deleted: **Stop using** hides it and **Use again** brings it back.
- **CSV import:**
  - download a template, choose a file, then **Check** shows each row as new, update or problem, with the row number and reason;
  - **Import** adds the good rows only;
  - a code that already exists updates that item, and its opening stock is ignored;
  - importing the same file twice changes nothing.
- **Stock in** (bought from a supplier, with an optional supplier name, bill number and cost), **Stock out** (returned to supplier, damaged or lost, used without a job) and **Count** (enter what's on the shelf; KaryaHub records the difference as a correction). Each item has a history: date, what, ± quantity, who, the job, and the quantity after.
- **Parts used on a job:**
  - On a job's screen, a **Parts used** panel lets a technician or the office take parts from stock, offline too, and remove one if it was a mistake (it goes back to stock).
  - Parts named in the job note are offered as one-tap suggestions ("From the note: R32 refrigerant gas, take 1 kg"). Plain text matching does this, so it works without AI.
  - When the office makes the quote or invoice for the job, each part used becomes a line at its sale price, which they can still change.
- **Phones:** the bottom bar shows Home, Chat, Jobs, Stock and Renewals. Admin stays in the account menu, so the owner's phone keeps five tabs.

What changes underneath:
- **Two new kinds of record** in the K3 `records` table and the same `POST /api/v1/sync`: `item` (ordinary data; the later sync wins) and `stock_move` (create-only).
- **The server owns the quantity** in stock, like a job's state since K3. It changes the item's quantity in the same transaction as each move. A phone shows the server's quantity plus its own moves that are waiting to be sent.
- **Cost prices and stock value** are left out of what the server sends to people without **Manage stock**.
- **CSV import** is its own call, `POST /api/v1/inventory/import`, first with `check: true`. It needs a signal, because codes must be unique across the business.
- **Three new permissions** the owner can switch per role or person:

  | Permission | Lets a person | Owner | Coordinator | Technician |
  |---|---|---|---|---|
  | `view_inventory` | See stock | On | On | On |
  | `manage_inventory` | Add items, import, stock in, stock out and counts | On | On | Off |
  | `use_parts` | Take parts from stock for a job | On | On | On |

- **Activity log** entries for item changes, imports, stock in, stock out and counts. Parts used appear in the job's history.
- **Demo business:** sample stock on the device only (never synced), like the rest of its data.
- **On the phone:** data version 5 adds items and moves. Data saved by v0.6.0 loads unchanged, with no stock, and nothing is invented from old jobs' parts text.

## How the 7 rules are kept
1. **Each business is a wall.** Items and moves are `records` rows with `business_id`, filtered in every statement and covered by the existing row-level security policy. Tests prove business A can't list, change or use B's items, and can't put a part from A's stock on B's job.
2. **Works without extras.** Nothing in K2 needs AI, WhatsApp or speech. The suggestions from the note use plain text matching.
3. **Field first.**
   - Parts used, stock in, stock out and counts are saved on the phone first and sent once each with an operation id.
   - Two phones that both use the last unit while offline are both counted, and the item shows "Short by 1", as Kritvo does.
   - CSV import is the one office-only action that needs a signal, and it says so.
4. **The owner controls access.** There are three new permissions, switchable per role and per person, and important actions go in the activity log.
5. **One way out for messages.** K2 sends no messages. A low-stock message to the owner, sent through the sender layer, is noted for K5 and K6.
6. **Secrets stay secret.** No new secrets. Cost prices are business-sensitive, so the server doesn't send them to people without **Manage stock**.
7. **India-ready.**
   - ₹ in Indian format, with prices kept in paise.
   - Quantities with their unit (1.5 kg, 12 nos).
   - Dates as dd-mm-yyyy.
   - HSN codes of 4, 6 or 8 digits.
   - GST rates 0, 5, 18 or 40 % (the slabs since September 2025; default 18), stored now for K5's invoices.

## Spec impact
| Criterion | Change |
|---|---|
| AC-25.1 to AC-25.19 | Added (US-25 Stock per business) |
| AC-14.1, AC-14.3 | To be changed at build: the navigation adds Stock for each role |
| Data model, Non-functional, Out of scope | To be updated at build (item and stock move, inventory no longer out of scope) |

## Architecture impact
- New ADR-0015 at build: "Stock as create-only moves in the records table; the server owns the quantity".
- No new table is expected: `records` already has `business_id`, row-level security and the sync cursor.
- A migration (0003) is needed only if a database index on item codes is wanted. The decision is made at build and recorded in the ADR.
- New server module `backend/karyahub/data/inventory.py`, with move rules, quantity, import and cost hiding.
- New web view `src/views/stock.js`, a Parts used panel in `src/views/jobs.js`, and new permission rows in `access.py` and `src/domain/access.js`.

## Verification (planned)
- **Server tests (pytest):** one per AC-25.x. They cover:
  - the wall between businesses;
  - a move sent twice is applied once;
  - two phones using the last unit give Short by 1;
  - a move can't be changed;
  - no move on a closed job or another business's job;
  - the import's check and commit, run twice;
  - cost hidden from technicians;
  - permissions per role and per person.
- **Web tests (Vitest):** search and chips, marks, the add form's errors, stock in, stock out and count, parts used offline then synced, suggestions from the note, invoice lines from parts, and loading v0.6.0 data.
- **Real Postgres:** the existing Postgres-only test is extended to items and moves.
- **Visual check:** 375 px and 1280 px, light and dark, against the mockup.

## Notes
- **Founder decisions in this design (change any before build):**
  - The menu label is **Stock** (plain words), not "Inventory".
  - One store per business.
  - Technicians can see stock (without costs) and take parts for their jobs.
  - Using more than is in stock on a job is allowed with a warning; a manual Stock out of more than is in stock is refused.
- **Growth:** moves pile up (about 3,000 a year for a busy firm). That is fine for the phone's copy now. If it gets slow, the phone will keep only the last 12 months of history (new risk R-25 at build).
- **Later steps, recorded in ROADMAP at build:** a technician's van stock, return of old parts within 48 hours, serial numbers and barcode scans, purchase orders, and a parts-variance report (D1).
