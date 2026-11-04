# CR-0014: Selling an item in several units, and Cut (part 2 of the item changes)

- **Status:** In review
- **Requested by:** Founder, 4 Nov 2026, in the approved design ([KaryaHub: your own item fields, lists and selling units](https://claude.ai/artifact/2LErXeWJXtGswTV8uhbdEm)): a wire is sold by the coil and by the metre, each counted on its own; a person cuts a coil into loose metres and may change the metres (88 instead of 90); as many units as the business wants. "Proceed ahead" after v0.9.0 was merged. TASKS K5d.
- **Date:** 2026-11-04
- **Kind:** Feature (minor version)
- **Release:** v0.10.0 (planned)
- **Branch:** `cr/0014-selling-units-and-cut`
- **Pull request:** [#19](https://github.com/akkiverse/karyahub/pull/19)
- **References:** [Design for approval](https://claude.ai/artifact/2LErXeWJXtGswTV8uhbdEm), [ADR-0018](../adr/0018-selling-units-in-the-item-and-cut-as-one-move.md), [CR-0013](CR-0013-own-fields-and-units.md)

## Why
Part 1 (v0.9.0) lets a business make its own units such as Coil, but an item still had one unit and one count. A shop that buys wire by the coil and sells it by the coil and by the metre needs two counts that a person moves between when a coil is cut.

## What changes
What people see:
- **Item form, "Also sold as":** add other units to an item (up to 49 besides the main one), each with its own sale price, cost price, low-stock level, opening stock, and optionally "made by cutting" another unit with the usual number one gives.
- **Item page:** every unit's quantity, price and low level in its own tile; History can be shown one unit at a time.
- **Stock in, Stock out, Count** ask which unit when the item has more than one.
- **Cut** (a button on an item with two or more units): which unit, how many, the unit it makes and how many it gives (filled with the usual number, changeable); one move, with who and when, shown in the history of both units.
- **Bills and estimates:** a Unit menu on a line when the item has several units; choosing one changes the unit name and the price; a saved bill takes and returns stock in the unit sold.
- **Inventory list:** other units' quantities under the main one; Low and Out chips count an item with any unit low.
- **CSV:** one row for each unit (same code), with `cut_from` and `cut_gives`; the check counts unit rows apart.
- **Fixed:** a CSV update of an existing item no longer turns a service item into a stocked one or drops "price includes GST".

What changes underneath:
- `item.sells` (a list of the other units, each with the server's own quantity); a stock move may carry `unit`; a new move kind `cut`; `bill lines` carry `unit_id`; the bill's `stock_taken` uses `item|unit` for other units. No migration. See [ADR-0018](../adr/0018-selling-units-in-the-item-and-cut-as-one-move.md).
- Server: `inventory.py` (`slot_qty`, `set_slot_qty`, `_cut`, per-unit `apply_move` and `bill_move`), `item_fields.check_sells`, `bills.settle_stock`, the import (`_sold_unit`, `_finish_groups`).
- Phone: `unitsOf`, per-unit `stockOf`, `unitMark`, `historyOf(unit)`, `stock.cut`, `lineInUnit`, `readSells`; the item form, item page, stock sheets, Cut sheet, bill line menu and import screen.

## How the 7 rules are kept
1. **Each business is a wall.** The units live in the item record under row-level security; no new table.
2. **Works without extras.** No AI, no service.
3. **Field first.** A cut and every move in a unit are made with no signal, shown at once as waiting and sent once; a cut another phone made impossible is refused by the server and taken back on this phone.
4. **The owner controls access.** Units and prices need manage_inventory like every item change; Cut needs manage_inventory.
5. **One way out for messages.** Not touched.
6. **Secrets stay secret.** Cost prices of every unit are left out for people who don't manage inventory (AC-36.6).
7. **India-ready.** Coil, Box, Dozen and metres; GST and HSN stay on the item.

## Spec impact
| Criterion | Change |
|---|---|
| AC-36.1 to AC-36.6, AC-37.1 to AC-37.3 | Added (US-36 and US-37, 9 criteria) |
| Data model | Updated (the selling unit, the stock move) |

## Architecture impact
- ADR-0018 (new). No migration; `SCHEMA_HEAD` stays 0004.

## Verification
- **Server (pytest):** 19 new tests in `test_us36_selling_units.py`: the units' shape and checks (twice, unknown, a cut from nowhere, a service, the 50 limit, a unit with stock), editing keeps every quantity, items from before, stock in every unit with its own messages, parts in the main unit only, bills (each unit, cancel, a change moves the difference, bills from before), Cut (one move, 88 instead of 90, refused cases, immutable, permission), cost prices hidden, and the CSV (one item from three rows, problems, a service kept on update).
- **Web (Vitest):** 24 new tests in `us36-selling-units.test.js`: the form (rows, kept values, errors, editing), stock in each unit, the Cut sheet and its refusals, the history of both units, bill lines, the import screen, and a real business through the fake server (a cut with no signal sent once; a cut the server refuses is taken back; a price edit keeps every quantity).
- **Totals:** see the test report. Ruff and `npm run build` clean.
- **Visual:** Playwright at 375 and 1280 px, light and dark: the item form with a unit row, the item page, the Cut sheet and the page after a cut (see the test report).

## Notes
- **Not in this change:** parts for a job in a second unit; a stock-in that converts units by itself; AI reading of sheets; Excel files; the government unit codes for GST filing.
- **Known limits:** two phones cutting the same last coil: the server applies the first and refuses the second with the reason. A bill is never refused for stock: selling more loose metres than counted shows Short.
