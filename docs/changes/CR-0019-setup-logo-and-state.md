# CR-0019: The logo beside the signature, with its place on the bill; the state picked by name

- **Status:** In review
- **Requested by:** Founder, 4 Nov 2026: "In Settings, where the owner updates business details, I see Signature is given; add a logo option too, ask where to place it, and place it in the PDF correctly." And: "While registering a business State Code is asked, though the admin gets a state list only; the code should be set in the backend."
- **Date:** 2026-11-04
- **Kind:** Improvement (patch version, like CR-0006 to CR-0008)
- **Release:** v0.11.1 (after merge)
- **Branch:** `cr/0019-setup-logo-and-state`
- **Pull request:** see the pull request that closes issues 90, 91 and 92
- **Issues:** US-50 (#90), US-51 (#91), US-52 (#94), and the bug found on the way, A4 modern PDF (#92); milestone v0.11.1

## Why
- The logo could be added, but only under Business details, away from the bill look and its preview, so the founder looking next to the Signature did not find it. It also always sat top left above the business name, and the 80 mm receipt PDF left it out.
- Adding a business asked the platform admin to type a two-digit GST state code, though the server only checked for two digits. People know states by name.
- While checking the PDFs, the A4 modern layout was found to paint its item table solid in the brand colour (already so in v0.11.0).

## What changes
- **A transparent, sharp logo and signature (US-52, founder, 5 Nov 2026).** Any PNG, JPEG or WebP up to 10 MB can be chosen for the logo and the signature or stamp (the signature was refused above 300 KB, the logo was shrunk to 256 px and, above 200 KB, saved as a JPEG, which turned a transparent background into a solid box). The browser scales to at most 800 px with smoothing and keeps a see-through picture a PNG; the server accepts up to 1 MB as stored and checks it is a real picture; the PDF prints each picture at 300 dpi for its size (WebP is converted, it used to be silently left out); a wide signature stays inside the margins.
- **Logo in Bill look**, beside the Signature, with add, replace and remove. Once there is a logo, Bill look asks **where it goes**: top left (above the name), top centre or top right (above the bill heading). The live paper preview moves it. Adding a logo no longer wipes unsaved edits in the form.
- **Where it shows:** the bill page, the public link and the PDF follow the choice. The PDF keeps the logo's own proportions inside a 14 mm by 45 mm box and prints nothing over it. On A4 modern the screen shows the logo on a white chip. The 80 mm receipt always centres it, and its PDF now has the logo.
- **Existing businesses keep top left**, so no bill changes on release.
- **Add a business** asks for the **State by name** (a list, Maharashtra first). The server sets the code (`POST /api/v1/platform/businesses` takes `state`; a bare `state_code` still works if it is on the list, and an unlisted name or code is refused).
- **Fixed:** the A4 modern PDF no longer paints its tables in the brand colour.
- The logo block moved out of Business details (AC-23.11 is updated).

## Spec impact
| Criterion | Change |
|---|---|
| AC-50.1 to AC-50.8 (US-50) | Added |
| AC-51.1 to AC-51.4 (US-51) | Added |
| AC-23.11 | Changed (the logo's place) |

## Architecture impact
No database change: the stored picture limit rises from 200 KB (logo) and 300 KB (signature) to 1 MB, and `logo_position` is one more key in the business's saved bill look (default left). Pillow, already installed for fpdf2, is now a declared dependency (it checks pictures, reads sizes and prepares them for the PDF and the page).

## Verification
Server tests `tests/api/test_us50_logo_placement.py` (14) measure the logo's position inside the generated PDFs, check the page markup, the 422s, the history line and the state lookup; UI tests `tests/us50-logo-placement.test.js` (18) cover the screens. The A4 modern fix test fails without the one-line fix (26 extra brand-coloured rectangles) and passes with it. A visual check of all six A4 variants, the receipt PDF and the on-screen preview was done in a real browser and a PDF renderer; the resizer was run in real Chromium on a 3200 x 1600 transparent PNG (it came out as an 800 x 400 PNG with its see-through corner intact) and on a large photo, and a transparent stamp was checked in the PDF as both logo and signature (33 KB).

## Notes
- Not changed, noticed on the way: the "HSN/SAC" column heading wraps to two lines in the PDF, and the small receipt's table is clipped at the right edge on screen. Both were already so; they are left for a later change.
- Possible later: a logo size choice (small, medium, large).
