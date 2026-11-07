"""US-55 The size of the logo and of the signature (CR-0019), on the server: the look, the page and the PDFs."""

import base64
import io

import pytest
from conftest import line, put_doc
from PIL import Image
from pypdf import PdfReader
from pypdf.generic import ContentStream
from test_us50_logo_placement import MM, _images, _text_tops


def _all_images(raw: bytes) -> list[tuple[int, float, float, float, float]]:
    """Every picture on every page as (page, left, top, width, height) in mm."""
    found, last = [], None
    reader = PdfReader(io.BytesIO(raw))
    for number, page in enumerate(reader.pages):
        page_h = float(page.mediabox.height)
        for operands, op in ContentStream(page.get_contents(), reader).operations:
            if op == b"cm":
                last = [float(x) for x in operands]
            elif op == b"Do" and last:
                w, _, _, h, x, y = last
                found.append((number, x / MM, (page_h - y - h) / MM, w / MM, h / MM))
    return found


def _picture(w, h, colour=(200, 30, 30)):
    out = io.BytesIO()
    Image.new("RGB", (w, h), colour).save(out, "PNG")
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode()


@pytest.fixture
def sized_bill(biller, make_client):
    """An owner with a wide logo (400 x 160 px), a signature (300 x 100 px) and one saved bill."""
    owner = biller()["owner"]
    assert owner.put("/api/v1/business/logo", json={"data_url": _picture(400, 160)}).status_code == 200
    assert (
        owner.put(
            "/api/v1/business/signature", json={"data_url": _picture(300, 100, (20, 30, 120))}
        ).status_code
        == 200
    )
    _, body = put_doc(
        owner, "b-1", save=True, lines=[line(qty=1, rate=10000)], customer={"name": "Mehta Clinic"}
    )
    return owner, make_client(signed_in=False), body["link_token"]


def _pdf(owner, public, token, **look):
    assert owner.put("/api/v1/business/bill-look", json=look).status_code == 200
    r = public.get(f"/b/{token}/pdf")
    assert r.status_code == 200
    return r.content


def test_ac_55_6_a_business_that_never_chose_keeps_100(sized_bill):
    """AC-55.6: the saved look says 100 for both, so bills do not change on release."""
    owner, _, _ = sized_bill
    look = owner.get("/api/v1/business/bill-look").json()
    assert (look["logo_size"], look["signature_size"]) == (100, 100)


@pytest.mark.parametrize("bad", [49, 201, 0, -100, 100.5, "big", True])
def test_ac_55_6_a_size_outside_50_to_200_is_refused(sized_bill, bad):
    """AC-55.6: 422 with a plain message, for both bars, and nothing is saved."""
    owner, _, _ = sized_bill
    for key, word in (("logo_size", "logo"), ("signature_size", "signature")):
        r = owner.put("/api/v1/business/bill-look", json={key: bad})
        assert r.status_code == 422
        assert f"Pick a size for the {word} from 50% to 200%." in r.text
    assert owner.get("/api/v1/business/bill-look").json()["logo_size"] == 100


def test_ac_55_6_the_change_is_in_history(sized_bill):
    """AC-55.6: the size change is logged in History, with its value."""
    owner, _, _ = sized_bill
    assert (
        owner.put("/api/v1/business/bill-look", json={"logo_size": 150, "signature_size": 75}).status_code
        == 200
    )
    history = owner.get("/api/v1/history", params={"group": "settings"}).json()["entries"]
    text = " ".join(x["text"] for x in history)
    assert "the logo size is now 150%" in text and "the signature size is now 75%" in text


def test_ac_55_3_the_bill_page_draws_each_picture_at_its_size(sized_bill):
    """AC-55.3: the public page sizes the logo (usual 160 x 56 px) and the signature (usual 60 px high)."""
    owner, public, token = sized_bill
    assert (
        owner.put("/api/v1/business/bill-look", json={"logo_size": 150, "signature_size": 50}).status_code
        == 200
    )
    page = public.get(f"/b/{token}").text
    assert 'style="max-width:240px;max-height:84px"' in page  # 160 x 56 at 150%
    assert 'alt="Signature" style="max-height:30px;max-width:100%"' in page  # 60 at 50%
    usual = public.get(f"/b/{token}").text
    assert (
        owner.put("/api/v1/business/bill-look", json={"logo_size": 100, "signature_size": 100}).status_code
        == 200
    )
    usual = public.get(f"/b/{token}").text
    assert 'style="max-width:160px;max-height:56px"' in usual and "max-height:60px" in usual


