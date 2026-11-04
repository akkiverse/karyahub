# CR-0018: Phase Alpha, the platform admin console

- **Status:** Approved, not built
- **Requested by:** Founder, 4 Nov 2026: "more tabs in Admin platform, details of each business, total number of users that can be filtered, a dashboard with proper graphs, manage business functionality addition and removal (AI integration, premium subscription and all), understand how customers are working and logging in, warnings."
- **Date:** 2026-11-04
- **Kind:** Feature (minor version)
- **Release:** v0.12.0
- **Branch:** `cr/0018-platform-console`
- **Pull request:** (to be added when the build starts)
- **Issues:** the Phase Alpha epic and one issue per story, US-44 to US-49 (milestone v0.12.0)

## Why
The platform admin can today list businesses, add one, turn one off and reset an owner's PIN. That is not enough to grow KaryaHub: there is no view of who is stuck, who gets value, who pays, or what to build next, and no way to switch features per business. See [PHASE-ALPHA.md](../product/PHASE-ALPHA.md) for the reasoning and the full scope.

## What changes
- **Seven tabs for the platform admin:** Overview, Businesses, People, Attention, Plans, Growth, System.
- **Overview and graphs** (sign-ins, active businesses, bills, jobs and items made, new businesses), the setup ladder, and a page for each business and each person, with filters.
- **Attention:** warnings with a reason and an action, and snooze.
- **Plans and features:** a feature catalogue, plans (Trial, Free, Premium, Early access), per-business exceptions with an end date and a reason, limits for AI calls and people, grace after a plan ends, a "Your plan" card for owners, and "Ask for this".
- **Growth:** stage, trade and source for each business, notes and follow-ups, payments recorded by hand, renewals due, feature use, running cost, announcements.
- **System and safety:** version, database, row-level security, server mode, AI servers, an admin log, PIN asked again for risky actions, CSV export.
- **Every existing business starts on Early access with everything on**, so nobody sees a change on release day. A bill, item or customer change is never refused because of a plan.

## Spec impact
| Criterion | Change |
|---|---|
| AC-44.1 to AC-44.9 (See how KaryaHub is doing) | Added |
| AC-45.1 to AC-45.9 (Know each business and each person) | Added |
| AC-46.1 to AC-46.9 (Be warned, with something to do) | Added |
| AC-47.1 to AC-47.15 (Control plans and features) | Added |
| AC-48.1 to AC-48.10 (Run customers and growth) | Added |
| AC-49.1 to AC-49.9 (Keep the console safe) | Added |

## Architecture impact
One migration adds `plans`, `business_accounts`, `feature_overrides`, `usage_daily`, `sign_in_events`, `account_notes`, `payments_received`, `feature_requests`, `announcements`, `warning_snoozes`, `platform_settings` and `platform_log`, and one column, `users.last_seen_at`. The console reads its own tables and never the `records` table (except a scoped "Rebuild numbers" that reads one business at a time inside its wall). Feature checks sit at the server routes, next to the existing pack checks. An ADR is written with the build.

## Verification
To be filled in when built: one test per criterion, a test that loads data saved by v0.11.0, and the existing wall tests with the new tables present.

## Notes
- Built in six saved steps inside one pull request: data and counting; Businesses and People; Overview and Attention; Plans and features; Growth; System and safety.
- Getting paid (K5b) moves to v0.13.0 and the owner dashboard (D1) to v0.14.0.
- Decisions accepted by the founder on 4 Nov 2026 are listed at the end of [PHASE-ALPHA.md](../product/PHASE-ALPHA.md).
