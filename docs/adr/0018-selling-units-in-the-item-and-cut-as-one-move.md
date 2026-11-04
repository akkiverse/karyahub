# ADR-0018: Selling units live inside the item, each with its own stock, and a cut is one move

- **Status:** Accepted
- **Date:** 2026-11-04
- **Change request:** CR-0014

## Context
Part 2 of the item work: a wire is bought and counted by the coil, but also sold by the metre and by the box, and the shop cuts a coil into loose metres by hand. Coils and loose metres are two separate stocks that a person moves between; one total in metres (the first idea) cannot show "22 coils and 85 loose metres". The founder decided: each unit has its own count, a person records the cutting, any number of units, 90 m and 180 m coils are two units of one item.

## Decision
1. **The item keeps its main unit exactly as before** (`unit`, `sale`, `cost`, `low`, `qty`) and gains a list `sells` of its other units, each `{unit, sale, cost, low, cut_from, cut_gives, qty}`. Everything written for v0.9.0 (bills, parts, counts, history, the CSV) keeps working on the main unit with no migration, and items made before this change read with an empty list.
2. **The server owns every quantity**, as before: a phone sends moves, the server changes the item's main quantity or the quantity inside `sells` in the same transaction as the move. A stock move says its unit only when it is not the main one.
3. **A cut is one stock move** (`kind: cut`, the unit cut and `qty` negative, `to_unit`, `gave`, both quantities after), so the two sides can never be saved apart. It is refused when the first unit has too little. The unit made by cutting remembers a usual number (`cut_gives`) that the person may change each time.
4. **A bill line says its unit** (`unit_id`). The bill's record of the stock it took keeps the item's id as the key for the main unit and `item|unit` for any other, so bills saved before this change are read as the main unit and a change is still moved by the difference.
5. **Job parts stay in the main unit** in this version (a job's list of parts is one number for each item); another unit is refused in plain words.
6. **The CSV has one row for each unit**: rows with the same code are one item, the first is the main unit.
7. **Limits:** up to 49 other units (50 with the main one), a safety limit so a bad file can't flood a phone.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| One total in the smallest unit, with conversions | One number | Can't show whole coils and loose metres; the founder wanted them counted apart and cut by a person |
| **Main unit as before plus `sells` inside the item (chosen)** | No migration; old data and bills unchanged; one record per item syncs as before | The item record grows with units; a unit-aware code path in moves, bills and the CSV |
| Every unit its own item linked to the others | Reuses everything | Two items for one wire: one name, one set of details to keep in step; no cut, no single bill line choice |
| A table of units per item | Relational | A migration and a new table for what is a short list; row-level security and sync would need new rules |

## Consequences
- Selling in a unit other than the main one never changes the main unit's count; only a person's Cut moves stock between units.
- A bill never refuses for stock (as in v0.8.0): selling more loose metres than are counted shows the unit as Short, a reminder to cut a coil.
- Parts used on a job in a second unit, and a stock-in that converts units by itself, are not built; they can follow if a real firm needs them.
