"""US-56 Clear warnings and logs when a logo or signature fails (CR-0019), on the server."""

import base64
import io
import logging

import pytest
from conftest import line, put_doc
from karyahub.db.engine import get_engine
from karyahub.settings import get_settings
from PIL import Image
from sqlalchemy import text

LOGGER = "karyahub.pictures"


def _png(w=120, h=60):
    out = io.BytesIO()
    Image.new("RGB", (w, h), (200, 30, 30)).save(out, "PNG")
    return out.getvalue()


def _url(raw: bytes, mime="image/png") -> str:
    return f"data:{mime};base64," + base64.b64encode(raw).decode()


def _lines(caplog) -> list[str]:
    return [r.getMessage() for r in caplog.records if r.name == LOGGER]


@pytest.fixture
def owner(biller):
    return biller()["owner"]


@pytest.mark.parametrize(
    ("path", "kind"), [("/api/v1/business/logo", "logo"), ("/api/v1/business/signature", "signature")]
)
@pytest.mark.parametrize(
    ("data_url", "reason"),
    [
        ("not a picture", "not-a-picture-data-url"),
        ("data:image/gif;base64,R0lGODlhAQABAAAAACw=", "type-not-allowed"),
        ("data:image/png;base64,@@@@", "bad-encoding"),
        (_url(b"GIF89a-not-a-png"), "not-really-that-type"),
        (_url(b"\x89PNG\r\n\x1a\n" + b"junk"), "unreadable"),
        (_url(_png() + b"\0" * (1024 * 1024 + 1)), "too-big"),
    ],
)
def test_ac_56_4_every_refused_picture_is_logged_with_its_reason(owner, caplog, path, kind, data_url, reason):
    """AC-56.4: which picture, why, and its size; never the picture itself."""
    with caplog.at_level(logging.WARNING, logger=LOGGER):
        r = owner.put(path, json={"data_url": data_url})
    assert r.status_code == 422  # the owner gets the plain message (AC-56.1)
    found = _lines(caplog)
    assert len(found) == 1
    assert f"kind={kind}" in found[0] and f"reason={reason}" in found[0] and "business=" in found[0]
    assert "base64" not in found[0] and data_url[:60] not in found[0]  # no picture content in the log


def test_ac_56_4_a_picture_that_is_too_many_pixels_is_logged_with_its_size(owner, caplog):
    """AC-56.4: the size that was refused is in the line, so support can see why."""
    huge = Image.new("1", (4001, 8))
    out = io.BytesIO()
    huge.save(out, "PNG")
    with caplog.at_level(logging.WARNING, logger=LOGGER):
        r = owner.put("/api/v1/business/logo", json={"data_url": _url(out.getvalue())})
    assert r.status_code == 422
    assert "reason=dimensions" in _lines(caplog)[0] and "width=4001" in _lines(caplog)[0]


def test_ac_56_4_a_good_picture_logs_nothing(owner, caplog):
    """AC-56.4: no noise when all is well."""
    with caplog.at_level(logging.WARNING, logger=LOGGER):
        assert owner.put("/api/v1/business/logo", json={"data_url": _url(_png())}).status_code == 200
        assert owner.put("/api/v1/business/signature", json={"data_url": _url(_png())}).status_code == 200
    assert _lines(caplog) == []


def test_ac_56_5_a_damaged_stored_picture_is_left_out_logged_and_the_bill_still_comes(
    owner, make_client, caplog
):
    """AC-56.4, AC-56.5: a saved picture that no longer reads is logged on every page and PDF, never an error page."""
    assert owner.put("/api/v1/business/logo", json={"data_url": _url(_png())}).status_code == 200
    assert owner.put("/api/v1/business/signature", json={"data_url": _url(_png())}).status_code == 200
    _, body = put_doc(
        owner, "b-1", save=True, lines=[line(qty=1, rate=10000)], customer={"name": "Mehta Clinic"}
    )
    token = body["link_token"]

    async def damage():  # what a half-written or hand-edited row would look like
        async with get_engine(get_settings()).begin() as conn:
            await conn.execute(
                text("update businesses set logo_data = :d, signature_data = :d"),
                {"d": "data:image/png;base64,AAAA"},
            )

    owner.portal.call(damage)
    public = make_client(signed_in=False)
    with caplog.at_level(logging.WARNING, logger=LOGGER):
        page = public.get(f"/b/{token}")
        pdf = public.get(f"/b/{token}/pdf")
    assert page.status_code == 200 and "Tax Invoice" in page.text and 'class="logo"' not in page.text
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    found = " ".join(_lines(caplog))
    assert "kind=logo" in found and "kind=signature" in found and "reason=" in found


def test_ac_56_4_a_picture_the_pdf_cannot_print_is_logged_and_left_out(
    owner, make_client, caplog, monkeypatch
):
    """AC-56.4, AC-56.5: if preparing a picture fails, the line says which one and why, and the PDF is still made."""
    from karyahub.data import bill_render

    assert owner.put("/api/v1/business/logo", json={"data_url": _url(_png())}).status_code == 200
    _, body = put_doc(owner, "b-2", save=True, lines=[line(qty=1, rate=10000)], customer={"name": "X"})

    def broken(*args, **kwargs):
        raise OSError("cannot identify image file")

    monkeypatch.setattr(bill_render.ImageOps, "exif_transpose", broken)
    with caplog.at_level(logging.WARNING, logger=LOGGER):
        pdf = make_client(signed_in=False).get(f"/b/{body['link_token']}/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    found = " ".join(_lines(caplog))
    assert "kind=logo" in found and "reason=prepare-failed" in found and "error=OSError" in found
    assert "mime=image/png" in found and "bytes=" in found
