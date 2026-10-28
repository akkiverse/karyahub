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
