"""US-29 Estimate to bill, US-30 bill look and link, US-31 Send on WhatsApp (CR-0012), on the server."""

import base64
import io
from urllib.parse import parse_qs, unquote, urlparse

import pytest
from conftest import line, put_doc, stored, sync_ops
from karyahub import sender
from pypdf import PdfReader

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


def _saved(c, doc_id="b-1", **fields):
    fields.setdefault(
        "lines", [line(qty=2, rate=125000, discount={"kind": "percent", "value": 10}, hsn="998719")]
    )
    fields.setdefault(
        "customer", {"name": "Mehta Clinic", "phone": "98220 00001", "address": "Kothrud, Pune"}
    )
    _, body = put_doc(c, doc_id, save=True, **fields)
    assert body["status"] == "saved", body.get("save_problem")
    return body


def _pdf_text(raw: bytes) -> str:
    return "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(raw)).pages)


# ---------- US-29 ----------
def test_ac_29_2_make_bill_copies_the_estimate_and_links_both(biller):
    """AC-29.2: Make bill opens a draft with the same customer, lines, discounts and place of supply;
    saving it marks the estimate "Billed as <number>"."""
    owner = biller()["owner"]
    est = _saved(owner, "e-1", type="quote", bill_discount={"kind": "amount", "value": 5000})
    r = owner.post("/api/v1/documents/e-1/make-bill", json={"bill_id": "b-from-e"})
    assert r.status_code == 200, r.text
    draft = r.json()["body"]
    assert (draft["type"], draft["status"], draft["estimate_id"]) == ("invoice", "draft", "e-1")
    assert draft["customer"] == est["customer"]
    assert [ln["description"] for ln in draft["lines"]] == [ln["description"] for ln in est["lines"]]
    assert draft["bill_discount"] == est["bill_discount"]
    _, bill = put_doc(
        owner,
        "b-from-e",
        save=True,
        **{k: draft[k] for k in ("customer", "lines", "bill_discount", "estimate_id")},
    )
    assert bill["number"] == "26-27/0001"
    est_now = stored(owner, "document", "e-1")
    assert (est_now["bill_id"], est_now["bill_number"]) == ("b-from-e", "26-27/0001")
    assert est_now["history"][-1]["what"] == "Billed as 26-27/0001"


def test_ac_29_3_an_estimate_is_billed_only_once(biller):
    """AC-29.3: a second Make bill says "This estimate is already billed as <number>." and makes nothing."""
    owner = biller()["owner"]
    _saved(owner, "e-2", type="quote")
    draft = owner.post("/api/v1/documents/e-2/make-bill", json={"bill_id": "b-2"}).json()["body"]
    put_doc(owner, "b-2", save=True, **{k: draft[k] for k in ("customer", "lines", "estimate_id")})
    r = owner.post("/api/v1/documents/e-2/make-bill", json={"bill_id": "b-3"})
    assert r.status_code == 409
    assert r.json()["error"]["message"] == "This estimate is already billed as 26-27/0001."
    # A second draft made offline from the same estimate can't be saved either.
    _, other = put_doc(owner, "b-4", save=True, lines=[line()], estimate_id="e-2")
    assert other["save_problem"] == "This estimate is already billed as 26-27/0001."


# ---------- US-30 ----------
def test_ac_30_1_bill_look_is_checked_and_needs_manage_settings(biller):
    """AC-30.1: layout, one of 6 colours, bank, UPI ID, terms and a signature of up to 300 KB."""
    owner = biller()["owner"]
    good = {
        "layout": "a4_modern",
        "colour": "#1d4ed8",
        "upi_id": "shreecool@okaxis",
        "terms": "Pay in 7 days.",
        "bank": {"account_name": "Shree Cool AC", "account_number": "123456789012", "ifsc": "sbin0001234"},
    }
    r = owner.put("/api/v1/business/bill-look", json=good)
    assert r.status_code == 200, r.text
    assert (r.json()["colour"], r.json()["bank"]["ifsc"]) == ("#1D4ED8", "SBIN0001234")
    for bad in (
        {"colour": "#FF00FF"},
        {"layout": "a5"},
        {"upi_id": "nope"},
        {"bank": {"ifsc": "SBIN1234"}},
        {"due_days": -1},
    ):
        assert owner.put("/api/v1/business/bill-look", json=bad).status_code == 422, bad
    png = "data:image/png;base64," + base64.b64encode(PNG).decode()
    assert owner.put("/api/v1/business/signature", json={"data_url": png}).status_code == 200
    big = "data:image/png;base64," + base64.b64encode(PNG + b"0" * 310_000).decode()
    r = owner.put("/api/v1/business/signature", json={"data_url": big})
    assert r.status_code == 422 and "300 KB" in r.json()["error"]["message"]
    assert owner.get("/api/v1/auth/me").json()["business"]["signature_version"]


