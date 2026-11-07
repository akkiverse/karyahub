"""What a bill or estimate prints, and its public page and PDF (CR-0012, US-30, ADR-0016).

``model`` gathers every printed word once (AC-30.2); ``page_html`` and ``pdf_bytes`` only lay it out, in one
of three layouts: A4 classic, A4 modern (the business's colour as a thin accent) and an 80 mm receipt.
PDFs use the bundled Noto Sans (SIL Open Font License, ``fonts/OFL.txt``) so ₹ always prints (AC-30.4).
"""

import base64
import io
import logging
from html import escape
from pathlib import Path
from typing import Any

from fpdf import FPDF
from PIL import Image, ImageOps

from karyahub.data import bills
from karyahub.domain import tax

FONTS = Path(__file__).resolve().parent.parent / "fonts"
log = logging.getLogger(
    "karyahub.pictures"
)  # a picture that could not be used is logged, the bill is still made
COMPOSITION_LINE = "Composition taxable person, not eligible to collect tax on supplies"


def _pct(rate: str) -> str:
    return f"{rate}%"


def _logo_position(look: dict[str, Any]) -> str:
    """Where the logo goes (CR-0019). A business that never chose keeps it top left; the receipt centres it."""
    if look.get("layout") == "receipt_80":
        return "center"
    position = look.get("logo_position", "left")
    return position if position in ("left", "center", "right") else "left"


def _size(look: dict[str, Any], key: str) -> int:
    """A picture's size in percent of its usual size (CR-0019, US-55); 100 when never chosen or not sensible."""
    value = look.get(key, 100)
    if isinstance(value, bool) or not isinstance(value, int | float):
        return 100
    return round(value) if 50 <= value <= 200 else 100


