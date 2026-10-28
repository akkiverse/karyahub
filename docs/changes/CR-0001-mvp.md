# CR-0001: First version (MVP demo prototype)

- **Status:** In progress
- **Requested by:** Founder (board notes)
- **Date:** 2026-10-28
- **Release:** not yet released
- **Pull request:** to be opened from `cr/0001-mvp`

## Why
The founder approved the build of KaryaHub's demo prototype on the Idea Studio board. The founder's notes ask for "a basic prototype to display to the client or vendor with dummy data and processing" that "can explain what problem it will be resolving", and say the real product depends on the WhatsApp Business Cloud API, a speech-to-text service and an LLM, which need accounts and keys the team cannot create. So the MVP is a web demo that simulates the WhatsApp conversation, with every outside service behind an adapter that returns mock responses.

## What changes
A new mobile-first web app with five screens (Home, Chat, Jobs, Renewals, Settings) plus a Document view:
- Home explains the problem and shows the money at stake in the next 90 days.
- Chat simulates a WhatsApp thread: sample voice notes, a job-sheet photo or free text are transcribed, extracted and turned into a job summary card the owner can edit and approve.
- Jobs lists approved jobs and creates quotations or GST-format invoices (CGST 9% + SGST 9%) with a DEMO watermark and print-to-PDF.
- Renewals lists AMC contracts due in 30, 60 or 90 days or lapsed, and previews the WhatsApp reminder a customer would get.
- Settings shows demo mode, each adapter's status and the key it would need, a failure simulator and a demo reset.

## Spec impact
| Criterion | Change |
|---|---|
| AC-1.1 to AC-1.3 | Added |
| AC-2.1 to AC-2.4 | Added |
| AC-3.1 to AC-3.4 | Added |
| AC-4.1 to AC-4.4 | Added |
| AC-5.1 to AC-5.4 | Added |
| AC-6.1 to AC-6.4 | Added |

## Architecture impact
New codebase. Decisions: ADR-0001 (spec-driven development), plus the ADRs written during the build for the stack, storage and adapters.

## Verification
To be filled when the build is tested.

## Notes
Open questions from the spec were answered with the analyst's recommended defaults: AC service as the demo vertical, a dummy firm called "CoolCare AC Services", and English reminder text. The founder can change any of these with a change request.
