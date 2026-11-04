# CR-0015: The Deep Ocean Teal look, with Aurora Dark and Clean Light

- **Status:** Released
- **Requested by:** Founder, 4 Nov 2026, with reference screenshots and a written design system
- **Date:** 2026-11-04
- **Kind:** Feature (minor version)
- **Release:** v0.11.0 (Getting paid moves to v0.12.0)
- **Branch:** `cr/0015-deep-ocean-teal`
- **Pull request:** [#21](https://github.com/akkiverse/karyahub/pull/21)
- **References:** [ADR-0019](../adr/0019-design-tokens-self-hosted-fonts-and-a-per-device-theme.md), [DESIGN](../design/DESIGN.md)

## Why
The founder wants a redesigned KaryaHub: one design system ("Deep Ocean Teal"), a live switch between a dark and a light theme, a full-width layout in place of narrow columns, and the same structure on every main screen. All business logic, saved data, API calls and addresses stay as they are.

## What changes
- **Design system:** the founder's exact `--kh-*` variables for both themes and the status pill colours. The app's older token names now point at them, so every screen follows the theme, including those not in the brief (Chat, Jobs, Renewals, Businesses, forms, sheets).
- **Theme:** Aurora Dark by default and Clean Light; a Sun or Moon button in the top bar and on sign-in, and Dark, Light, System in Settings; kept per device in `localStorage` under `kh-theme`; set before the first paint.
- **Type:** Plus Jakarta Sans for headings, Inter for the interface, JetBrains Mono for rupees, GSTIN, HSN, numbers, phones, PINs and quantities. Bundled with the app, not loaded from Google.
- **Shell:** a 264 px sidebar (a drawer on a phone), a sticky top bar with a breadcrumb, a search box (Ctrl or Cmd + K), the sync badge, the theme button and + New; content up to 1440 px wide; a short entrance when the screen changes.
- **Home (from the founder's image, 4 Nov):** the banner with Hide banner; four figures; Recent Bills & Job Sheets as a Table or a Kanban Board; the Get Started Checklist with real ticks; the WhatsApp Field Feed with Generate Bill from Note; AMC renewals due with Remind; GST this month.
- **Bills:** tools in one panel; a table with number and date, customer and GSTIN, source, taxable with tax, total, status, and quick actions. GSTIN can be searched.
- **Inventory:** a table with SKU badge, item, HSN/SAC, − and + for stock with the low level under them, cost, sale price, GST and status.
- **Team (Admin):** team and the add forms on the left (5 columns), roles and the activity log on the right (7).
- **Settings:** forms on the left (6 columns), the live paper in its own sticky column on the right (6).
- **The paper:** white in both themes. A4 layouts carry the gradient (or the business's own colour) on the top bar or header band, the title and the total.
- **Sign in:** the gradient panel and the card, with the theme button at the top right.

## Spec impact
| Criterion | Change |
|---|---|
| AC-38.1 to AC-38.7 | Added: themes, tokens, fonts, the paper |
| AC-39.1 to AC-39.5 | Added: the shell, search, + New, entrance |
| AC-40.1 to AC-40.5, AC-42.1 to AC-42.5 | Added: Home |
| AC-1.1, AC-22.2 | Changed: the banner on Home, real businesses too |
| AC-41.1 to AC-41.5 | Added: Bills, Inventory, Team, Settings |
| AC-26.5 | Changed: from 900 px + New sits in the top bar, also on Admin and Settings |
| Look and feel, Screens and flows | Changed: typography, sidebar, Home |

## Architecture impact
No server, database or API change. `billFigures` gains overdue amount and counts, `gstThisMonth` is new, and the bills search also looks at the customer's GSTIN. The + and − buttons call the existing stock move. See [ADR-0019](../adr/0019-design-tokens-self-hosted-fonts-and-a-per-device-theme.md).

## Verification
33 new tests in `tests/us38-deep-ocean.test.js`. Two older tests changed on purpose, for the new banner: AC-1.1 (headline) and AC-22.2 (a real business's Home now has it too). Every main screen was captured in a real browser at 1440 px and 375 px in both themes, with no script errors and no sideways scrolling, and the theme, drawer, search, stepper, reminder, quote and print paths were driven by hand-written browser scripts.

## Notes
Decided while building, where the brief and the app or the screenshots differed:
- **The founder's image of Home replaced the written brief for Home** (4 Nov, after the first preview): banner on every business, four figures, Table and Kanban Board.
- **Real data only.** The images' sample figures aren't shown. The app has no AMC time slots, so the banner shows the next AMC by date. Overdue stays "past its due date", not ">7 days". The band across the top of the first screenshots ("KARYAHUB STUDIO · THEME…") is the mockup's own frame, and the badge "Taskflow video style showcase" reads as a design note, so it says "How KaryaHub works".
- **The Kanban board shows work; it doesn't change a status.** Moving a card would change bills, so it would be its own step if wanted.
- **The banner's words promise two things that aren't live yet:** voice notes read by AI (K7) and a UPI link on the invoice (K5b). They are the founder's words and were kept.
- **Nothing is taken away.** Chat, Jobs, Renewals and Businesses stay in the sidebar for those who may open them, the phone keeps its tab bar beside the drawer (AC-14, AC-25), and the "Today at" figures stay (AC-16.1).
- **Saved and Sent are amber,** as they are the unpaid states the brief colours amber; the words don't change.
- **Remind** opens the existing preview: no message is sent until K6 or K5b.
- **Not changed:** the public bill page (`/b/<token>`) and its PDF are drawn by the server and keep their current look, so a printed copy from the app and the PDF differ slightly in the A4 layouts.
- **Contrast:** the first version used the brief's #0EA5E9 as the gradient's middle stop, where white text is 2.77:1. The founder changed it to #0369A1 on 4 Nov, so white is 5.17:1 or better across the gradient. `--kh-primary-accent` stays #0EA5E9 (used for icons and focus on dark surfaces, not behind text). The public bill page and PDF get the new look in a separate change.
