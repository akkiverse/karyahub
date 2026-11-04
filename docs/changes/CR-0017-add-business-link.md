# CR-0017: Add a business button no longer sends the platform admin to a no-access page

- **Status:** In progress
- **Requested by:** Founder, 4 Nov 2026: "When I login as platform admin, and click on add a business, it is throwing me the attached warning ('You don't have access to Home'), though directly I am able to add business."
- **Date:** 2026-11-04
- **Kind:** Fix (patch version)
- **Branch:** `cr/0017-add-business-link`
- **Pull request:** (to be added)

## Why
On Businesses, the **Add a business** button at the top was a link to `#biz-add`. The app reads every `#...` address as a page, did not know `biz-add`, fell back to Home, and a platform admin has no Home, so it showed "You don't have access to Home". The form lower on the page worked. The same fault was fixed once for Admin's **Add a person** (AC-22.11) and had come back here; the **Skip to content** link had it too.

## What changes
- **Add a business** is now a button that scrolls to the form and puts the cursor in the business name box, without leaving Businesses.
- Any link to a place on the same page (like Skip to content, `#main`) now moves there and keeps the page, instead of being read as a page address.

## Spec impact
| Criterion | Change |
|---|---|
| AC-22.12 | Added |

## Architecture impact
None. Front end only.

## Verification
Two tests in `tests/us20-businesses.test.js` (the button, and Skip to content) failed before the fix and pass after it.
