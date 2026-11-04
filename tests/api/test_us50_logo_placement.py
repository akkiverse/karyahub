"""US-50 The logo, and where it goes on a bill; US-51 Pick the state by name (CR-0019), on the server."""

import base64
import io

import pytest
from conftest import line, put_doc
from PIL import Image
from pypdf import PdfReader
from pypdf.generic import ContentStream

MM = 72 / 25.4  # PDF points in a millimetre


def _logo(w=200, h=80):
    out = io.BytesIO()
    Image.new("RGB", (w, h), (200, 30, 30)).save(out, "PNG")
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()


def _images(raw: bytes) -> list[tuple[float, float, float, float]]:
    """Every picture on page 1 as (left, top, width, height) in mm, measured from the page's top left."""
    page = PdfReader(io.BytesIO(raw)).pages[0]
    page_h = float(page.mediabox.height)
    found, last = [], None
    for operands, op in ContentStream(page.get_contents(), page.pdf).operations:
        if op == b"cm":
            last = [float(x) for x in operands]
        elif op == b"Do" and last:
            w, _, _, h, x, y = last
            found.append(
                (round(x / MM, 1), round((page_h - y - h) / MM, 1), round(w / MM, 1), round(h / MM, 1))
            )
    return found


def _text_tops(raw: bytes) -> dict[str, float]:
    """The baseline (mm from the top) of each piece of text on page 1, by its first words."""
    page = PdfReader(io.BytesIO(raw)).pages[0]
    page_h = float(page.mediabox.height)
    found: dict[str, float] = {}

    def visit(text, cm, tm, font, size):
        if text.strip():
            found.setdefault(text.strip(), round((page_h - tm[5]) / MM, 1))

    page.extract_text(visitor_text=visit)
    return found


@pytest.fixture
def logo_bill(biller, make_client):
    """An owner with a wide logo (200 x 80 px) and one saved bill; returns (owner, public client, token)."""
    owner = biller()["owner"]
    assert owner.put("/api/v1/business/logo", json={"data_url": _logo()}).status_code == 200
    _, body = put_doc(
        owner, "b-1", save=True, lines=[line(qty=1, rate=10000)], customer={"name": "Mehta Clinic"}
    )
    return owner, make_client(signed_in=False), body["link_token"]


def _pdf(owner, public, token, **look):
    assert owner.put("/api/v1/business/bill-look", json=look).status_code == 200
    r = public.get(f"/b/{token}/pdf")
    assert r.status_code == 200
    return r.content


def test_ac_50_5_the_pdf_puts_the_logo_where_the_look_says(logo_bill):
    """AC-50.5: left, centre or right on A4, in its own proportions, with no text under it."""
    owner, public, token = logo_bill
    left = _pdf(owner, public, token, logo_position="left")
    centre = _pdf(owner, public, token, logo_position="center")
    right = _pdf(owner, public, token, logo_position="right")
    (lx, ly, lw, lh), (cx, cy, cw, ch), (rx, ry, rw, rh) = (
        _images(left)[0],
        _images(centre)[0],
        _images(right)[0],
    )
    assert (lx, ly) == (12.0, 12.0)  # against the left margin
    assert abs((cx + cw / 2) - 105) < 0.2  # the middle of the A4 page
    assert abs((rx + rw) - 198) < 0.2  # against the right margin
    for w, h in ((lw, lh), (cw, ch), (rw, rh)):
        assert h <= 14.01 and w <= 45.01 and abs(w / h - 200 / 80) < 0.02  # its own proportions
    # nothing is printed over the logo: the name block (left, centre) or the heading block (centre, right) starts below it
    name, heading = "Shree Cool AC", "Tax Invoice"
    assert (
        _text_tops(left)[name] > ly + lh and _text_tops(left)[heading] < ly + lh
    )  # heading is beside it, at the right
    assert _text_tops(centre)[name] > cy + ch and _text_tops(centre)[heading] > cy + ch
    assert (
        _text_tops(right)[name] < ry + rh and _text_tops(right)[heading] > ry + rh
    )  # name beside it, heading below
    assert max(len(left), len(centre), len(right)) < 300 * 1024


def test_ac_50_5_a_very_wide_or_tall_logo_is_kept_inside_its_box(logo_bill):
    """AC-50.5: at most 14 mm high and 45 mm wide, whatever the picture's shape."""
    owner, public, token = logo_bill
    for size, expect in (((400, 20), (45.0, 2.25)), ((50, 200), (3.5, 14.0))):
        assert owner.put("/api/v1/business/logo", json={"data_url": _logo(*size)}).status_code == 200
        w, h = _images(_pdf(owner, public, token, logo_position="left"))[0][2:]
        assert (w, h) == pytest.approx(expect, abs=0.05)


def test_ac_50_6_the_receipt_pdf_centres_the_logo_at_the_top(logo_bill):
    """AC-50.6: the 80 mm receipt used to leave the logo out; now it is centred, whatever the choice."""
    owner, public, token = logo_bill
    for choice in ("left", "right"):
        raw = _pdf(owner, public, token, layout="receipt_80", logo_position=choice)
        x, y, w, h = _images(raw)[0]
        assert abs((x + w / 2) - 40) < 0.2 and y < 6  # the middle of the 80 mm paper, at the top
        assert _text_tops(raw)["Shree Cool AC"] > y + h  # the name is under it


