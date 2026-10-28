"""US-12: engineering documentation."""

from pathlib import Path

DOCS = Path(__file__).resolve().parents[2] / "docs" / "architecture"


def test_ac_12_1_architecture_design_and_risks_are_written_down():
    """AC-12.1: HLD, LLD, RISKS and REFERENCE-REVIEW exist with their key sections."""
    hld = (DOCS / "HLD.md").read_text(encoding="utf-8")
    for heading in ["## 3. Context", "## 4. Building blocks", "## 5. Key flows", "## 6. Deployment"]:
        assert heading in hld
    lld = (DOCS / "LLD.md").read_text(encoding="utf-8")
    for heading in [
        "## 2. API",
        "## 3. Job workflow",
        "## 1. Code layout",
        "## 5. AMC visit planner",
        "## 6. WhatsApp webhook",
    ]:
        assert heading in lld
    assert '{"error": {"code": "...", "message": "..."}}' in lld
    risks = (DOCS / "RISKS.md").read_text(encoding="utf-8")
    assert "| ID | Risk or challenge | Likelihood | Impact | How we resolve it | Status |" in risks
    rows = [ln for ln in risks.splitlines() if ln.startswith("| R-")]
    assert len(rows) >= 10
    assert all(ln.count("|") >= 7 for ln in rows)
    review = (DOCS / "REFERENCE-REVIEW.md").read_text(encoding="utf-8")
    assert "kritvo-api" in review
    assert "## What KaryaHub adopts, adapts or defers" in review
