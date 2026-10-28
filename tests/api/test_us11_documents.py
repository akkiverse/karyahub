"""US-11: paperwork rules on the server keep the v0.1.0 results."""


def test_ac_11_2_gst_totals_match_the_web_app(client):
    """AC-11.2: server GST totals equal v0.1.0's (CGST 9% + SGST 9%, rupee rounding); inter-state uses IGST 18%."""
    lines = [
        {"description": "Gas refill", "qty": 1, "rate": 2500},
        {"description": "Visit", "qty": 1, "rate": 400},
    ]
    r = client.post("/api/v1/documents/totals", json={"lines": lines}).json()
    assert r == {
        "subtotal": 2900.0,
        "cgst": 261.0,
        "sgst": 261.0,
        "igst": 0.0,
        "roundOff": 0.0,
        "total": 3422,
        "invalid": 0,
    }
    odd = client.post(
        "/api/v1/documents/totals", json={"lines": [{"qty": 1, "rate": 333.33}, {"qty": 0, "rate": 5}]}
    ).json()
    assert odd["cgst"] == 30.0
    assert odd["total"] == 393
    assert odd["roundOff"] == -0.33
    assert odd["invalid"] == 1
    inter = client.post("/api/v1/documents/totals", json={"lines": lines, "inter_state": True}).json()
    assert (inter["igst"], inter["cgst"], inter["total"]) == (522.0, 0.0, 3422)
    reminder = client.post(
        "/api/v1/renewals/reminder-text",
        json={
            "customer": {"id": "c01", "name": "Anita Deshpande", "equipment": "LG 1T split AC",
                         "amc_expiry": "2027-01-09", "amc_value": 4800},
            "today": "2027-01-01",
        },
    ).json()  # fmt: skip
    assert reminder["text"].startswith(
        "Namaste Anita ji, your AC maintenance contract (AMC) with CoolCare AC Services"
    )
    assert "ends on 9 January 2027" in reminder["text"]
    assert "₹4,800" in reminder["text"]