def test_ac_50_4_the_bill_page_puts_the_logo_where_the_look_says(logo_bill):
    """AC-50.4: left is above the name as it always was; centre is a row of its own; right is above the heading."""
    owner, public, token = logo_bill

    def page(**look):
        assert owner.put("/api/v1/business/bill-look", json=look).status_code == 200
        return public.get(f"/b/{token}").text

    left, centre, right = (
        page(logo_position="left"),
        page(logo_position="center"),
        page(logo_position="right"),
    )
    assert (
        left.count('class="logo"') == 1
        and 'class="logo-row"' not in left
        and 'class="logo-right"' not in left
    )
    assert '<header class="head"><div><img class="logo"' in left
    assert centre.count('class="logo"') == 1 and '<div class="logo-row"><img class="logo"' in centre
    assert centre.index('class="logo-row"') < centre.index('<header class="head">')
    assert right.count('class="logo"') == 1 and '<div class="logo-right"><img class="logo"' in right
    assert right.index('class="logo-right"') > right.index('<header class="head">')
    receipt = page(layout="receipt_80", logo_position="right")
    assert (
        '<div class="logo-row">' in receipt and 'class="logo-right"' not in receipt
    )  # the receipt always centres it


def test_ac_50_7_an_old_look_keeps_the_logo_top_left_and_a_bad_value_is_refused(logo_bill):
    """AC-50.7: no choice means left; anything but left, centre or right is a 422; the change is logged."""
    owner, public, token = logo_bill
    assert owner.get("/api/v1/auth/me").json()["business"]["bill_look"].get("logo_position", "left") == "left"
    assert '<header class="head"><div><img class="logo"' in public.get(f"/b/{token}").text
    for bad in ("middle", "", None, 3):
        r = owner.put("/api/v1/business/bill-look", json={"logo_position": bad})
        if bad is None:  # leaving it out keeps what is saved
            assert r.status_code == 200
        else:
            assert r.status_code == 422 and "where the logo goes" in r.json()["error"]["message"], bad
    assert owner.put("/api/v1/business/bill-look", json={"logo_position": "center"}).status_code == 200
    history = owner.get("/api/v1/history", params={"group": "settings"}).json()
    assert any("logo now goes at the top centre" in x["text"] for x in history["entries"])


def _brand_fills(raw: bytes) -> list[tuple[float, float]]:
    """(top, height) in mm of every rectangle painted in the brand colour (#0F766E) on page 1.

    PDF uses one instruction (rg) for fill and text colour, and a q ... Q pair scopes it, so both are tracked.
    """
    page = PdfReader(io.BytesIO(raw)).pages[0]
    page_h = float(page.mediabox.height)
    fill, saved, rect, found = None, [], None, []
    for operands, op in ContentStream(page.get_contents(), page.pdf).operations:
        if op == b"q":
            saved.append(fill)
        elif op == b"Q" and saved:
            fill = saved.pop()
        elif op == b"rg":
            fill = tuple(round(float(x) * 255) for x in operands)
        elif op == b"re":
            rect = [float(x) for x in operands]
        elif op in (b"f", b"B", b"b", b"f*", b"B*") and rect and fill == (15, 118, 110):
            _, y, _, h = rect  # fpdf2 writes some rectangles with a negative height
            low, high = min(y, y + h), max(y, y + h)
            found.append((round((page_h - high) / MM, 1), round((high - low) / MM, 1)))
    return found


def test_ac_30_4_a4_modern_pdf_paints_only_its_top_bar_in_the_brand_colour(logo_bill):
    """AC-30.4 (fixed, CR-0019): the A4 modern PDF's tables are not filled with the brand colour."""
    owner, public, token = logo_bill
    modern = _pdf(owner, public, token, layout="a4_modern", colour="#0F766E")
    assert _brand_fills(modern) == [(0.0, 4.0)]  # the thin bar at the top of the page, and nothing else
    classic = _pdf(owner, public, token, layout="a4_classic")
    assert _brand_fills(classic) == []


# ---------- US-51 ----------
def _new_business(platform, **fields):
    body = {"name": "Cool Breeze", "owner_name": "Ravi Kale", "owner_phone": "9822200002", **fields}
    return platform.post("/api/v1/platform/businesses", json=body)


def test_ac_51_2_the_server_sets_the_state_code_from_the_state_name(platform):
    """AC-51.2: Karnataka gives 29; the code is saved on the business."""
    r = _new_business(platform, state="Karnataka")
    assert r.status_code == 201, r.text
    assert r.json()["business"]["state_code"] == "29"
    listed = {b["name"]: b for b in platform.get("/api/v1/platform/businesses").json()["businesses"]}
    assert listed["Cool Breeze"]["state_code"] == "29"


def test_ac_51_3_a_state_that_is_not_on_the_list_is_refused(platform):
    """AC-51.3: 422 with a plain message, and no business is made."""
    before = len(platform.get("/api/v1/platform/businesses").json()["businesses"])
    r = _new_business(platform, state="Atlantis")
    assert r.status_code == 422 and r.json()["error"]["message"] == "Pick a state from the list."
    assert len(platform.get("/api/v1/platform/businesses").json()["businesses"]) == before


def test_ac_51_4_a_bare_code_still_works_when_listed_and_neither_means_maharashtra(platform):
    """AC-51.4: the older request keeps working; an unlisted code is refused; no state is 27."""
    assert _new_business(platform, state_code="07").json()["business"]["state_code"] == "07"
    assert _new_business(platform, state_code="99", owner_phone="9822200003").status_code == 422
    plain = _new_business(platform, owner_phone="9822200004")
    assert plain.status_code == 201 and plain.json()["business"]["state_code"] == "27"
    named = _new_business(platform, state="  tamil   NADU ", state_code="07", owner_phone="9822200005")
    assert named.json()["business"]["state_code"] == "33"  # the name wins, spelled loosely
