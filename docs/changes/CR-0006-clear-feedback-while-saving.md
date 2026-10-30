# CR-0006: Clear feedback while saving

- **Status:** In review
- **Requested by:** Founder (chat, 2026-10-30: "once I clicked the button still it was not showing if it was clicked or on, I did multiple hit")
- **Date:** 2026-10-30
- **Release:** v0.4.1 (patch, once released)
- **Pull request:** (added when opened)

## Why
On the live Businesses screen, pressing **Create business** looked like nothing happened: the button stayed as it was, and the temporary PIN for the new owner appeared in a panel at the top of a long page while the button was at the bottom. The founder pressed it several times, and could not tell the business had been created or see the PIN. The same gap was in Admin (Add a person, Import, Reset PIN, Turn off access), Settings (Save details) and My account (Change PIN).

## What changes
- **A pressed button says so.** While the server works, the submit button switches off and shows a spinner and a short word ("Creating...", "Adding...", "Importing...", "Saving...", "Changing...") and is marked busy for screen readers. A second press is ignored, so one press makes one change. If the server refuses, the button comes back and keeps what was typed.
- **Reset PIN, Turn off and Turn on** buttons can only be pressed once at a time.
- **The result is brought to you.** New PINs, confirmations and errors are scrolled into view (clear of the sticky header), given focus so screen readers read them, and respect "reduce motion". A new PIN panel is the first thing you see.

No server, data or sign-in changes.

## Spec impact
| Criterion | Change |
|---|---|
| AC-22.10 | Added: saving shows progress, can't be submitted twice, and results are brought into view |

## Architecture impact
None.

## Verification
- Web: 4 new Vitest tests (87 in all): progress text and disabled state, three presses make one request, the PIN panel is focused and scrolled to, a refused attempt re-enables the button and keeps the text, one-at-a-time action buttons, and the same for adding a person.
- Server: unchanged, 78 pytest tests pass.
- Real browser (production build, real server, phone-sized screen, server slowed to 1.2 seconds): the button read "Creating..." and was disabled, three presses sent one request, and the PIN panel was focused and fully in view below the header.

## Notes
If a business was created by an earlier press and its owner's PIN was never seen, the platform admin resets it from Businesses (Reset <owner>'s PIN) and gives the owner the new temporary PIN.