def test_ac_30_2_the_pdf_has_every_part_of_a_tax_invoice(biller, make_client):
    """AC-30.2: Tax Invoice, both parties and GSTINs, place of supply, per-line figures, totals, words and
    the signatory, in every layout."""
    owner = biller()["owner"]
    body = _saved(owner, customer={"name": "Mehta Clinic", "gstin": "27AAPFU0939F1ZV", "address": "Kothrud"})
    public = make_client(signed_in=False)
    for layout in ("a4_classic", "a4_modern", "receipt_80"):
        assert owner.put("/api/v1/business/bill-look", json={"layout": layout}).status_code == 200
        r = public.get(f"/b/{body['link_token']}/pdf")
        assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
        text = _pdf_text(r.content)
        for words in (
            "Tax Invoice",
            "Shree Cool AC",
            "27AAPFU0939F1ZV",
            "26-27/0001",
            "Mehta Clinic",
            "Maharashtra (27)",
            "998719",
            "2,250.00",
            "18%",
            "Rupees Two Thousand Six Hundred Fifty-Five only",
            "Authorised signatory",
        ):
            assert words in text, (layout, words)
    page = public.get(f"/b/{body['link_token']}").text
    assert "Tax Invoice" in page and "Place of supply: Maharashtra (27)" in page and "CGST" in page


def test_ac_30_3_the_link_needs_no_sign_in_and_says_nothing_for_a_wrong_token(biller, make_client):
    """AC-30.3: at least 128 random bits, opens without sign-in, noindex; a wrong token isn't valid."""
    owner = biller()["owner"]
    body = _saved(owner)
    token = body["link_token"]
    assert len(base64.urlsafe_b64decode(token + "==")) * 8 >= 128
    public = make_client(signed_in=False)
    r = public.get(f"/b/{token}")
    assert r.status_code == 200
    assert r.headers["x-robots-tag"] == "noindex, nofollow"
    assert '<meta name="robots" content="noindex, nofollow">' in r.text
    assert "Download PDF" in r.text and f"/b/{token}/pdf" in r.text
    for wrong in ("x" * 32, token[:-1] + ("A" if token[-1] != "A" else "B"), "a" * 200):
        r = public.get(f"/b/{wrong}")
        assert r.status_code == 404
        assert "This bill link isn't valid." in r.text and "Mehta" not in r.text


def test_ac_30_4_pdf_is_small_prints_rupees_and_shows_cancelled(biller, make_client):
    """AC-30.4: under 300 KB with a logo, ₹ prints, and a cancelled bill says Cancelled."""
    owner = biller()["owner"]
    png = "data:image/png;base64," + base64.b64encode(PNG).decode()
    assert owner.put("/api/v1/business/logo", json={"data_url": png}).status_code == 200
    body = _saved(owner)
    public = make_client(signed_in=False)
    r = public.get(f"/b/{body['link_token']}/pdf")
    assert len(r.content) < 300 * 1024
    assert "₹2,655" in _pdf_text(r.content)
    assert owner.post("/api/v1/documents/b-1/actions", json={"action": "cancel"}).status_code == 200
    assert "CANCELLED" in _pdf_text(public.get(f"/b/{body['link_token']}/pdf").content)
    assert "This bill is cancelled." in public.get(f"/b/{body['link_token']}").text


def test_ac_30_5_a_link_turned_off_says_so_and_comes_back_the_same(biller, make_client):
    """AC-30.5: off answers "turned off by <business>"; on again is the same link."""
    owner = biller()["owner"]
    token = _saved(owner)["link_token"]
    public = make_client(signed_in=False)
    assert owner.put("/api/v1/documents/b-1/link", json={"on": False}).status_code == 200
    r = public.get(f"/b/{token}")
    assert r.status_code == 410 and "This bill link has been turned off by Shree Cool AC." in r.text
    assert owner.put("/api/v1/documents/b-1/link", json={"on": True}).json()["body"]["link_token"] == token
    assert public.get(f"/b/{token}").status_code == 200