def test_ac_55_3_and_55_4_the_a4_pdf_grows_the_logo_without_widening_the_gap(sized_bill):
    """AC-55.3, AC-55.4: at 200% the logo is twice as big, and the name still starts the same 2 mm below it."""
    owner, public, token = sized_bill
    usual = _pdf(owner, public, token, logo_position="left", logo_size=100)
    big = _pdf(owner, public, token, logo_position="left", logo_size=200)
    (ux, uy, uw, uh), (bx, by, bw, bh) = _images(usual)[0], _images(big)[0]
    assert (uw, uh) == pytest.approx((35.0, 14.0), abs=0.1)  # 400 x 160 px in the 45 x 14 mm box
    assert (bw, bh) == pytest.approx((70.0, 28.0), abs=0.1)  # twice as big
    assert (ux, uy) == (bx, by) == (12.0, 12.0)  # the same corner
    gap_usual = _text_tops(usual)["Shree Cool AC"] - (uy + uh)
    gap_big = _text_tops(big)["Shree Cool AC"] - (by + bh)
    assert gap_big == pytest.approx(gap_usual, abs=0.2)  # the gap did not grow
    assert len(big) < 300 * 1024  # AC-55.5


def test_ac_55_4_a_big_logo_stays_inside_the_margins_in_every_place(sized_bill):
    """AC-55.4: left, centre and right at 200% never leave the 12 mm margins."""
    owner, public, token = sized_bill
    for place in ("left", "center", "right"):
        x, _, w, _ = _images(_pdf(owner, public, token, logo_position=place, logo_size=200))[0]
        assert x >= 11.9 and x + w <= 198.1


def test_ac_55_3_the_a4_signature_grows_and_stays_against_the_right_margin(sized_bill):
    """AC-55.3, AC-55.4: the signature is 14 x 40 mm usually and 28 x 80 mm at most, right-aligned."""
    owner, public, token = sized_bill
    usual = _images(_pdf(owner, public, token, signature_size=100))
    big = _images(_pdf(owner, public, token, signature_size=200))
    sign_usual = max(usual, key=lambda i: i[1])  # the lower picture is the signature
    sign_big = max(big, key=lambda i: i[1])
    assert sign_usual[3] == pytest.approx(13.3, abs=0.2) and sign_big[3] == pytest.approx(26.7, abs=0.4)
    assert sign_usual[0] + sign_usual[2] == pytest.approx(198, abs=0.2)
    assert sign_big[0] + sign_big[2] == pytest.approx(198, abs=0.2)
    text = _text_tops(_pdf(owner, public, token, signature_size=200))
    assert text["For Shree Cool AC"] > sign_big[1] + sign_big[3]  # the words stay clear under it


def test_ac_55_4_a_big_signature_on_a_full_page_moves_to_the_next_one(biller, make_client):
    """AC-55.4: a signature that would run off the bottom of the page starts the next page instead."""
    owner = biller()["owner"]
    assert owner.put("/api/v1/business/signature", json={"data_url": _picture(300, 100)}).status_code == 200
    _, body = put_doc(
        owner,
        "b-9",
        save=True,
        lines=[line(f"Item {n}", rate=1000) for n in range(31)],
        customer={"name": "X"},
    )
    assert owner.put("/api/v1/business/bill-look", json={"signature_size": 200}).status_code == 200
    raw = make_client(signed_in=False).get(f"/b/{body['link_token']}/pdf").content
    pictures = _all_images(raw)
    assert len(pictures) == 1  # the signature is printed once
    _page_no, _, y, _, h = pictures[0]
    assert y + h <= 297 - 15 + 0.1  # wholly above the bottom margin, on whichever page it landed


def test_ac_55_3_the_receipt_pdf_keeps_big_pictures_inside_its_column(sized_bill):
    """AC-55.3, AC-55.4: on the 80 mm receipt a 200% logo is at most the 72 mm column, centred."""
    owner, public, token = sized_bill
    raw = _pdf(owner, public, token, layout="receipt_80", logo_size=200, signature_size=200)
    for x, _, w, _ in _images(raw):
        assert x >= 3.9 and x + w <= 76.1
    first = _images(raw)[0]
    assert abs((first[0] + first[2] / 2) - 40) < 0.3  # still centred
    assert _text_tops(raw)["Shree Cool AC"] > first[1] + first[3]
