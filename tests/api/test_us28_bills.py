"""US-27 and US-28 on the server (CR-0012): saved figures, checks, stock, numbers and status."""

from datetime import date

from conftest import line, put_doc, stored, sync_ops
from karyahub.data import bills


def _item(c, item_id="it-1", name="Copper pipe", unit="metre", sale=25000, gst=18, opening=10, **extra):
    body = {"name": name, "unit": unit, "sale": sale, "gst": gst, **extra}
    ops = [{"kind": "item", "id": item_id, "body": body}]
    if opening:
        ops.append(
            {
                "kind": "stock_move",
                "id": f"mv-{item_id}",
                "body": {"kind": "opening", "item_id": item_id, "qty": opening},
            }
        )
    res = sync_ops(c, *ops)
    assert all(r["status"] == "applied" for r in res["results"]), res["results"]


# ---------- US-27 ----------
def test_ac_27_9_the_server_works_out_and_stores_its_own_figures(biller):
    """AC-27.9: what the phone says the totals are is ignored; the server's engine decides."""
    owner = biller()["owner"]
    lines = [line(qty=2, rate=125000, discount={"kind": "percent", "value": 10})]
    res, body = put_doc(owner, "d-1", save=True, lines=lines, totals={"total": 1}, customer={"name": "Mehta"})
    assert res["status"] == "applied", res
    assert body["status"] == "saved"
    assert body["totals"]["total"] == 265500
    assert (body["totals"]["cgst"], body["totals"]["sgst"]) == (20250, 20250)
    assert body["lines"][0]["taxable"] == 225000
    assert body["tax_mode"] == "intra"
    assert body["totals"]["in_words"] == "Rupees Two Thousand Six Hundred Fifty-Five only"


def test_ac_27_6_place_of_supply_from_the_customer_gives_igst(biller):
    """AC-27.6: a customer in another state is billed IGST, with the place of supply stored."""
    owner = biller()["owner"]
    customer = {"name": "Rao Traders", "gstin": "29AAGCB7383J1Z4", "state_code": "29"}
    _, body = put_doc(owner, "d-2", save=True, lines=[line()], customer=customer, place_of_supply="29")
    assert body["tax_mode"] == "inter"
    assert body["totals"]["igst"] == 18000


def test_ac_27_7_composition_and_not_registered_bills(biller):
    """AC-27.7: a Composition business's bill has no tax and is a Bill of Supply; Not registered is a Bill."""
    owner = biller(gst_registration="composition")["owner"]
    _, body = put_doc(owner, "d-3", save=True, lines=[line(rate=11800, price_includes_gst=True)])
    assert (body["tax_mode"], body["totals"]["total"], body["summary"]) == ("composition", 11800, [])
    assert bills.heading(body) == "Bill of Supply"
    assert owner.put("/api/v1/business/setup", json={"gst_registration": "unregistered"}).status_code == 200
    _, body2 = put_doc(owner, "d-4", save=True, lines=[line()])
    assert bills.heading(body2) == "Bill"
    assert body2["seller"]["gstin"] == ""
    assert body2["lines"][0]["gst_rate"] == "18"  # the item keeps its rate, unused


def test_ac_27_8_a_wrong_gstin_keeps_the_bill_a_draft_with_the_reason(biller):
    """AC-27.8: a GSTIN with the wrong check character can't be saved; the bill stays a draft, not lost."""
    owner = biller()["owner"]
    res, body = put_doc(
        owner, "d-5", save=True, lines=[line()], customer={"name": "X", "gstin": "27AAPFU0939F1ZA"}
    )
    assert res["status"] == "applied"
    assert body["status"] == "draft" and body["number"] == ""
    assert body["save_problem"] == "This GSTIN doesn't look right. Check it with the customer."


def test_ac_27_8_a_big_bill_without_gstin_needs_address_and_state(biller):
    """AC-27.8: ₹50,000 or more to a customer without a GSTIN needs their address and state."""
    owner = biller()["owner"]
    big = [line(rate=5000000, gst_rate=0)]
    _, body = put_doc(owner, "d-6", save=True, lines=big, customer={"name": "Walk in"})
    assert body["status"] == "draft"
    assert "needs their address and state" in body["save_problem"]
    _, body = put_doc(
        owner,
        "d-6",
        save=True,
        lines=big,
        customer={"name": "Walk in", "address": "Baner", "state_code": "27"},
    )
    assert body["status"] == "saved"


