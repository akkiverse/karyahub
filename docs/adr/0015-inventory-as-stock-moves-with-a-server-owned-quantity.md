# ADR-0015: Inventory as stock moves in the records table, with a quantity the server owns

- **Status:** Accepted
- **Date:** 2026-11-01
- **Change request:** CR-0011
- **Builds on:** [ADR-0013](0013-business-data-sync-and-row-level-security.md) (records, sync, the two walls). Learns from the inventory ledger in the reference platform's LLD (section 9), keeping its core and leaving its larger parts for later.

## Context
A firm's technicians take parts on jobs, often with no signal, and two phones can use the same last capacitor at the same time. Inventory has to be right for the owner (what is in the store, what is low), has to work offline for the people allowed to take parts, and has to keep one business's stock out of another's sight like everything since CR-0009. A quantity that phones write would be wrong as soon as two phones disagree.

## Decision
1. **Two new kinds of record, no new data table for them.** `item` (name, code, unit, prices, HSN, GST, low-stock level, stopped, quantity) and `stock_move` are rows of `records`, so they already carry `business_id`, sit behind the same row-level security policy and travel in the same `POST /api/v1/sync`. `kind` is 12 characters wide; `stock_move` fits.
2. **Stock is a list of moves, and a move is never changed.** A move is `opening`, `in`, `out`, `used` (on a job), `returned` (put back from a job) or `count`. The server refuses to change or replace a saved move ("add a correction instead"). A mistake is fixed with another move. This is the reference platform's rule, without its extra locations.
3. **The server owns the quantity.** A phone sends a move, never a quantity. In one transaction the server applies the move, sets the item's quantity and, for `used` and `returned`, the job's `parts_used` and its history. Like a job's state (ADR-0013 item 6), the item's `qty` and the job's `parts_used` are ignored when a phone sends the whole item or job. This is what makes two phones using the last unit both count: each move is applied one after another under the per-business counter lock, and the item shows "Short by 1" instead of one phone's work being lost.
4. **Short is allowed for parts on a job, refused for a manual stock out.** A part used on a job is a fact that already happened, so it is recorded even when the records say there is none (the reference platform does the same and flags it). A manual stock out that would go below zero is refused, with the quantity in the message. A count records the difference between what is on the shelf and the server's own quantity at that moment, so a stale phone cannot undo other phones' work.
5. **Item codes are unique per business at the database.** Migration 0003 adds `item_codes(business_id, code_key, item_id)` with primary key `(business_id, code_key)`, the row-level security policy and the grants for the restricted role, each step in a savepoint like migration 0002. Moving a code is done in one savepoint, so a failure never loses the old code.
6. **The phone shows the server's quantity plus its own moves not yet answered.** A move the server has not answered has no `after` field; the quantity on screen is `item.qty + sum of those moves`. When the server's answer arrives, the item and the move come back together and nothing is counted twice. Item fingerprints for sync leave `qty` out, so a quantity changed by another phone is never sent back as an edit.
7. **Permissions.** `view_inventory`, `manage_inventory` and `use_parts`, on for the owner and the office coordinator and **off for technicians** (the founder, 1 Nov 2026: technicians work on WhatsApp). Items can be read with `view_inventory`, `use_parts` or `manage_inventory`; the history of moves needs `view_inventory` or `manage_inventory`; a `used` or `returned` move needs `use_parts`; every other move and every item change needs `manage_inventory`. Cost prices are removed from items and moves for people without `manage_inventory`.
8. **CSV import is its own call** because every code must be checked against the whole business: `POST /api/v1/inventory/import` with `check: true` reports each row, and without it saves the good rows. It takes the same change numbers and transaction path as a sync, so phones pull the new items. Matching an existing item is by code, or by name when there is no code, so importing the same file twice changes nothing.
9. **Parts on invoices.** When the office makes a quote or invoice, the parts a job used become lines at the item's sale price, unless a line of the job already names the part (so a job-sheet photo that charges "Capacitor 45 uF" is not charged twice).
10. **Activity log.** Item changes, stock in and out, counts and imports are logged; parts used and put back appear in the job's history.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Moves in `records`, quantity written by the server in the same transaction (chosen) | No new sync path; the wall, sync and offline queue already work; two phones can't disagree about the quantity | The quantity is stored in the item's JSON, so reports must read JSON until a typed table is worth it |
| Typed tables `items`, `stock_balances`, `stock_movements` as in the reference LLD | Constraints in the database (no negative balance); simple reports | New sync path, new mappers and new row-level security for each; much more code for one store |
| The phone writes the quantity (last write wins) | Simplest | Wrong as soon as two phones disagree, which is exactly the offline case |
| Derive the quantity from all moves on the phone | No stored quantity | Needs every move on every phone (the history is for people with `view_inventory` only), and the list gets slow as moves pile up |
| Refuse a part used when it is not in stock | Records never go negative | A technician at a customer's door can't record what already happened; the record would be wrong |

## Consequences
- Moves pile up (about 3,000 a year for a busy firm). That is fine for a phone's copy now; if it gets slow, the phone can keep only the last 12 months of history (risk R-25).
- One more table (`item_codes`) and one more grant for the restricted role; `/api/health` still reports `row_level_security`, and `rls.probe` now checks six policies.
- A stopped item is hidden but never deleted, so history and old jobs stay readable.
- Later steps (a technician's van stock, returning old parts within 48 hours, serial numbers and barcodes, purchase orders, a parts-variance report) can add move kinds and locations without changing how moves are stored.
- The job's `parts_used` and `events` entries for parts are server-owned, so a phone that edits a job never overwrites them.
