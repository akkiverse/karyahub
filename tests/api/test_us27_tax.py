"""US-27 tax engine (CR-0012): the shared cases, the Spec's worked examples, GSTIN and words."""

import json
from pathlib import Path

import pytest
from karyahub.domain import tax

FIXTURE = json.loads((Path(__file__).parent.parent / "fixtures" / "gst_cases.json").read_text("utf-8"))


def _bill(lines, place="27", **extra):
    return {
        "registration": "regular",
        "business_state": "27",
        "place_of_supply": place,
        "lines": lines,
        **extra,
    }


def test_ac_27_9_fixture_has_at_least_twenty_cases_of_every_kind():
    """AC-27.9: the shared file holds at least 20 cases covering every kind the Spec names."""
    names = " ".join(c["name"] for c in FIXTURE["cases"]).lower()
    assert len(FIXTURE["cases"]) >= 20
    for word in (
        "same state",
        "other state",
        "includes gst",
        "line discount",
        "bill discount",
        "several rates",
    ):
        assert word in names, word
    for word in ("composition", "not registered", "round off"):
        assert word in names, word


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=[c["name"] for c in FIXTURE["cases"]])
def test_ac_27_9_server_gives_the_shared_figures(case):
    """AC-27.9: the server's engine gives exactly the figures in tests/fixtures/gst_cases.json."""
    if "error" in case:
        with pytest.raises(tax.TaxInputError) as caught:
            tax.compute(case["bill"])
        assert {"code": caught.value.code, "line": caught.value.line} == case["error"]
    else:
        assert tax.compute(case["bill"]) == case["expected"]


def test_ac_27_4_spec_example_same_state():
    """AC-27.4: 2 × ₹1,250 at 18% less 10%, same state: 2,250.00 + 202.50 + 202.50 = ₹2,655."""
    out = tax.compute(
        _bill([{"qty": 2, "rate": 125000, "gst_rate": 18, "discount": {"kind": "percent", "value": 10}}])
    )
    assert out["tax_mode"] == "intra"
    assert out["lines"][0]["taxable"] == 225000
    assert (out["totals"]["cgst"], out["totals"]["sgst"], out["totals"]["igst"]) == (20250, 20250, 0)
    assert out["totals"]["total"] == 265500
    assert out["totals"]["in_words"] == "Rupees Two Thousand Six Hundred Fifty-Five only"


def test_ac_27_4_other_state_is_igst():
    """AC-27.4: a place of supply outside my state gives IGST at the full rate."""
    out = tax.compute(
        _bill(
            [{"qty": 2, "rate": 125000, "gst_rate": 18, "discount": {"kind": "percent", "value": 10}}], "29"
        )
    )
    assert out["tax_mode"] == "inter"
    assert (out["totals"]["cgst"], out["totals"]["igst"], out["totals"]["total"]) == (0, 40500, 265500)


def test_ac_27_5_price_includes_gst():
    """AC-27.5: ₹118 at 18% is 100 + 9 + 9; ₹100 is 84.75 + 7.63 + 7.63 with round off −0.01."""
    a = tax.compute(_bill([{"qty": 1, "rate": 11800, "gst_rate": 18, "price_includes_gst": True}]))
    assert (a["totals"]["taxable"], a["totals"]["cgst"], a["totals"]["total"]) == (10000, 900, 11800)
    b = tax.compute(_bill([{"qty": 1, "rate": 10000, "gst_rate": 18, "price_includes_gst": True}]))
    assert (b["totals"]["taxable"], b["totals"]["cgst"], b["totals"]["sgst"]) == (8475, 763, 763)
    assert (b["totals"]["round_off"], b["totals"]["total"]) == (-1, 10000)


def test_ac_27_3_bill_discount_spread_last_line_takes_the_paisa():
    """AC-27.3: a whole-bill discount is spread in proportion before tax; the last line takes what is left."""
    out = tax.compute(
        _bill(
            [{"qty": 1, "rate": 10000, "gst_rate": 18}] * 3, bill_discount={"kind": "amount", "value": 10000}
        )
    )
    assert [ln["bill_discount"] for ln in out["lines"]] == [3333, 3333, 3334]
    assert [ln["taxable"] for ln in out["lines"]] == [6667, 6667, 6666]


def test_ac_27_6_tax_summary_one_row_per_rate():
    """AC-27.6: lines at different rates give one summary row per rate, lowest first."""
    rates = ["40", "0", "18", "0.25", "3", "5", "18"]
    out = tax.compute(_bill([{"qty": 1, "rate": 10000, "gst_rate": r} for r in rates]))
    assert [row["gst_rate"] for row in out["summary"]] == ["0", "0.25", "3", "5", "18", "40"]
    eighteen = next(row for row in out["summary"] if row["gst_rate"] == "18")
    assert (eighteen["taxable"], eighteen["cgst"], eighteen["sgst"]) == (20000, 1800, 1800)


def test_ac_27_6_place_of_supply_from_gstin_and_state_names():
    """AC-27.6: the place of supply comes from the GSTIN's first two digits and prints as name (code)."""
    assert tax.state_of_gstin("27AAPFU0939F1ZV") == "27"
    assert tax.state_label("27") == "Maharashtra (27)"
    assert tax.state_label("29") == "Karnataka (29)"
    assert tax.state_of_gstin("27AAPFU0939F1ZA") == ""


def test_ac_27_7_composition_and_not_registered_have_no_tax():
    """AC-27.7: Composition and Not registered bills carry no tax and no summary; items keep their rate."""
    for registration in ("composition", "unregistered"):
        out = tax.compute(
            {
                "registration": registration,
                "business_state": "27",
                "lines": [{"qty": 1, "rate": 11800, "gst_rate": 18, "price_includes_gst": True}],
            }
        )
        assert out["summary"] == []
        assert out["lines"][0]["gst_rate"] == "18"
        assert (out["totals"]["taxable"], out["totals"]["cgst"], out["totals"]["igst"]) == (11800, 0, 0)
        assert out["totals"]["total"] == 11800


def test_ac_27_8_gstin_pattern_and_check_character():
    """AC-27.8: a GSTIN must match the pattern and carry the right check character."""
    for text, ok in FIXTURE["gstin"]:
        assert tax.gstin_ok(text) is ok, text


def test_ac_30_2_total_in_words_indian_style():
    """AC-30.2: totals in words use the Indian system (lakh, crore)."""
    for n, words in FIXTURE["words"]:
        assert tax.number_in_words(n) == words


def test_ac_27_9_engine_never_uses_floats_for_money():
    """AC-27.9: figures typed as 0.1 + 0.2 style decimals give exact paise, never float drift."""
    out = tax.compute(
        _bill([{"qty": 0.1, "rate": 30, "gst_rate": 18}, {"qty": 0.2, "rate": 30, "gst_rate": 18}])
    )
    assert [ln["amount"] for ln in out["lines"]] == [3, 6]
    assert tax.scaled(0.30000000000000004, 3) is None
