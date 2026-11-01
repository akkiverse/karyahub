# KaryaHub: Design

## Subject and audience
A sales demo for owners of AC, RO and fire-safety service firms in India (persona: Suresh, 45, 8 technicians in Pune). The founder presents it on a phone in a busy shop or on a laptop video call, so it must read at arm's length and feel as familiar as WhatsApp. Personality from the spec: dependable, quick, money-aware.

## The main screen's one job
Home makes the owner feel the money he is losing: one big rupee number, "Money at stake in the next 90 days", then a single button into the chat that shows how KaryaHub recovers it.

## Palette
| Token | Light | Dark | Use |
|---|---|---|---|
| `--c-brand` (deep teal) | `#0F766E` | `#3DB4A6` | Brand, primary buttons, chat header, active tab |
| `--c-ink` | `#13201E` | `#E3EEEB` | Text |
| `--c-paper` / `--c-surface` | `#F3F6F5` / `#FFFFFF` | `#0C1413` / `#142120` | Page and card backgrounds |
| `--c-money` (strong green) | `#13763A` | `#5FD08B` | Rupee totals, approved state, done steps |
| `--c-lapsed` (red) | `#B42318` | `#FF8F84` | Lapsed contracts, failed steps, errors |
| `--c-chat` / `--c-bubble-out` | `#EBE5DA` / `#D6EEE8` | `#0F1918` / `#11463F` | WhatsApp-like chat wallpaper and technician bubbles (not WhatsApp's own green) |

The dark theme is designed, not inverted: surfaces are blue-green near-blacks, the teal and greens are lifted for contrast, and the printed document stays white paper in both themes.

## Typography
Noto Sans (self-hosted, weights 400 to 800), as the spec allows: it covers Latin and Devanagari, so Hindi copy can be added later without a font change. Headings and rupee totals use weight 800 with tight tracking and tabular numerals, so the big number reads like a ledger (the Khatabook cue in the spec).

## Layout
Mobile first. Phones get a top bar (brand plus a "Demo · 1 Jan 2027" pill) and a bottom tab bar (Home, Chat, Jobs, Renewals, Settings). From 900px the tabs become a left rail. Home puts the hero copy and the money card side by side on wide screens, with the three problem cards below. Chat is a phone-shaped frame (max 440px) with a "What you are seeing" script beside it on wide screens, so the presenter has talking points. Lists are single-column cards, never dense tables, except on the printable document.

## The memorable element
The rupee meter: a huge green "₹99,100" with a three-part bar splitting it into the next 30, 31 to 60 and 61 to 90 days. When a voice note is approved, the number grows, which is the spec's delight moment. In Chat, the processing steps tick from grey to green one by one before the summary card lands.

## States
- **Empty:** Chat shows "Pick a sample to start" above the sample chips; Jobs shows "No jobs yet, send a sample in Chat" with an Open Chat button; Renewals shows "No contracts in this range".
- **Loading:** each processing step shows a small spinner and "working"; sample chips and the composer are disabled while a message is processed.
- **Error:** a failed step turns red with "Couldn't read this message. Try again." and a Try again button; live mode without keys shows "Not configured: add <SERVICE> key"; a bad document line shows "Check quantity and rate"; approving with a bad field shows the field's own message (for example "Use a 10-digit mobile number.").
- **Demo honesty:** every send says it is simulated; documents carry a "DEMO, not a valid tax invoice" watermark; the GSTIN is marked dummy.

## Additions in CR-0002
- **Proof of work card** on the job screen: a status chip (amber "Work done, waiting for customer check", green "Verified by customer" and "Closed"), three step tiles that tick green as the job moves, one primary action at a time (Send code, then the code field with Verify, then Close job), and a collapsible history. The code field uses large tabular digits with letter spacing so the customer's code is easy to read back.
- **Demo honesty:** the customer's code is shown in a dashed "Demo:" box that says the real code arrives on WhatsApp.
- **AMC service visits card:** the next visit in one sentence, then a quiet list of visits with small status tags (grey "Before tracking", red "Overdue", amber "Create job now", teal "Upcoming", green "Job created").
- **Settings:** a server icon banner for "Server mode: KaryaHub API" and one line under it with the connection status.
- **States:** loading ("Working out the visit plan…" with a spinner; "Checking the KaryaHub server…"), errors as red notes with what to do ("Couldn't reach the KaryaHub server…", the wrong-code message), and the Chat fallback named in the step detail.
- No new colours or fonts: existing tokens (`--c-soon`, `--c-money`, `--c-lapsed`, `--c-brand`) carry the new statuses in light and dark.

## Additions in CR-0003 (business look, Admin and staff logins)
The founder asked for a more professional look that appeals to businesses. Direction: **an operations console for a service firm** — calm, structured and confident, like the ledger and back-office tools owners already trust, rather than a marketing demo.
- **Sidebar:** deep ink-teal (`--c-nav` `#0C2B28`, dark `#081816`) with light text (`--c-nav-ink`, `--c-nav-muted`), the KaryaHub mark, a firm card ("CoolCare AC Services, Demo workspace"), grouped navigation (Workspace, Manage) with a teal edge on the active item, and the signed-in person with Sign out at the bottom. The work area stays light paper with white panels and hairline borders.
- **Top bar:** the firm's name on the left; the demo date and an account menu (avatar, first name; menu with name, role, Settings, Admin, Sign out) on the right. Phones show the brand and the avatar, with a bottom tab bar that lists only the screens the role allows.
- **Role colours** for avatars: owner teal (`--c-owner`), coordinator violet (`--c-coordinator` `#6D4AC2`, dark `#A993F0`), technician brass (`--c-technician` `#B7791F`, dark `#F1B45A`). Only avatars use them.
- **KPI tiles:** white tiles with a small icon label, a large tabular number and a one-line note; used for "Today at CoolCare" on Home and staff counts in Admin.
- **Sign in:** split screen on desktop: the dark brand panel with "Your field team on WhatsApp. Your office on KaryaHub." and three points; the form card and demo accounts on the light side. Phones stack the headline, the form, then the demo accounts.
- **Admin:** a Team panel (avatar, name, number and last sign-in, role select, status pill, Reset PIN, Turn off access), then Add staff beside the Roles and access table, then the Access log.
- **States:** "You don't have access to <screen>" page with a shield icon and one button to the person's start page; field-level errors on Add staff; refusals as red notes; a spinner on the Sign in button while checking.
- **Accessibility:** headings that receive focus after navigation no longer draw a focus box when focused by script (keyboard focus still shows); the account menu is a native disclosure; every new control is 44px tall or more.

## Additions in CR-0004 (Studio AI)
- **Reader tags** on the job card title: "Read by AI" uses the neutral badge with a small sparkle icon; "Read without AI" uses a brass warning badge (`.badge-warn`, from `--c-soon`) so the owner checks it more carefully.
- **Processing note:** a soft brass panel (`.process-note`) with the alert icon inside the processing card, carrying the server's note (for example "AI is offline right now, so this was read without AI. Check the details before approving.").
- **Offline banner:** the Studio AI kit's banner (`src/ui/ai-status.js`, unchanged) at the very top of the page, restyled through `.studio-ai-offline` to KaryaHub's tokens (brass-tinted surface, ink text, hairline border) in light and dark. It's calm, never red: AI being off is a normal state, not an error.
- **States:** AI online (tags only), AI offline (banner, note, "Read without AI" tag), AI answer unusable (note, "Read without AI" tag), photo unreadable while offline (the existing red error with Try again; the photo stays in the chat).

## Additions in CR-0005 (accounts and businesses)
- **Sign in:** the card says "Sign in to KaryaHub" with no business name; "Forgot your PIN?" and, only before a platform admin exists, "First-time setup" are quiet text buttons below the form. The demo accounts collapse under "Explore a demo business" so the page looks like a product, not a prototype. Forgot PIN, reset, setup and "Choose your own PIN" reuse the same card.
- **PINs shown once:** new and reset PINs appear in a brand-tinted panel ("Share these PINs now") with large letter-spaced numbers and a CSV download; it stays until dismissed and is never shown again.
- **Admin:** each team row has an "Access for <name>" disclosure with a Role default / Allow / Block select per permission; the role table uses 44px tick boxes (owner column locked on); CSV import shows problem rows by row number.
- **Businesses:** the platform admin's list uses the Team row pattern with the business icon, a Demo tag for the sample firm, and one action row (Reset owner PIN, Turn off).
- **Real businesses:** no Demo pill, watermark, "dummy" tags or sample chips; Home shows a "Get started" panel with three steps instead of the sales cards.
- **States:** loading ("Opening KaryaHub…"), server unreachable (one calm card with Try again), no-access, no permissions at all (My account explains), demo-locked Admin (controls disabled with a note).

## Additions in CR-0009 (business data on the server)
- **Sync mark** in the top bar of a real business (not the demo): "All saved" (quiet grey), "Sending 3…" (teal, the icon turns), "3 changes waiting" or "No signal" (amber outline). It names no technology and never blocks work; the full sentence is in its tooltip. It is updated in place, so a background update never redraws a form someone is typing in.
- **Banner** above the page, only when something needs a look: "We moved N items from this phone to your KaryaHub account" (once, dismissible) and "N changes were not saved" with the server's reason in plain words (dismissible).
- **New** replaces a job or document number until the server has given one (`J-0007`, `QT-2026-0003`); a quotation without a number is just "Quotation".
- **Logo**: in Settings under Business details (preview, Add or Replace, Remove; picture up to 200 KB, resized to 256 px in the browser) and at the top left of quotes and invoices (up to 120 × 64 px, never stretched).
- **Add a person** at the top of Admin is a button that moves to the form and puts the cursor in the first box.

## Additions in CR-0011 (inventory)
Design record: the clickable mockup `docs/design/mockups/inventory.html` (uses `src/styles.css`; phone and desktop, light and dark, owner and technician, signal on and off). The built screens follow it.
- **Inventory** is a new item in the sidebar (box icon) and on the phone tab bar. Admin leaves the tab bar (it is in the account menu) so the owner's phone keeps five tabs. Technicians don't get it unless the owner allows one of the three permissions.
- **List:** KPI tiles (items, low stock, out or short, and stock value for people who manage inventory), a 48 px search box, chips with counts (All, Low, Out, Stopped). On a phone each item is a card with the quantity large on the right and its mark under it; from 760 px a table with Code, In stock, Low at, Sale price, Cost price (only for people who manage inventory) and Mark.
- **Marks** use the existing tokens: amber **Low** (`--c-soon`, with the alert icon), red **Out** and **Short by N** (`--c-lapsed`). The quantity takes the same colour, so a list can be scanned by colour as well as by word.
- **Item page:** name with its mark, code, unit, HSN and GST in one line, the actions (Stock in, Stock out, Count, Edit, Stop using), three tiles, and the history as a plain list (date, what, who, ± quantity, "then N"); a move still waiting to send says so.
- **Sheets** (stock in, stock out, count, take a part) reuse the Renewals sheet: a bottom sheet on phones, a centred card from 700 px, closed by Cancel, the close button or Escape; the first box has focus; the quantity box carries its unit; a count shows what it will record while it is typed, and a part for a job warns when it is more than is in stock.
- **Add or edit an item:** one form, each field with its own message under it. **CSV import:** three numbered steps (template, file, check), tiles for new, updates and problems, a red list of problem rows by row number, then the table of every row with its reason, and one button that says how many good rows it will import.
- **Parts used on a job:** a panel under the charges: **Take a part from inventory**, a tinted "From the note" box with one **Take 1 kg** button per matched part (and a small cross to decline), the parts taken with their quantity (and price for people who make paperwork) and **Remove**, and a line that they are added to the quote and invoice.
- **States:** empty list ("No items yet." with Add item), no match for a search, a stopped item, a part that is short (red note on the item page), a closed job ("This job is closed, so its parts can't change."), no signal for an import (the file stays, **Try again**), and the read-only note for people who can see but not change.
- No new colours or fonts; new classes are `inv-*`, `mark-*`, `qty`, `moves`, `unit-field`, `suggest-box`, `parts-list` and `pick-list`. Every control is 44 px or taller.
