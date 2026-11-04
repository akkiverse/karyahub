# CR-0013: Your own item details, lists and units (part 1 of the item changes)

- **Status:** Released
- **Requested by:** Founder, 4 Nov 2026. Trial owners will add their items first, and a real sheet (electric wire sold by the coil) failed on the unit "COIL" and had no place for brand or material. Design approved the same day ("All looks good"; answers: the person may change the metres when cutting, safety limits 50 units per item and 15 fields per business, cost price per unit). TASKS K5c.
- **Date:** 2026-11-04
- **Kind:** Feature (minor version)
- **Release:** v0.9.0
- **Branch:** `cr/0013-own-fields-and-units`
- **Pull request:** [#17](https://github.com/akkiverse/karyahub/pull/17)
- **References:** [Design for approval](https://claude.ai/artifact/2LErXeWJXtGswTV8uhbdEm), [ADR-0017](../adr/0017-own-item-fields-lists-and-units-as-records.md)

## Why
Every business sells different things and describes them differently, and the six built-in units don't cover a coil, a box or a dozen. Putting brand and material into each item's name makes search, filters and clean bills impossible and invites typos. The founder first asked for a database per business; ADR-0017 explains why one shared database with fields and lists as records gives the same freedom without the cost.

## What changes
What people see:
- **Item details and lists** (Inventory → Item details): the owner adds details such as Brand, Material type, Size or Colour at the start or later (text, number or pick-list; needed, show in list, filter, print on bills), renames and stops them; a starter set for the kind of business is one tap. Staff who manage inventory add entries to a pick-list and units. Up to 15 details in use.
- **Item form** asks for the details: a text or number box, or a box that suggests the list and accepts a new word (which joins the list). The unit menu has "New unit…" (a name, whole numbers only or not).
- **Inventory list** shows the chosen details, finds items by any detail, and filters by a brand (or any pick-list marked as a filter); the item page lists all details.
- **Units of my own** (Coil, Box, Dozen): stock, counts, parts and messages use their names; whole-number rule per unit; merged with a unit of the same name.
- **Bulk upload:** the template has a column for each detail (named as the detail is); Check names the entries and units the file would add, the columns it won't import, a likely typo, and per-row problems; Import adds them first. Files of more than 500 rows go in parts of 500.
- **Bills:** details marked "print on bills" join the line's description; a unit of the business's own prints by its name.
- **Phone storage:** a plain warning when the phone is nearly full or refuses a save.
- **Fixed:** the two checkboxes on the item form ("Price includes GST", "Service, no stock") were invisible in v0.8.0 (a style clash); they are plain visible checkboxes now.

What changes underneath:
- Three new record kinds in the shared `records` table (`item_field`, `list_entry`, `unit`) with permissions (details: manage_settings; entries and units: manage_inventory; all readable by those who see items). No migration and no schema change.
- `item.attrs` (field id to value); the server checks the unit and each detail against the business's own records; a duplicate name added by a second phone becomes an alias and items are rewritten to the first.
- The phone sends `item_field`, `list_entry` and `unit` changes before items; `src/domain/fields.js`, `src/domain/field-actions.js`, `src/views/fields.js`, `src/domain/csv.js`; on-device data version 6.
- Server: `backend/karyahub/data/item_fields.py`; the CSV import (`inventory_import.py`) reads the business's columns.

## How the 7 rules are kept
1. **Each business is a wall.** The new records carry `business_id` under row-level security; an item pointing to another business's entry has the pointer dropped (AC-32.8).
2. **Works without extras.** No AI is needed; the local-AI reading of messy sheets is left for after the first feedback.
3. **Field first.** Details, entries and units are made and used with no signal, and sent in the right order when it returns.
4. **The owner controls access.** Only manage_settings changes details; manage_inventory adds entries and units.
5. **One way out for messages.** Not touched.
6. **Secrets stay secret.** No new secrets.
7. **India-ready.** Units like Coil, Box and Dozen; HSN and GST stay on every item; Indian formats unchanged.

## Spec impact
| Criterion | Change |
|---|---|
| AC-32.1 to AC-32.8, AC-33.1 to AC-33.3, AC-34.1 to AC-34.5, AC-35.1 | Added (US-32 to US-35, 17 criteria) |
| AC-25.4, AC-25.6 | Changed: the form asks for the business's own details and units; the CSV has the business's columns, adds new entries and units at import, and bigger files go in parts |
| Data model, Out of scope | Updated |

## Architecture impact
- ADR-0017 (new). No migration; `SCHEMA_HEAD` stays 0004.
- New server module `data/item_fields.py`; `Batch.all_of` and `Batch.unit_info`; the import rewritten around a `Book` of the business's fields, entries and units.
- New web modules `domain/fields.js`, `domain/field-actions.js`, `domain/csv.js`, `views/fields.js`; the unit table in `domain/inventory.js` is refreshed from the business's units.

## Verification
- **Server (pytest):** 23 new tests in `test_us32_item_fields.py`: fields (add, rename, stop, name rules, 15 limit, kind changes), entries (unique, merged duplicates, stopped), item checks (kinds, required, unknown fields, items from before), permissions, walls between two businesses, units (merge, whole-number rule, stop) and the import (what will be added, unknown columns, typo notes, the same file twice, bad values, required details, header spellings). Two older import tests were moved to the new behaviour (a unit like "box" is added instead of refused).
- **Web (Vitest):** 30 new tests in `us32-fields.test.js` for every story on the demo and on a real business through the fake server (change order, another phone's details, made with no signal), the template, splitting a 1,203-row file, the check screen, the storage warning and a business saved by v0.8.0.
- **Totals:** see the test report. Ruff and `npm run build` clean.
- **Visual:** Playwright at 375 and 1280 px, light and dark, of the new screens (see the test report).

## Notes
- **Part 2 is a separate change request (CR-0014):** selling one item in several units, each with its own stock, prices and low-stock level; a Cut button (one coil becomes 90 loose metres, the person can change the metres); units on bills, job parts, counts and history. Part 1 gives units a name and a whole-number rule only.
- **Not in this part:** AI reading of messy sheets, Excel files, suppliers, variants, batches with expiry, government unit codes for GST filing, turning a text detail into a pick-list.
- **Known limits:** phone storage is about 5 million characters per site (warned at 3 million). A number detail that was text keeps its old text value until the item is next saved. Two phones editing the same entry offline: the later save wins.