def test_ac_27_8_every_line_needs_a_description_and_quantity(biller):
    """AC-27.8: a line with no description, or a quantity of 0, keeps the bill a draft with the line named."""
    owner = biller()["owner"]
    _, body = put_doc(owner, "d-7", save=True, lines=[line(), line(description="")])
    assert body["save_problem"] == "Line 2: give it a description."
    _, body = put_doc(owner, "d-7", save=True, lines=[line(qty=0)])
    assert body["save_problem"] == "Line 1: Give a quantity above 0."
    _, body = put_doc(owner, "d-8", save=True, lines=[])
    assert body["save_problem"] == "Add an item or type a line."


def test_ac_27_10_a_bill_takes_stock_and_cancelling_returns_it(biller):
    """AC-27.10: item lines take stock ("Sold on <number>"); cancelling returns it; service items and
    a job's parts make no move."""
    owner = biller()["owner"]
    _item(owner)
    _item(owner, "it-2", "Gas refill", "nos", 150000, opening=0, service=True)
    lines = [
        line("Copper pipe", qty="2.5", rate=25000, item_id="it-1", unit="metre"),
        line("Gas refill", qty=1, rate=150000, item_id="it-2"),
        line("Copper pipe", qty=1, rate=25000, item_id="it-1", from_job_parts=True),
    ]
    _, body = put_doc(owner, "d-9", save=True, lines=lines)
    assert stored(owner, "item", "it-1")["qty"] == 7.5
    moves = sync_ops(owner)["changes"]["stock_move"]
    sold = [m["body"] for m in moves if m["body"]["kind"] == "sold"]
    assert [(m["qty"], m["note"]) for m in sold] == [(-2.5, f"Sold on {body['number']}")]
    r = owner.post("/api/v1/documents/d-9/actions", json={"action": "cancel", "reason": "Wrong customer"})
    assert r.status_code == 200, r.text
    assert stored(owner, "item", "it-1")["qty"] == 10
    back = [
        m["body"] for m in sync_ops(owner)["changes"]["stock_move"] if m["body"]["kind"] == "sale_cancelled"
    ]
    assert [(m["qty"], m["note"]) for m in back] == [(2.5, f"Bill {body['number']} cancelled")]


def test_ac_27_10_changing_a_saved_bill_moves_only_the_difference(biller):
    """AC-27.10: a saved bill changed from 2 to 3 metres takes 1 more metre, not 3."""
    owner = biller()["owner"]
    _item(owner)
    put_doc(owner, "d-10", save=True, lines=[line("Copper pipe", qty=2, rate=25000, item_id="it-1")])
    _, body = put_doc(owner, "d-10", lines=[line("Copper pipe", qty=3, rate=25000, item_id="it-1")])
    assert body["status"] == "saved"
    assert stored(owner, "item", "it-1")["qty"] == 7


def test_ac_29_1_an_estimate_never_takes_stock(biller):
    """AC-29.1: estimates use the same maths but never take stock."""
    owner = biller()["owner"]
    _item(owner)
    _, body = put_doc(
        owner, "e-1", save=True, type="quote", lines=[line("Copper pipe", qty=2, rate=25000, item_id="it-1")]
    )
    assert body["number"] == "E/26-27/0001"
    assert body["valid_until"] == "2026-11-17"
    assert stored(owner, "item", "it-1")["qty"] == 10


# ---------- US-28 ----------
def test_ac_28_1_numbers_follow_the_series_of_the_financial_year(biller):
    """AC-28.1: bills are 26-27/0001, 0002...; estimates E/26-27/0001; a new year starts at 0001."""
    owner = biller()["owner"]
    numbers = [put_doc(owner, f"n-{i}", save=True, lines=[line()])[1]["number"] for i in range(3)]
    assert numbers == ["26-27/0001", "26-27/0002", "26-27/0003"]
    assert put_doc(owner, "n-e", save=True, type="quote", lines=[line()])[1]["number"] == "E/26-27/0001"
    assert put_doc(owner, "n-m", save=True, date="2027-03-31", lines=[line()])[1]["number"] == "26-27/0004"
    assert put_doc(owner, "n-a", save=True, date="2027-04-01", lines=[line()])[1]["number"] == "27-28/0001"


