# CR-0016: History: who did what

- **Status:** Released
- **Requested by:** Founder, 4 Nov 2026: "Item added or decreased, or bill generated: any stuff like this should be logged and also display in history the name of the user who made the changes."
- **Date:** 2026-11-04
- **Kind:** Feature (minor version)
- **Release:** v0.11.0, with CR-0015
- **Branch:** `cr/0016-history-who-did-what` 
- **Pull request:** [#22](https://github.com/akkiverse/karyahub/pull/22)

## Why
The server already logged most actions with the person's name, but they were hard to see: the activity log was on Admin only, showed the latest 15 lines, and read in server time. An item's page showed stock moves only, not who added it or changed its price.

## What changes
- **History** in the sidebar (account menu on a phone): every change in the business, newest first, by day, with the person's name, what they did and the time on the device's own clock. Filter by Items and stock, Bills, Jobs and customers, Team and sign-in, Settings, or by person; search by an item, a bill number or a name; Show older.
- **A permission,** "See the history (who did what)": the owner's by default, and the owner can switch it on for a role or a person (rule 4).
- **An item's page** now also shows who added it, who changed what ("sale price ₹350 to ₹400") and who stopped using it, mixed with its stock moves.
- **A bill's page** shows its history open, newest first, with names and correct times.
- **Newly logged:** customers added or changed, renewal reminders, jobs recorded, job steps, parts used on or put back from a job, stock sold or returned through a bill, a saved bill being changed, and what changed on an item.
- **Fixed:** Admin's activity log and last sign-in showed server time (UTC), 5½ hours behind India; bill history did too.

## Spec impact
| Criterion | Change |
|---|---|
| AC-43.1 to AC-43.7 | Added |

## Architecture impact
No database change. `GET /api/v1/history` reads the existing `audit_log`, one business at a time, with a `view_history` permission. An item's own lines are in its record under `history` (latest 30), written by the server; a phone can't write or wipe them. The demo has no server log of its work, so its History is put together from what the device holds.

## Verification
7 server tests (`tests/api/test_us43_history.py`) and 11 web tests (`tests/us43-history.test.js`). Three older tests changed on purpose: the role table has one more row (AC-19.1), and the two pack tests' menu lists now allow for History (AC-26.2, AC-26.3). A real business was driven in Chrome against the local server: items, stock moves, a price change, a bill and Mark as paid each show the right name and the device's time.

## Notes
- **After the founder's first look (4 Nov):** the name was there but too quiet to notice, so each row now says "By <name>" on its own line with a small mark and the time; "Added" beside "Opening stock" read as an extra entry, so they are one row, in the item's history and in History.
- **Cost figures stay out of history lines** ("cost price" changed, no amount), because someone may be allowed History but not costs.
- **Not retroactive:** an item's "Added" line exists only for items added from now on, and actions newly logged here start now. What the log already held shows from its first day.
- **Not logged:** drafts (nothing has happened to a bill until it is saved), and looking at something.
- **Changes waiting on a phone with no signal** appear in History when they reach the server; on the item they show at once.
