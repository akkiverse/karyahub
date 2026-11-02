# ADR-0016: One tax engine (Python truth, JavaScript copy, shared cases) and bill PDFs with fpdf2

- **Status:** Accepted
- **Date:** 2026-11-02
- **Change request:** CR-0012

## Context
Phase 1 "Bills that are right" makes real GST bills: line and bill discounts, six GST rates, CGST and SGST or IGST by place of supply, prices that include GST, Composition and Not registered, and a total rounded to the rupee. A bill is a legal paper, so the figures must be right to the paisa and the same everywhere: on the phone while typing (often with no signal), in what the server stores, on the public page and in the PDF. The PDF must be made inside a Vercel Python function (no system libraries) and must print ₹.

## Decision
1. **One engine, the server's.** `backend/karyahub/domain/tax.py` works out every figure and the server stores its own (AC-27.9). Money is whole paise. Quantities, percentages and rates are read as exact decimals and scaled to whole numbers (thousandths and hundredths), so every step is integer maths with one rounding rule, half up. A bill discount is spread over the lines in proportion, each share rounded down, the last line with an amount taking what is left.
2. **A line-for-line JavaScript copy** in `src/domain/tax.js` (BigInt maths) shows figures while typing and lets the demo save on the device.
3. **One shared file of cases**, `tests/fixtures/gst_cases.json` (36 cases plus GSTIN and words), is run by both test suites; the phone and the server must give identical figures. A change to GST maths starts by adding a case there.
4. **PDFs with fpdf2** (pure Python) and the bundled **Noto Sans** (SIL Open Font License, `backend/karyahub/fonts/OFL.txt`), subset into each PDF, so ₹ always prints and a bill is about 10 KB. The page and the PDF are drawn from one model of the printed words (`bill_render.model`). pypdf is used by tests only, to read the PDFs back.
5. **The public link** stores only the SHA-256 of a 192-bit token in `doc_links`, outside row-level security because it is read before the business is known; the bill itself is then read under that business's scope.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| Server only (the phone asks `/documents/totals` while typing) | One copy | No figures with no signal; a request per key press |
| Python `decimal` on the server and floats on the phone | Quick | Floats drift (0.1 + 0.2); figures could differ by a paisa between phone and server |
| **Scaled integers in both, one shared case file** | Exact on both sides; easy to prove the same | Two copies to keep in step (the shared cases catch any drift) |
| HTML-to-PDF in a headless browser | Same HTML as the page | Too heavy for a Vercel Python function; a paid service otherwise |
| ReportLab | Mature | Larger; fpdf2 is smaller and enough for three layouts |
| **fpdf2 + Noto Sans** | Pure Python, small, Unicode fonts, ₹ prints | Layouts drawn by hand; if layouts outgrow it, an HTML-to-PDF service is the next step |

## Consequences
- Every GST change needs a new shared case and passes both suites before it ships.
- The server never trusts the phone's figures; the phone's figures are only for display and the demo.
- Fonts add about 1.2 MB to the server bundle (well inside Vercel's limit); fpdf2 brings Pillow and fontTools.
- Documents from v0.7.0 keep the old 18 % maths (`domain/documents.py`) and are never worked out again.