def test_ac_28_1_financial_year_runs_april_to_march():
    """AC-28.1: 31 March is the old year and 1 April the new one."""
    assert bills.fy_of(date(2027, 3, 31)) == "26-27"
    assert bills.fy_of(date(2027, 4, 1)) == "27-28"
    assert bills.fy_of(date(2099, 12, 1)) == "99-00"


def test_ac_28_1_two_saves_at_once_get_consecutive_numbers_and_a_failed_save_uses_none(biller):
    """AC-28.1: saves in one batch get consecutive numbers; a refused save uses no number (no gaps)."""
    owner = biller()["owner"]
    ops = [
        {
            "kind": "document",
            "id": "c-1",
            "body": {"doc_version": 2, "type": "invoice", "lines": [line()], "save": True},
        },
        {
            "kind": "document",
            "id": "c-2",
            "body": {"doc_version": 2, "type": "invoice", "lines": [], "save": True},
        },
        {
            "kind": "document",
            "id": "c-3",
            "body": {"doc_version": 2, "type": "invoice", "lines": [line()], "save": True},
        },
    ]
    res = sync_ops(owner, *ops)
    assert [r.get("number") for r in res["results"]] == ["26-27/0001", "", "26-27/0002"]


def test_ac_28_2_prefix_is_optional_short_and_applies_from_the_next_bill(biller):
    """AC-28.2: up to 6 letters, digits, / or -; never longer than 16 characters; old numbers keep theirs."""
    owner = biller()["owner"]
    first = put_doc(owner, "p-1", save=True, lines=[line()])[1]["number"]
    r = owner.put("/api/v1/business/bill-look", json={"prefix": "ABCDEF"})
    assert r.status_code == 422 and "longer than 16 characters" in r.json()["error"]["message"]
    assert owner.put("/api/v1/business/bill-look", json={"prefix": "AC#"}).status_code == 422
    assert owner.put("/api/v1/business/bill-look", json={"prefix": "ac"}).json()["prefix"] == "AC"
    second = put_doc(owner, "p-2", save=True, lines=[line()])[1]["number"]
    assert (first, second) == ("26-27/0001", "AC/26-27/0002")
    assert stored(owner, "document", "p-1")["number"] == "26-27/0001"
    assert owner.put("/api/v1/business/bill-look", json={"prefix": "ABCDE/"}).status_code == 200
    assert len("ABCDE/26-27/0003") == 16


def test_ac_28_3_a_draft_has_no_number_until_saved(biller):
    """AC-28.3: drafts made with no signal travel as drafts and get their number when saved online."""
    owner = biller()["owner"]
    _, body = put_doc(owner, "o-1", lines=[line()])
    assert (body["status"], body["number"]) == ("draft", "")
    assert body["totals"]["total"] == 118000  # figures shown even on a draft
    _, body = put_doc(owner, "o-1", save=True, lines=[line()])
    assert (body["status"], body["number"]) == ("saved", "26-27/0001")


def test_ac_28_4_overdue_is_worked_out_and_drafts_can_be_deleted(biller):
    """AC-28.4: Overdue is Saved or Sent past its due date, never stored; a draft can be deleted."""
    owner = biller()["owner"]
    _, body = put_doc(owner, "s-1", save=True, date="2026-10-01", lines=[line()])
    assert body["due_date"] == "2026-10-01"  # due on receipt (the founder's default)
    assert body["status"] == "saved"
    assert bills.status_of(body, date(2026, 11, 2)) == "overdue"
    assert bills.status_of({**body, "status": "paid"}, date(2026, 11, 2)) == "paid"
    put_doc(owner, "s-2", lines=[line()])
    res = sync_ops(owner, {"kind": "document", "id": "s-2", "body": {"doc_version": 2, "deleted": True}})
    assert res["results"][0]["status"] == "applied"
    assert stored(owner, "document", "s-2")["deleted"] is True
    res = sync_ops(owner, {"kind": "document", "id": "s-1", "body": {"doc_version": 2, "deleted": True}})
    assert res["results"][0]["message"] == "Only a draft can be deleted. Cancel a saved bill instead."