def test_ac_30_6_the_demo_makes_no_links(client):
    """AC-30.6: the demo business keeps bills on the device: sync and links are refused."""
    r = client.post("/api/v1/sync", json={"since": 0, "ops": []})
    assert r.status_code == 403 and r.json()["error"]["code"] == "demo_local"
    assert client.post("/api/v1/documents/x/send").status_code == 403


# ---------- US-31 ----------
def test_ac_31_1_send_opens_whatsapp_with_the_message_and_marks_sent(biller):
    """AC-31.1: wa.me/91<mobile> with "Namaste <name>, here is your bill <number> from <business> for ₹<total>: <link>"."""
    owner = biller()["owner"]
    body = _saved(owner)
    r = owner.post("/api/v1/documents/b-1/send")
    assert r.status_code == 200, r.text
    out = r.json()
    url = urlparse(out["url"])
    assert (url.netloc, url.path) == ("wa.me", "/919822000001")
    text = unquote(parse_qs(url.query)["text"][0])
    assert (
        text
        == f"Namaste Mehta Clinic, here is your bill 26-27/0001 from Shree Cool AC for ₹2,655: http://testserver/b/{body['link_token']}"
    )
    assert out["how"] == "link"
    assert out["record"]["body"]["status"] == "sent"


def test_ac_31_1_an_estimate_message_and_no_mobile(biller):
    """AC-31.1: an estimate says "your estimate <number>, valid until <date>"; no mobile opens wa.me/?text=."""
    owner = biller()["owner"]
    _saved(owner, "e-9", type="quote", customer={"name": "Walk-in customer"})
    out = owner.post("/api/v1/documents/e-9/send").json()
    assert out["url"].startswith("https://wa.me/?text=")
    assert out["text"].startswith(
        "Namaste, here is your estimate E/26-27/0001, valid until 17-11-2026, from Shree Cool AC for ₹2,655: "
    )


def test_ac_31_2_the_same_call_sends_directly_once_a_number_is_connected(biller, monkeypatch):
    """AC-31.2: through the one sender layer; with a connected number (K6) it sends, same call and screen."""
    made = biller()
    owner = made["owner"]
    _saved(owner)
    sent = []

    class Connected:
        async def send_document(self, business, phone, text, wa_link):
            sent.append((phone, text))
            return {"how": "sent", "url": ""}

    monkeypatch.setitem(sender.CONNECTED, made["business"]["id"], Connected())
    out = owner.post("/api/v1/documents/b-1/send").json()
    assert out["how"] == "sent" and sent and sent[0][1].startswith("Namaste Mehta Clinic")
    assert out["record"]["body"]["history"][-1]["what"] == "Sent on WhatsApp"


@pytest.mark.parametrize("how", ["copy", "share", "paper"])
def test_ac_31_3_copy_share_or_mark_sent_makes_it_sent(biller, how):
    """AC-31.3: Copy link, Share and Mark as sent each make the bill Sent."""
    owner = biller()["owner"]
    _saved(owner)
    body = owner.post("/api/v1/documents/b-1/actions", json={"action": "mark_sent", "how": how}).json()[
        "body"
    ]
    assert (body["status"], body["sent_how"]) == ("sent", how)


def test_ac_31_4_history_activity_log_and_monthly_count(biller):
    """AC-31.4: who, when and how in the bill's history and the activity log; the month's count goes up."""
    owner = biller()["owner"]
    _saved(owner)
    owner.post("/api/v1/documents/b-1/send")
    owner.post("/api/v1/documents/b-1/actions", json={"action": "mark_sent", "how": "copy"})
    body = stored(owner, "document", "b-1")
    assert [h["what"] for h in body["history"]][-2:] == [
        "Opened WhatsApp with the message",
        "Copied the link",
    ]
    assert all(h["who"].startswith("Owner of") and h["at"] for h in body["history"])
    log = [
        e["text"] for e in owner.get("/api/v1/team/audit").json()["entries"] if e["action"] == "document_sent"
    ]
    assert len(log) == 2
    from karyahub.data import bills

    async def count(db_session):
        from karyahub.data.service import counter_value

        return await counter_value(db_session, bills_business, "msg:2026-11")

    bills_business = sync_ops(owner) and owner.get("/api/v1/auth/me").json()["business"]["id"]
    from karyahub.db.engine import db_session
    from karyahub.settings import get_settings

    async def read():
        async for db in db_session(get_settings()):
            return await count(db)

    assert owner.portal.call(read) == 2
    assert bills.WALK_IN == "Walk-in customer"