def model(body: dict[str, Any], business_name: str, look: dict[str, Any]) -> dict[str, Any]:
    """Every word the bill prints, in order. Money stays in paise until it is shown."""
    seller = body.get("seller") or {}
    customer = body.get("customer") or {}
    mode = body.get("tax_mode", "none")
    taxed = mode in {"intra", "inter"}
    lines = body.get("lines") or []
    show_hsn = any(line.get("hsn") for line in lines)
    rows = []
    for i, line in enumerate(lines, start=1):
        tax_amount = int(line.get("cgst", 0)) + int(line.get("sgst", 0)) + int(line.get("igst", 0))
        rows.append(
            {
                "n": str(i),
                "description": line.get("description", ""),
                "hsn": line.get("hsn", ""),
                "qty": str(line.get("qty", "")),
                "unit": line.get("unit", ""),
                "rate": bills.rupees_text(int(line.get("rate") or 0), exact=True)
                + (" incl. GST" if line.get("price_includes_gst") and taxed else ""),
                "discount": bills.rupees_text(
                    int(line.get("line_discount", 0)) + int(line.get("bill_discount", 0)), exact=True
                )
                if (line.get("line_discount") or line.get("bill_discount"))
                else "",
                "taxable": bills.rupees_text(int(line.get("taxable", 0)), exact=True),
                "gst_rate": _pct(str(line.get("gst_rate", "0"))) if taxed else "",
                "tax": bills.rupees_text(tax_amount, exact=True) if taxed else "",
            }
        )
    totals = body.get("totals") or {"taxable": 0, "cgst": 0, "sgst": 0, "igst": 0, "round_off": 0, "total": 0}
    total_rows: list[tuple[str, str]] = [
        ("Taxable value" if taxed else "Amount", bills.rupees_text(totals["taxable"], exact=True))
    ]
    if mode == "intra":
        total_rows += [
            ("CGST", bills.rupees_text(totals["cgst"], exact=True)),
            ("SGST", bills.rupees_text(totals["sgst"], exact=True)),
        ]
    elif mode == "inter":
        total_rows.append(("IGST", bills.rupees_text(totals["igst"], exact=True)))
    if totals.get("round_off"):
        total_rows.append(("Round off", bills.rupees_text(totals["round_off"], exact=True)))
    summary = [
        {
            "rate": _pct(row["gst_rate"]),
            "taxable": bills.rupees_text(row["taxable"], exact=True),
            "cgst": bills.rupees_text(row["cgst"], exact=True),
            "sgst": bills.rupees_text(row["sgst"], exact=True),
            "igst": bills.rupees_text(row["igst"], exact=True),
        }
        for row in body.get("summary") or []
    ]
    bank = look.get("bank") or {}
    is_bill = body.get("type") == "invoice"
    dates = [("Date", bills.pretty_date(body.get("date", "")))]
    if is_bill and body.get("due_date"):
        due = body["due_date"]
        dates.append(("Due", "on receipt" if due == body.get("date") else bills.pretty_date(due)))
    if not is_bill and body.get("valid_until"):
        dates.append(("Valid until", bills.pretty_date(body["valid_until"])))
    place = body.get("place_of_supply", "")
    return {
        "heading": bills.heading(body),
        "number": body.get("number", ""),
        "dates": dates,
        "seller": {
            "name": seller.get("name") or business_name,
            "address": seller.get("address", ""),
            "gstin": seller.get("gstin", "") if seller.get("registration") != "unregistered" else "",
            "phone": seller.get("phone", ""),
        },
        "composition": seller.get("registration") == "composition",
        "customer": {
            "name": customer.get("name", bills.WALK_IN),
            "address": customer.get("address", ""),
            "phone": customer.get("phone", ""),
            "gstin": customer.get("gstin", ""),
        },
        "place": tax.state_label(place) if taxed and place else "",
        "taxed": taxed,
        "mode": mode,
        "show_hsn": show_hsn,
        "rows": rows,
        "summary": summary if taxed else [],
        "total_rows": total_rows,
        "total": bills.rupees_text(totals["total"]),
        "in_words": totals.get("in_words") or tax.rupees_in_words(totals["total"] // 100),
        "bank": bank if bank.get("account_number") else {},
        "upi_id": look.get("upi_id", "") if is_bill else "",
        "terms": body.get("terms") or look.get("terms", ""),
        "notes": body.get("notes", ""),
        "cancelled": body.get("status") == "cancelled",
        "paid": body.get("status") == "paid",
        "layout": look.get("layout", "a4_classic"),
        "logo_position": _logo_position(look),
        "logo_size": _size(look, "logo_size"),
        "signature_size": _size(look, "signature_size"),
        "colour": look.get("colour", "#0F766E"),
    }


# ---------- the public page ----------
PAGE_CSS = """
:root{--ink:#14201f;--muted:#5b6b69;--line:#d9e2e0;--paper:#fff;--bg:#eef3f2;--accent:ACCENT}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Noto Sans",system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:16px}
.bar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:12px}
.btn{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 18px;border-radius:10px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
.btn:focus-visible{outline:3px solid #14201f;outline-offset:2px}
.paper{position:relative;background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:20px;overflow:hidden}
.layout-a4_modern .paper{border-top:6px solid var(--accent)}
.layout-receipt_80 main{max-width:380px}
.head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);padding-bottom:12px}
h1{margin:0;font-size:22px}.layout-a4_modern h1{color:var(--accent)}
.muted{color:var(--muted)}p{margin:2px 0}
.to{margin:14px 0}
.table{width:100%;overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:12px;color:var(--muted);font-weight:600}.num{text-align:right;white-space:nowrap}
.totals{margin-left:auto;max-width:320px;margin-top:12px}.totals div{display:flex;justify-content:space-between;padding:3px 0}
.grand{font-size:20px;font-weight:700;border-top:2px solid var(--ink);margin-top:4px;padding-top:6px}
.words{margin-top:8px;font-style:italic}.foot{display:grid;gap:12px;margin-top:16px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.sign{text-align:right}.sign img{max-height:60px}
.stamp{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.stamp span{transform:rotate(-24deg);font-size:64px;font-weight:800;letter-spacing:6px;color:rgba(185,28,28,.35);border:6px solid rgba(185,28,28,.35);padding:4px 18px;border-radius:12px}
.logo{max-height:56px;max-width:160px}.notice{text-align:center;margin-top:40px}
.logo-row{display:flex;justify-content:center;margin-bottom:10px}.logo-right{display:flex;justify-content:flex-end;margin-bottom:6px}
@media print{body{background:#fff}.bar{display:none}.paper{border:0}}
"""


def _doc(title: str, body_html: str, accent: str = "#0F766E", layout: str = "a4_classic") -> str:
    css = PAGE_CSS.replace("ACCENT", accent)
    return (
        '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer">'
        f'<meta name="theme-color" content="{escape(accent)}"><title>{escape(title)}</title>'
        f'<style>{css}</style></head><body class="layout-{escape(layout)}"><main>{body_html}</main></body></html>'
    )


def notice_page(text: str) -> str:
    """ "This bill link isn't valid." or "turned off": nothing says whether a bill exists (AC-30.3)."""
    return _doc("KaryaHub bill", f'<p class="notice" role="status">{escape(text, quote=False)}</p>')


def _data_url(image: tuple[str, bytes] | None) -> str:
    if not image:
        return ""
    return f"data:{image[0]};base64,{base64.b64encode(image[1]).decode()}"


def page_html(
    m: dict[str, Any], pdf_href: str, logo: tuple[str, bytes] | None, signature: tuple[str, bytes] | None
) -> str:
    def e(text: str) -> str:  # text and attributes here never hold a quote mark that matters
        return escape(text, quote=False).replace('"', "&quot;")

    s, c = m["seller"], m["customer"]
    ls, ss = (
        m["logo_size"] / 100,
        m["signature_size"] / 100,
    )  # the picture grows; the space around it does not
    logo = prepare_image(
        logo, round(480 * ls), round(168 * ls), what="logo"
    )  # drawn at most 160 by 56 px, x3
    signature = prepare_image(signature, round(480 * ss), round(180 * ss), what="signature")
    logo_style = f"max-width:{round(160 * ls)}px;max-height:{round(56 * ls)}px"
    logo_img = f'<img class="logo" alt="" style="{logo_style}" src="{_data_url(logo)}">' if logo else ""
    logo_at = m["logo_position"]
    logo_html = logo_img if logo_at == "left" else ""  # left: above the name, as it always was
    logo_row = f'<div class="logo-row">{logo_img}</div>' if logo and logo_at == "center" else ""
    logo_meta = f'<div class="logo-right">{logo_img}</div>' if logo and logo_at == "right" else ""
    cols = (
        ["#", "Item"]
        + (["HSN/SAC"] if m["show_hsn"] else [])
        + ["Qty", "Unit", "Rate", "Discount", "Taxable value" if m["taxed"] else "Amount"]
    )
    if m["taxed"]:
        cols += ["GST", "IGST" if m["mode"] == "inter" else "CGST + SGST"]
    num_cols = {"Qty", "Rate", "Discount", "Taxable value", "Amount", "GST", "IGST", "CGST + SGST"}
    head = "".join(
        f'<th scope="col" class="{"num" if col in num_cols else ""}">{e(col)}</th>' for col in cols
    )
    body_rows = []
    for r in m["rows"]:
        cells = (
            [r["n"], r["description"]]
            + ([r["hsn"]] if m["show_hsn"] else [])
            + [r["qty"], r["unit"], r["rate"], r["discount"], r["taxable"]]
        )
        if m["taxed"]:
            cells += [r["gst_rate"], r["tax"]]
        body_rows.append(
            "<tr>"
            + "".join(
                f'<td class="{"num" if col in num_cols else ""}">{e(v)}</td>'
                for col, v in zip(cols, cells, strict=True)
            )
            + "</tr>"
        )
    summary = ""
    if m["summary"]:
        tax_heads = (
            '<th class="num">IGST</th>'
            if m["mode"] == "inter"
            else '<th class="num">CGST</th><th class="num">SGST</th>'
        )
        srows = "".join(
            f'<tr><td>{e(r["rate"])}</td><td class="num">{e(r["taxable"])}</td>'
            + (
                f'<td class="num">{e(r["igst"])}</td>'
                if m["mode"] == "inter"
                else f'<td class="num">{e(r["cgst"])}</td><td class="num">{e(r["sgst"])}</td>'
            )
            + "</tr>"
            for r in m["summary"]
        )
        summary = f'<div class="table"><table aria-label="Tax summary"><thead><tr><th>GST rate</th><th class="num">Taxable value</th>{tax_heads}</tr></thead><tbody>{srows}</tbody></table></div>'
    totals = "".join(f"<div><span>{e(k)}</span><span>{e(v)}</span></div>" for k, v in m["total_rows"])
    bank = m["bank"]
    pay = ""
    if bank or m["upi_id"]:
        pay = "<div><p><strong>Pay to</strong></p>"
        if bank:
            pay += f"<p>{e(bank.get('account_name', ''))}</p><p>A/c {e(bank.get('account_number', ''))} · IFSC {e(bank.get('ifsc', ''))}</p>"
        if m["upi_id"]:
            pay += f"<p>UPI {e(m['upi_id'])}</p>"
        pay += "</div>"
    terms = f"<div><p><strong>Terms</strong></p><p>{e(m['terms'])}</p></div>" if m["terms"] else ""
    sign_style = f"max-height:{round(60 * ss)}px;max-width:100%"
    sign = f'<img alt="Signature" style="{sign_style}" src="{_data_url(signature)}">' if signature else ""
    dates = "".join(f'<p><span class="muted">{e(k)}</span> {e(v)}</p>' for k, v in m["dates"])
    stamp = '<div class="stamp" aria-hidden="true"><span>CANCELLED</span></div>' if m["cancelled"] else ""
    paper = f"""
<div class="bar"><span class="muted">{e(m["heading"])} {e(m["number"])} from {e(s["name"])}</span>
<a class="btn" href="{e(pdf_href)}" download>Download PDF</a></div>
<article class="paper" aria-label="{e(m["heading"])} {e(m["number"])}">{stamp}
{'<p role="status"><strong>This bill is cancelled.</strong></p>' if m["cancelled"] else ""}
{logo_row}<header class="head"><div>{logo_html}<p><strong>{e(s["name"])}</strong></p><p class="muted">{e(s["address"])}</p>
{f"<p>GSTIN {e(s['gstin'])}</p>" if s["gstin"] else ""}{f'<p class="muted">{e(s["phone"])}</p>' if s["phone"] else ""}</div>
<div>{logo_meta}<h1>{e(m["heading"])}</h1><p><strong>{e(m["number"])}</strong></p>{dates}</div></header>
{f'<p class="muted">{COMPOSITION_LINE}</p>' if m["composition"] else ""}
<section class="to"><p class="muted">Bill to</p><p><strong>{e(c["name"])}</strong></p>
{f"<p>{e(c['address'])}</p>" if c["address"] else ""}{f"<p>GSTIN {e(c['gstin'])}</p>" if c["gstin"] else ""}
{f"<p>Place of supply: {e(m['place'])}</p>" if m["place"] else ""}</section>
<div class="table"><table aria-label="Lines"><thead><tr>{head}</tr></thead><tbody>{"".join(body_rows)}</tbody></table></div>
{summary}
<div class="totals">{totals}<div class="grand"><span>Total</span><span>{e(m["total"])}</span></div></div>
<p class="words">{e(m["in_words"])}</p>
{f"<p>{e(m['notes'])}</p>" if m["notes"] else ""}
<div class="foot">{pay}{terms}<div class="sign">{sign}<p>{"For " + e(s["name"])}</p><p class="muted">Authorised signatory</p></div></div>
</article>"""
    return _doc(f"{m['heading']} {m['number']} from {s['name']}", paper, m["colour"], m["layout"])


# ---------- the PDF ----------
def _rgb(hex_colour: str) -> tuple[int, int, int]:
    h = hex_colour.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


class _Pdf(FPDF):
    def __init__(self, **kw: Any) -> None:
        super().__init__(**kw)
        self.add_font("Noto", "", str(FONTS / "NotoSans-Regular.ttf"))
        self.add_font("Noto", "B", str(FONTS / "NotoSans-Bold.ttf"))
        self.set_font("Noto", size=9)
        self.c_margin = 1


PRINT_DPI = (
    300  # a picture is printed at this resolution for the size it is drawn at, no more (CR-0019, US-52)
)
PDF_PICTURE_BYTES = 150 * 1024  # above this a picture is simplified, so the whole PDF stays small


def prepare_image(
    image: tuple[str, bytes] | None, max_w_px: int, max_h_px: int, *, what: str = "picture"
) -> tuple[str, bytes] | None:
    """The picture ready to print or show: PNG or JPEG, at most ``max_w_px`` by ``max_h_px`` (never scaled up).

    A transparent picture stays transparent (PNG); WebP and anything else Pillow reads becomes PNG or JPEG, which
    the PDF library can embed; a photo's rotation is applied. None when the picture can't be read.
    """
    if not image:
        return None
    try:
        with Image.open(io.BytesIO(image[1])) as source:
            picture = ImageOps.exif_transpose(source)
            alpha = picture.mode in ("RGBA", "LA", "PA") or "transparency" in picture.info
            picture = picture.convert("RGBA" if alpha else "RGB")
        scale = min(1.0, max_w_px / picture.width, max_h_px / picture.height)
        if scale < 1.0:
            picture = picture.resize(
                (max(1, round(picture.width * scale)), max(1, round(picture.height * scale))), Image.LANCZOS
            )
        out = io.BytesIO()
        picture.save(out, "PNG", optimize=True)
        if len(out.getvalue()) > PDF_PICTURE_BYTES:
            out = io.BytesIO()
            if alpha:  # keep the transparency, with fewer colours
                picture.quantize(256, method=Image.Quantize.FASTOCTREE).save(out, "PNG", optimize=True)
            else:
                picture.save(out, "JPEG", quality=90, optimize=True)
                return "image/jpeg", out.getvalue()
        return "image/png", out.getvalue()
    except Exception as exc:  # the bill is made without it, and the reason is in the logs (US-56)
        log.warning(
            "picture left out of the bill: kind=%s reason=prepare-failed error=%s mime=%s bytes=%s",
            what,
            type(exc).__name__,
            image[0],
            len(image[1]),
        )
        return None


def _mm_px(mm: float) -> int:
    return round(mm / 25.4 * PRINT_DPI)


def _image(
    pdf: FPDF,
    image: tuple[str, bytes] | None,
    x: float,
    y: float,
    h: float,
    w: float = 0,
    *,
    what: str = "picture",
) -> None:
    if image:
        try:
            pdf.image(io.BytesIO(image[1]), x=x, y=y, h=h, **({"w": w} if w else {}))
        except Exception as exc:  # a picture fpdf2 can't read is left out rather than losing the bill
            log.warning(
                "picture left out of the PDF: kind=%s reason=draw-failed error=%s mime=%s bytes=%s",
                what,
                type(exc).__name__,
                image[0],
                len(image[1]),
            )


def logo_size(
    image: tuple[str, bytes] | None, max_h: float, max_w: float, *, what: str = "picture"
) -> tuple[float, float] | None:
    """The logo's width and height in mm: its own proportions, at most ``max_h`` high and ``max_w`` wide (CR-0019).

    None when there is no logo or the picture can't be read, so the bill is made without it.
    """
    if not image:
        return None
    try:
        with Image.open(io.BytesIO(image[1])) as picture:
            px_w, px_h = picture.size
    except Exception as exc:
        log.warning(
            "picture left out of the PDF: kind=%s reason=unreadable error=%s", what, type(exc).__name__
        )
        return None
    if px_w <= 0 or px_h <= 0:
        log.warning("picture left out of the PDF: kind=%s reason=no-size", what)
        return None
    scale = min(max_h / px_h, max_w / px_w)
    return round(px_w * scale, 2), round(px_h * scale, 2)


def logo_place(
    position: str, w: float, h: float, *, left: float, right: float, top: float, page_w: float
) -> tuple[float, float]:
    """Where the logo's top-left corner goes: against the left margin, centred on the page, or against the right."""
    if position == "right":
        return right - w, top
    if position == "center":
        return (page_w - w) / 2, top
    return left, top


def _cancelled_stamp(pdf: FPDF, w: float, h: float) -> None:
    pdf.set_text_color(200, 60, 60)
    pdf.set_font("Noto", "B", 44 if w > 100 else 22)
    with pdf.rotation(24, x=w / 2, y=h / 2):
        pdf.set_xy(0, h / 2 - 10)
        pdf.cell(w, 20, "CANCELLED", align="C")
    pdf.set_text_color(20, 32, 31)
    pdf.set_font("Noto", size=9)


def pdf_bytes(
    m: dict[str, Any], logo: tuple[str, bytes] | None, signature: tuple[str, bytes] | None
) -> bytes:
    ls, ss = m["logo_size"] / 100, m["signature_size"] / 100
    logo = prepare_image(logo, _mm_px(45 * ls), _mm_px(14 * ls), what="logo")
    signature = prepare_image(signature, _mm_px(40 * ss), _mm_px(14 * ss), what="signature")
    if m["layout"] == "receipt_80":
        return _receipt(m, logo, signature)
    pdf = _Pdf(format="A4")
    pdf.set_auto_page_break(True, margin=15)
    pdf.set_margins(12, 12, 12)
    pdf.add_page()
    accent = _rgb(m["colour"]) if m["layout"] == "a4_modern" else (20, 32, 31)
    if m["layout"] == "a4_modern":
        pdf.set_fill_color(*accent)
        pdf.rect(0, 0, 210, 4, style="F")
        pdf.set_fill_color(
            255, 255, 255
        )  # the bar's colour must not stay the fill: tables would be painted with it
    s, c = m["seller"], m["customer"]
    top = pdf.get_y()
    left_top = right_top = top  # where the name block and the heading block start
    box = logo_size(logo, 14 * ls, 45 * ls, what="logo")
    if box:
        w, h = box
        x, y = logo_place(m["logo_position"], w, h, left=12, right=198, top=top, page_w=210)
        _image(pdf, logo, x, y, h, w, what="logo")
        below = top + h + 2
        if m["logo_position"] == "left":  # above the name, as it always was
            left_top = below
        elif m["logo_position"] == "center":  # a row of its own: both blocks start under it
            left_top = right_top = below
        else:  # right: above the bill heading
            right_top = below
    pdf.set_y(left_top)
    pdf.set_font("Noto", "B", 13)
    pdf.cell(110, 6, s["name"], new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Noto", size=9)
    for text in (s["address"], f"GSTIN {s['gstin']}" if s["gstin"] else "", s["phone"]):
        if text:
            pdf.multi_cell(110, 4.5, text, new_x="LMARGIN", new_y="NEXT")
    left_end = pdf.get_y()
    pdf.set_xy(130, right_top)
    pdf.set_text_color(*accent)
    pdf.set_font("Noto", "B", 16)
    pdf.cell(68, 8, m["heading"], align="R", new_x="LEFT", new_y="NEXT")
    pdf.set_text_color(20, 32, 31)
    pdf.set_font("Noto", "B", 10)
    pdf.set_x(130)
    pdf.cell(68, 5, m["number"], align="R", new_x="LEFT", new_y="NEXT")
    pdf.set_font("Noto", size=9)
    for k, v in m["dates"]:
        pdf.set_x(130)
        pdf.cell(68, 4.5, f"{k} {v}", align="R", new_x="LEFT", new_y="NEXT")
    pdf.set_y(max(left_end, pdf.get_y()) + 3)
    if m["composition"]:
        pdf.multi_cell(0, 4.5, COMPOSITION_LINE, new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(217, 226, 224)
    pdf.line(12, pdf.get_y(), 198, pdf.get_y())
    pdf.ln(2)
    pdf.set_font("Noto", "B", 9)
    pdf.cell(0, 5, "Bill to", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Noto", size=9)
    for text in (
        c["name"],
        c["address"],
        f"GSTIN {c['gstin']}" if c["gstin"] else "",
        f"Place of supply: {m['place']}" if m["place"] else "",
    ):
        if text:
            pdf.multi_cell(0, 4.5, text, new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    cols: list[tuple[str, str, float, str]] = [("#", "n", 7, "L"), ("Item", "description", 0, "L")]
    if m["show_hsn"]:
        cols.append(("HSN/SAC", "hsn", 16, "L"))
    cols += [
        ("Qty", "qty", 12, "R"),
        ("Unit", "unit", 11, "L"),
        ("Rate", "rate", 22, "R"),
        ("Disc.", "discount", 17, "R"),
    ]
    cols.append(("Taxable" if m["taxed"] else "Amount", "taxable", 22, "R"))
    if m["taxed"]:
        cols += [
            ("GST", "gst_rate", 10, "R"),
            ("IGST" if m["mode"] == "inter" else "CGST+SGST", "tax", 21, "R"),
        ]
    fixed = sum(w for _, _, w, _ in cols)
    cols = [(h, k, w or 186 - fixed, a) for h, k, w, a in cols]
    with pdf.table(
        col_widths=[w for _, _, w, _ in cols],
        text_align=tuple(a for _, _, _, a in cols),
        line_height=4.6,
        borders_layout="HORIZONTAL_LINES",
        headings_style=_headings(accent),
        first_row_as_headings=True,
    ) as table:
        table.row([h for h, _, _, _ in cols])
        for r in m["rows"]:
            table.row([r[k] for _, k, _, _ in cols])
    pdf.ln(2)
    if m["summary"]:
        heads = ["GST rate", "Taxable value"] + (["IGST"] if m["mode"] == "inter" else ["CGST", "SGST"])
        with pdf.table(
            width=110,
            align="LEFT",
            line_height=4.6,
            text_align=("LEFT", "RIGHT", "RIGHT", "RIGHT")[: len(heads)],
            borders_layout="HORIZONTAL_LINES",
            headings_style=_headings(accent),
        ) as table:
            table.row(heads)
            for r in m["summary"]:
                table.row(
                    [r["rate"], r["taxable"]]
                    + ([r["igst"]] if m["mode"] == "inter" else [r["cgst"], r["sgst"]])
                )
        pdf.ln(2)
    for k, v in m["total_rows"]:
        pdf.set_x(130)
        pdf.cell(40, 5, k)
        pdf.cell(28, 5, v, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_x(130)
    pdf.set_font("Noto", "B", 12)
    pdf.cell(40, 8, "Total", border="T")
    pdf.cell(28, 8, m["total"], align="R", border="T", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Noto", size=9)
    pdf.multi_cell(0, 5, m["in_words"], new_x="LMARGIN", new_y="NEXT")
    if m["notes"]:
        pdf.multi_cell(0, 4.5, m["notes"], new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)
    y = pdf.get_y()
    if m["bank"] or m["upi_id"]:
        pdf.set_font("Noto", "B", 9)
        pdf.cell(90, 5, "Pay to", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Noto", size=9)
        b = m["bank"]
        for text in (
            b.get("account_name", "") if b else "",
            f"A/c {b['account_number']} · IFSC {b.get('ifsc', '')}" if b else "",
            f"UPI {m['upi_id']}" if m["upi_id"] else "",
        ):
            if text:
                pdf.cell(90, 4.5, text, new_x="LMARGIN", new_y="NEXT")
    if m["terms"]:
        pdf.set_font("Noto", "B", 9)
        pdf.cell(90, 5, "Terms", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Noto", size=9)
        pdf.multi_cell(100, 4.5, m["terms"], new_x="LMARGIN", new_y="NEXT")
    sign_box = logo_size(signature, 14 * ss, 40 * ss, what="signature")
    need = (sign_box[1] + 2 if sign_box else 16) + 10  # the picture, then the two lines under it
    if y + need > 297 - 15:  # a bigger signature must not run off the page: it starts the next one
        pdf.add_page()
        y = pdf.get_y()
    if sign_box:
        _image(pdf, signature, 198 - sign_box[0], y, sign_box[1], sign_box[0], what="signature")
    pdf.set_xy(120, y + (sign_box[1] + 2 if sign_box else 16))
    pdf.cell(78, 5, f"For {s['name']}", align="R", new_x="LEFT", new_y="NEXT")
    pdf.set_x(120)
    pdf.cell(78, 5, "Authorised signatory", align="R")
    if m["cancelled"]:
        _cancelled_stamp(pdf, 210, 297)
    return bytes(pdf.output())


def _headings(accent: tuple[int, int, int]) -> Any:
    from fpdf.fonts import FontFace

    return FontFace(emphasis="BOLD", color=accent)


def _receipt(m: dict[str, Any], logo: tuple[str, bytes] | None, signature: tuple[str, bytes] | None) -> bytes:
    ls, ss = m["logo_size"] / 100, m["signature_size"] / 100
    box = logo_size(logo, 12 * ls, min(40 * ls, 72), what="logo")  # 72 mm is the receipt's whole column
    sign_box = logo_size(signature, 10 * ss, min(30 * ss, 72), what="signature")
    height = (
        120
        + 9 * len(m["rows"])
        + 5 * len(m["total_rows"])
        + 5 * len(m["summary"])
        + (box[1] + 3 if box else 0)
        + (
            max(0.0, sign_box[1] - 10) if sign_box else 0
        )  # the 120 above already makes room for a usual signature
    )
    pdf = _Pdf(format=(80, height))
    pdf.set_auto_page_break(False)
    pdf.set_margins(4, 4, 4)
    pdf.add_page()
    s, c = m["seller"], m["customer"]
    w = 72

    def line(text: str, *, bold: bool = False, size: float = 8, align: str = "C") -> None:
        if text:
            pdf.set_font("Noto", "B" if bold else "", size)
            pdf.multi_cell(w, 3.8, text, align=align, new_x="LMARGIN", new_y="NEXT")

    if box:  # the receipt's column is centred, so is the logo (CR-0019: it was left out of this PDF before)
        x, y = logo_place("center", box[0], box[1], left=4, right=76, top=pdf.get_y(), page_w=80)
        _image(pdf, logo, x, y, box[1], box[0], what="logo")
        pdf.set_y(y + box[1] + 2)
    line(s["name"], bold=True, size=10)
    line(s["address"])
    line(f"GSTIN {s['gstin']}" if s["gstin"] else "")
    line(s["phone"])
    line(m["heading"], bold=True, size=9)
    if m["composition"]:
        line(COMPOSITION_LINE, size=7)
    line(m["number"] + "  " + "  ".join(f"{k} {v}" for k, v in m["dates"]))
    line(c["name"] + (f"  GSTIN {c['gstin']}" if c["gstin"] else ""))
    line(f"Place of supply: {m['place']}" if m["place"] else "")
    pdf.ln(1)
    pdf.line(4, pdf.get_y(), 76, pdf.get_y())
    for r in m["rows"]:
        line(r["description"] + (f"  HSN {r['hsn']}" if r["hsn"] else ""), align="L")
        pdf.set_font("Noto", size=8)
        detail = f"{r['qty']} {r['unit']} × {r['rate']}" + (
            f"  less {r['discount']}" if r["discount"] else ""
        )
        if m["taxed"]:
            detail += f"  GST {r['gst_rate']}"
        pdf.cell(48, 4, detail)
        pdf.cell(24, 4, r["taxable"], align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.line(4, pdf.get_y(), 76, pdf.get_y())
    for r in m["summary"]:
        pdf.set_font("Noto", size=7)
        taxes = f"IGST {r['igst']}" if m["mode"] == "inter" else f"CGST {r['cgst']}  SGST {r['sgst']}"
        pdf.cell(w, 3.6, f"{r['rate']} on {r['taxable']}: {taxes}", new_x="LMARGIN", new_y="NEXT")
    for k, v in m["total_rows"]:
        pdf.set_font("Noto", size=8)
        pdf.cell(48, 4, k)
        pdf.cell(24, 4, v, align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Noto", "B", 11)
    pdf.cell(40, 7, "Total")
    pdf.cell(32, 7, m["total"], align="R", new_x="LMARGIN", new_y="NEXT")
    line(m["in_words"], size=7)
    line(f"UPI {m['upi_id']}" if m["upi_id"] else "")
    line(m["terms"], size=7)
    if sign_box:
        _image(
            pdf,
            signature,
            (80 - sign_box[0]) / 2,
            pdf.get_y() + 1,
            sign_box[1],
            sign_box[0],
            what="signature",
        )
        pdf.ln(sign_box[1] + 2)
    line("Authorised signatory", size=7)
    if m["cancelled"]:
        _cancelled_stamp(pdf, 80, height)
    return bytes(pdf.output())
