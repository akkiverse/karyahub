# ADR-0017: A business's own item fields, lists and units are records, not new tables or databases

- **Status:** Accepted
- **Date:** 2026-11-04
- **Change request:** CR-0013

## Context
Every business sells different things. An electrical shop needs Brand, Material type and Size on its items; a repair firm needs Brand and Model; both need units the six built-in ones don't cover (a coil of wire). Version 0.8.0 had one fixed item form and six fixed units, so a CSV row with the unit "COIL" was refused and details such as the brand lived inside the item's name. The founder asked whether each business could get its own database structure, created from a file or from questions at sign-up, perhaps on a spare laptop.

## Decision
1. **The same database and the same `records` table.** Three new kinds of record: `item_field` (a detail an item carries), `list_entry` (one choice of a pick-list, such as Havells in Brand) and `unit` (a unit of the business's own). They sit behind the same `business_id` wall, row-level security and sync call as items. No migration and no new table.
2. **Items point to entries by id.** `item.attrs` maps a field's id to its value; for a pick-list the value is the entry's id. Renaming "Havels" once corrects every item. Entries and units are stopped, never deleted. A bill line keeps the words printed at the time.
3. **Two phones, one name.** Records are made on the phone with their own ids, so two phones can add "Polycab" while offline. The server keeps both records but marks the second `alias_of` the first (stopped, hidden), and rewrites any item that points to the alias to point at the first. No phone is refused and no list shows a name twice.
4. **Fixed core, flexible edge.** Name, code, unit, prices, HSN, GST and stock stay fixed fields that bills and stock depend on. The owner's fields are text, number or pick-list, at most 15 in use; field names can't be a standard CSV column. A pick-list can't change kind; text and number swap only when every value fits.
5. **Sync order.** The phone sends `item_field`, `list_entry` and `unit` changes before `item` changes, so an item never reaches the server before the entry it points to.
6. **The CSV file follows the business.** The template and the import read the business's fields by name (capitals, spaces and underscores don't matter); new entries and units in the file are added at import after the check lists them; a likely typo (a close match to an existing name) is pointed out. The phone sends files of more than 500 rows in parts.
7. **Units in code.** The built-in unit ids stay as they were; the screens keep one table of unit names that is refreshed from the business's units whenever its data changes, and the server resolves a unit's name and whole-number rule once per request.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| A database (or schema) per business, created at sign-up from questions or an uploaded schema read by the local AI | Looks fully flexible | Every release must migrate every business's structure; one failed migration stops one firm; bills, stock and GST need known columns; an AI mistake becomes a wrong structure holding real data; no AI when the AI PC is off |
| A table per list (brands, units, materials) | Familiar relational design | A code change and a migration for every list an owner invents |
| **Records of three kinds in the shared table (chosen)** | No migration; syncs offline like everything else; the wall and tests already cover it; owners add fields without a developer | The server, not the database, checks that an entry belongs to its field; a heavy report may later need a proper column |
| Free text for every detail | Nothing to build | Typos, "Havells" and "havells" as two brands, no filters |
| The spare laptop as the live database | Free | A power cut or a dead disk stops every business and could lose bills that must be kept; slower than a database next to the server (see CR-0007). Better used for backups and a second AI server |

## Consequences
- Adding a field, a brand or a unit never needs a release.
- Part 2 (selling the same item in several units, each with its own stock, and cutting a coil) builds on `unit` records and the item's unit; it is a separate change request.
- The data of a large business sits in the phone's storage, which a browser limits to about 5 million characters. The phone warns at 3 million (AC-35.1); moving to a larger store (IndexedDB) is planned if a trial business gets near it.
- If one business ever needs its own database (a large customer's request, or law), the same records can be moved as they are.
