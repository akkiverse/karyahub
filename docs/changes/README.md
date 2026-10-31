# Change requests

Every change to KaryaHub is recorded here: what changed, why, and how it affected the spec. Newest first.

| CR | Change | Why (short) | Status | Release |
|---|---|---|---|---|
| [CR-0011](CR-0011-inventory.md) | Stock per business: items with search and low-stock marks, add and edit, CSV import with row checks, stock in, stock out and counts, parts used on a job taken from stock; permissions `view_inventory`, `manage_inventory`, `use_parts` | Founder: TASKS K2, a firm runs its whole day on KaryaHub, parts included | Proposed (design and mockup) | v0.7.0 (planned) |
| [CR-0010](CR-0010-smooth-ai-and-chat.md) | Chat works and AI is smooth: Send works after each reply, thinking line with timer and Stop, photo text as it is read, warm-up, AI kit v2 (model fallback), 90 s steps in a 120 s function, version from studio.json | Founder: KaryaHub Chat didn't work although AI worked in the hub; TASKS B2 | Released | v0.6.0 |
| [CR-0009](CR-0009-business-data-on-server.md) | Business data on the server: customers, jobs, documents and chat of a real business move from the browser to the database, scoped by business with row-level security; offline changes queue and sync without duplicates; one-time import from the device; logo; the Add a person button fix | Founder: a real firm runs its whole day on KaryaHub; every phone sees the same work | Released | v0.5.0 |
| [CR-0008](CR-0008-ai-over-a-slow-link.md) | AI over a slow link: the shared AI kit waits longer to connect and for the online check, and reuses one connection | The AI PC is up but KaryaHub said the AI server was down | Released | v0.4.3 |
| [CR-0007](CR-0007-faster-sign-in.md) | Faster sign-in: fewer database round trips, reused connections, more patience in the app, health timings | Founder could not sign in: sign-in took 8.4 s and the app gave up after 8 | In review | v0.4.2 (planned) |
| [CR-0006](CR-0006-clear-feedback-while-saving.md) | Clear feedback while saving: progress on buttons, one press = one change, results brought into view | Founder pressed Create business several times and saw nothing happen | Released | v0.4.1 |
| [CR-0005](CR-0005-accounts-and-businesses.md) | Accounts and businesses on the server: mobile-and-PIN sign-in, platform admin, owners' team and access, forgot-PIN codes, real-business look | Founder: a portal many firms use, each with its own people; not a prototype | Released | v0.4.0 |
| [CR-0004](CR-0004-real-ai-studio-ai.md) | Real AI for job notes and photos (Studio AI), with a labelled "Read without AI" fallback when the AI server is off | Founder asked to replace the pretend AI with his own AI server | Released | v0.3.0 |
| [CR-0003](CR-0003-business-look-admin-and-staff-logins.md) | Business look, Admin panel and staff logins with limited access (owner, office coordinator, technician) | Founder asked for a more professional look, an admin panel and staff logins with limited access | Released | v0.2.0 |
| [CR-0002](CR-0002-advance-tech.md) | Advance Tech: KaryaHub server, secure WhatsApp webhook, proof of work, AMC visit plans, HLD/LLD/risks | Founder asked to advance the app using his reference platform's architecture | Released | v0.2.0 |
| [CR-0001](CR-0001-mvp.md) | First version (MVP) | Approved idea, built from the spec | Released | v0.1.0 |