def test_ac_28_5_a_sent_or_paid_bill_cant_change_and_cancel_keeps_its_number(biller):
    """AC-28.5: Sent and Paid bills are locked; Cancel keeps the number and can be undone."""
    owner = biller()["owner"]
    put_doc(owner, "l-1", save=True, lines=[line()])
    assert (
        owner.post("/api/v1/documents/l-1/actions", json={"action": "mark_sent", "how": "paper"}).status_code
        == 200
    )
    res = sync_ops(
        owner,
        {
            "kind": "document",
            "id": "l-1",
            "body": {"doc_version": 2, "type": "invoice", "lines": [line(qty=5)]},
        },
    )
    assert res["results"][0]["message"] == "A sent bill can't be changed. Cancel it and make a copy."
    r = owner.post("/api/v1/documents/l-1/actions", json={"action": "cancel", "reason": "Typo"})
    body = r.json()["body"]
    assert (body["status"], body["number"], body["cancel_reason"]) == ("cancelled", "26-27/0001", "Typo")
    body = owner.post("/api/v1/documents/l-1/actions", json={"action": "undo_cancel"}).json()["body"]
    assert body["status"] == "sent"
    body = owner.post(
        "/api/v1/documents/l-1/actions", json={"action": "mark_paid", "paid_on": "2026-11-02"}
    ).json()["body"]
    assert (body["status"], body["paid_at"]) == ("paid", "2026-11-02")
    assert put_doc(owner, "l-2", save=True, lines=[line()])[1]["number"] == "26-27/0002"  # no gap, no reuse


def test_ac_28_7_old_quotes_and_invoices_open_unchanged(biller):
    """AC-28.7: documents saved by v0.7.0 keep their number, lines and totals, are never worked out again,
    and the new series starts at 0001."""
    owner = biller()["owner"]
    old = {
        "type": "quote",
        "job_id": "",
        "customer": {"name": "Old"},
        "lines": [{"description": "Service", "qty": 1, "rate": 999}],
        "subtotal": 999,
        "cgst": 89.91,
        "sgst": 89.91,
        "roundOff": 0.18,
        "total": 1179,
        "date": "2026-06-01",
    }
    r = owner.post(
        "/api/v1/import",
        json={
            "device_id": "phone-old-1",
            "document": [{**old, "id": "QT-2026-0003", "number": "QT-2026-0003"}],
        },
    )
    assert r.status_code == 200, r.text
    docs = sync_ops(owner)["changes"]["document"]
    body = docs[0]["body"]
    assert body["number"] == "QT-2026-0003"
    assert (body["total"], body["cgst"], body["lines"]) == (1179, 89.91, old["lines"])
    assert "doc_version" not in body
    assert bills.status_of(body) == "saved"
    assert put_doc(owner, "new-1", save=True, type="quote", lines=[line()])[1]["number"] == "E/26-27/0001"


def test_ac_28_8_cancelling_needs_cancel_bills_and_technicians_make_no_bills(biller, make_client):
    """AC-28.8: a coordinator makes bills but can't cancel; a technician can't make them; the owner can
    switch cancel_bills on for the coordinator role."""
    made = biller()
    owner = made["owner"]
    for name, phone, role in (
        ("Priya", "9811177777", "coordinator"),
        ("Santosh", "9811188888", "technician"),
    ):
        assert (
            owner.post(
                "/api/v1/team", json={"name": name, "phone": phone, "role": role, "pin": "4826"}
            ).status_code
            == 201
        )
    coord = make_client("9811177777", "4826")
    coord.post("/api/v1/auth/change-pin", json={"current_pin": "4826", "new_pin": "7315"})
    tech = make_client("9811188888", "4826")
    tech.post("/api/v1/auth/change-pin", json={"current_pin": "4826", "new_pin": "7315"})
    _, body = put_doc(coord, "r-1", save=True, lines=[line()])
    assert body["status"] == "saved"
    r = coord.post("/api/v1/documents/r-1/actions", json={"action": "cancel"})
    assert r.status_code == 403
    res = sync_ops(
        tech,
        {
            "kind": "document",
            "id": "r-2",
            "body": {"doc_version": 2, "type": "invoice", "lines": [line()], "save": True},
        },
    )
    assert res["results"][0]["status"] == "rejected"
    assert tech.post("/api/v1/documents/r-1/actions", json={"action": "mark_paid"}).status_code == 403
    r = owner.put("/api/v1/team/roles/coordinator/permissions", json={"permissions": {"cancel_bills": True}})
    assert r.status_code == 200, r.text
    assert coord.post("/api/v1/documents/r-1/actions", json={"action": "cancel"}).status_code == 200
