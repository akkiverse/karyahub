# CR-0020: A logo or signature with a drawn-in checkerboard is cleaned fully, and its size grows without extra space

- **Status:** In review
- **Requested by:** Founder, 7 Nov 2026, testing CR-0019 on the dev address: "the size bar increases the size but also the padding; I want only the image to grow. The transparent image works for the logo but not for the signature."
- **Date:** 2026-11-07
- **Kind:** Fix (patch, part of v0.11.1 with CR-0019)
- **Branch:** `cr/0020-picture-cleanup-fixes`
- **Issues:** US-57 (#100); milestone v0.11.1

## Why
The founder used one picture for both: a logo from an image generator with the grey-and-white "transparent" checkerboard drawn into its pixels. Run through the real cleaning code, it showed two defects (reproduced, not guessed):
1. **The empty margin was never trimmed, so the "padding" grew with the size bar.** The checkerboard's darker squares are blotchy: about 1,500 pixels a little darker than the cut-off for "background" survived all over the picture. The crop box takes every solid pixel, so it stayed the whole 1024 x 1024 picture while the logo itself was 834 x 278. The size bar scales that box, so the empty strip around the logo scaled with it. The page code adds no padding: the picture sits in its own box with a fixed 6 px below.
2. **The signature kept the checkerboard.** A signature is cleaned by the ink-on-paper rule (CR-0019, US-54) before anything else. For a drawn-in checkerboard the darker grey (about a fifth darker than the white) reads as faint ink, so the whole picture stayed faintly checked (about 6.3% of the pixels half see-through) and nothing was trimmed.

## What changes
- **A drawn-in checkerboard is removed with all its blotches.** When the picture's edge is a checkerboard, the background cut-off below its darker grey is wider (32 instead of 12), so the darker dips and washed-out patches count as background too. A plain white box keeps the old, tighter cut-off.
- **A signature or stamp on a drawn-in checkerboard uses the flat-background rule first**, the one made for it; the ink-on-paper rule stays first for everything else (photos and scans), so those are unchanged.
- **Specks cannot keep the empty margin.** The crop now looks at whole shapes, not single pixels: a shape that is at least 0.005% of the picture (24 px or more) is part of the picture; a smaller shape counts only when it is within 4% of the picture's size from those, so dots, thin letters and a tagline stay and specks far away are left out of the box. This protects any picture, whatever blotches its background leaves.
- Nothing changes on the server, in the saved look or in the PDFs: they already scale a picture inside its own box with a fixed gap (AC-55.4). A logo or signature added before this change keeps its old shape: choose the file again.

## Spec impact
| Criterion | Change |
|---|---|
| AC-57.1 to AC-57.5 (US-57) | Added |

## Architecture impact
None. Only `src/data/cleanup.js` (the browser-side cleaning) changes, plus tests.

## Tests
`tests/us57-checkerboard.test.js` (7): a made-up generator picture with two greys, soft joins, blotches and dips cleaned for the logo and the signature; the crop; specks alone; fine details kept; and the size bar changing only the picture's own style. Four fail on the CR-0019 code. Run on the real reported picture as described in the test report.

## Risks and limits
- A light, colourless part of a checkerboard logo that touches its edge-connected background is removed with it (by design, as in CR-0019); a coloured, dark or enclosed light part stays.
- A thin grey fringe can remain around the edge of letters where the picture blends into the grey: invisible on a white bill, faintly visible on the dark preview.
