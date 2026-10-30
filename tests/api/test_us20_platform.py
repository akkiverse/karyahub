"""US-20: businesses and the platform admin (CR-0005). US-21: forgot PIN with a code."""

import pytest
from conftest import CSRF, sign_in
from karyahub.db.engine import async_url
from karyahub.settings import get_settings

SETUP = {"token": "setup-token-for-tests", "name": "Abhishek", "phone": "9800000001", "pin": "8143"}


def test_ac_20_1_first_time_setup_needs_the_setup_token(monkeypatch, make_client):
    """AC-20.1: the platform admin is created once, only with the setup token."""
    c = make_client(signed_in=False)
    assert c.get("/api/v1/auth/state").json()["needs_setup"] is True
    assert c.post("/api/v1/auth/bootstrap", json=SETUP).json()["error"]["code"] == "not_configured"
    monkeypatch.setenv("KARYAHUB_BOOTSTRAP_TOKEN", "setup-token-for-tests")
    get_settings.cache_clear()
    wrong = c.post("/api/v1/auth/bootstrap", json=SETUP | {"token": "nope"})
    assert wrong.status_code == 403
    assert c.post("/api/v1/auth/bootstrap", json=SETUP | {"pin": "1234"}).status_code == 422  # weak PIN
    assert c.post("/api/v1/auth/bootstrap", json=SETUP).status_code == 200
    assert c.get("/api/v1/auth/state").json()["needs_setup"] is False
    login = sign_in(c, "9800000001", "8143").json()
    assert login["user"]["role"] == "platform_admin" and login["business"] is None
    assert login["permissions"] == ["manage_businesses"]


def test_ac_20_1_the_setup_token_recovers_the_platform_admin_only(platform, make_client):
    """AC-20.1: with the token and the same number the PIN is reset; another number can't take over."""
    c = make_client(signed_in=False)
    other = c.post("/api/v1/auth/bootstrap", json=SETUP | {"phone": "9800000002"})
    assert other.status_code == 403
    assert c.post("/api/v1/auth/bootstrap", json=SETUP | {"pin": "9051"}).status_code == 200
    assert sign_in(c, "9800000001", "8143").status_code == 401
    assert sign_in(c, "9800000001", "9051").status_code == 200


def test_ac_20_2_platform_admin_creates_a_business_with_its_first_owner(platform, make_client):
    """AC-20.2: the business and owner are created together; the temporary PIN is shown once."""
    r = platform.post(
        "/api/v1/platform/businesses",
        json={
            "name": "Shree Cool AC",
            "address": "Nashik",
            "gstin": "27AAAAA0000A1Z5",
            "state_code": "27",
            "owner_name": "Mina Rao",
            "owner_phone": "98111 00001",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert (
        body["business"]["name"] == "Shree Cool AC"
        and body["owner"]["phone"] == "9811100001"
        and len(body["pin"]) == 6
    )
    listed = platform.get("/api/v1/platform/businesses").json()["businesses"]
    shree = next(b for b in listed if b["name"] == "Shree Cool AC")
    assert shree["people"] == 1 and shree["owners"][0]["name"] == "Mina Rao" and shree["active"] is True
    assert any(b["is_demo"] for b in listed)
    owner = make_client(signed_in=False)
    assert sign_in(owner, "9811100001", body["pin"]).json()["business"]["id"] == body["business"]["id"]


def test_ac_20_2_bad_business_details_are_refused(platform):
    """AC-20.2: name, GSTIN, owner number and a duplicate owner number are checked."""
    good = {"name": "Shree Cool AC", "owner_name": "Mina Rao", "owner_phone": "9811100001"}
    assert platform.post("/api/v1/platform/businesses", json=good | {"name": "X"}).status_code == 422
    assert platform.post("/api/v1/platform/businesses", json=good | {"gstin": "BAD"}).status_code == 422
    assert platform.post("/api/v1/platform/businesses", json=good | {"owner_phone": "12"}).status_code == 422
    assert platform.post("/api/v1/platform/businesses", json=good).status_code == 201
    dup = platform.post("/api/v1/platform/businesses", json=good | {"name": "Second Firm"})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "phone_in_use"
    assert (
        len(platform.get("/api/v1/platform/businesses").json()["businesses"]) == 2
    )  # demo + one (no half-made firm)


def test_ac_20_2_turning_a_business_off_stops_its_people(platform, make_business, make_client):
    """AC-20.2: when a business is off its people are signed out and can't sign in; the demo stays on."""
    biz = make_business()
    assert biz["owner"].get("/api/v1/meta").status_code == 200
    bid = biz["business"]["id"]
    assert (
        platform.patch(f"/api/v1/platform/businesses/{bid}", json={"active": False}).json()["active"] is False
    )
    assert biz["owner"].get("/api/v1/meta").status_code == 401
    assert sign_in(make_client(signed_in=False), biz["phone"], biz["pin"]).status_code == 401
    assert platform.patch(f"/api/v1/platform/businesses/{bid}", json={"active": True}).status_code == 200
    assert sign_in(make_client(signed_in=False), biz["phone"], biz["pin"]).status_code == 200
    assert platform.patch("/api/v1/platform/businesses/b-demo", json={"active": False}).status_code == 403


def test_ac_20_3_the_platform_admin_sees_no_business_data(platform):
    """AC-20.3: team, jobs, AI and paperwork routes are closed to the platform admin."""
    for method, path, body in [
        ("get", "/api/v1/team", None),
        ("get", "/api/v1/team/audit", None),
        ("get", "/api/v1/meta", None),
        ("post", "/api/v1/pipeline/extract", {"text": "hi"}),
        (
            "post",
            "/api/v1/jobs/J-1/transitions",
            {"state": "NEW", "action": "close", "client_op_id": "op-0000001"},
        ),
    ]:
        r = getattr(platform, method)(path, **({"json": body} if body is not None else {}))
        assert r.status_code == 403, path


def test_ac_20_5_only_the_platform_admin_runs_businesses(make_business):
    """AC-20.5: a business owner can't list, create or switch off businesses."""
    owner = make_business()["owner"]
    assert owner.get("/api/v1/platform/businesses").status_code == 403
    assert (
        owner.post(
            "/api/v1/platform/businesses",
            json={"name": "Sneaky", "owner_name": "A B", "owner_phone": "9811100009"},
        ).status_code
        == 403
    )
    assert owner.patch("/api/v1/platform/businesses/b-demo", json={"active": False}).status_code == 403
    anon = owner.__class__(owner.app, headers=CSRF)
    assert anon.get("/api/v1/platform/businesses").status_code == 401


def test_ac_20_4_platform_admin_resets_an_owners_pin(platform, make_business, make_client):
    """AC-20.4: a locked-out owner gets a new temporary PIN and must choose their own."""
    biz = make_business()
    owner_id = platform.get("/api/v1/platform/businesses").json()["businesses"][-1]["owners"][0]["id"]
    r = platform.post(f"/api/v1/platform/owners/{owner_id}/reset-pin", json={})
    assert r.status_code == 200 and len(r.json()["pin"]) == 6
    assert biz["owner"].get("/api/v1/meta").status_code == 401  # old session ended
    assert sign_in(make_client(signed_in=False), biz["phone"], biz["pin"]).status_code == 401
    assert (
        sign_in(make_client(signed_in=False), biz["phone"], r.json()["pin"]).json()["user"]["must_change_pin"]
        is True
    )
    assert platform.post("/api/v1/platform/owners/u-demo-owner/reset-pin", json={}).status_code == 403


# ---------- US-21: forgot PIN ----------
def test_ac_21_1_a_code_lets_a_person_set_a_new_pin(make_client):
    """AC-21.1: ask for a code with a number, use it to set a new PIN; old sessions end; the code works once."""
    old = make_client("9900000202", "1357")
    c = make_client(signed_in=False)
    asked = c.post("/api/v1/auth/forgot", json={"phone": "9900000202"})
    assert asked.status_code == 200
    code = asked.json()["demo_code"]
    assert len(code) == 6
    bad = c.post("/api/v1/auth/reset-pin", json={"phone": "9900000202", "code": "000000", "new_pin": "6402"})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "bad_code"
    assert (
        c.post(
            "/api/v1/auth/reset-pin", json={"phone": "9900000202", "code": code, "new_pin": "1234"}
        ).status_code
        == 422
    )
    ok = c.post("/api/v1/auth/reset-pin", json={"phone": "9900000202", "code": code, "new_pin": "6402"})
    assert ok.status_code == 200
    assert old.get("/api/v1/meta").status_code == 401
    assert sign_in(c, "9900000202", "6402").status_code == 200
    again = c.post("/api/v1/auth/reset-pin", json={"phone": "9900000202", "code": code, "new_pin": "7391"})
    assert again.status_code == 400  # a code is single use


def test_ac_21_1_codes_expire_run_out_of_tries_and_are_rate_limited(make_client):
    """AC-21.1: 5 wrong tries kill a code; at most 3 codes per 15 minutes per number."""
    c = make_client(signed_in=False)
    code = c.post("/api/v1/auth/forgot", json={"phone": "9900000203"}).json()["demo_code"]
    for _ in range(5):
        assert (
            c.post(
                "/api/v1/auth/reset-pin", json={"phone": "9900000203", "code": "111111", "new_pin": "6402"}
            ).status_code
            == 400
        )
    assert (
        c.post(
            "/api/v1/auth/reset-pin", json={"phone": "9900000203", "code": code, "new_pin": "6402"}
        ).status_code
        == 400
    )
    c.post("/api/v1/auth/forgot", json={"phone": "9900000203"})
    c.post("/api/v1/auth/forgot", json={"phone": "9900000203"})
    fourth = c.post("/api/v1/auth/forgot", json={"phone": "9900000203"})
    assert fourth.status_code == 429 and fourth.json()["error"]["code"] == "too_many_codes"


def test_ac_21_1_an_expired_code_is_refused(monkeypatch, make_client):
    """AC-21.1: a code is only good for the configured time."""
    monkeypatch.setenv("KARYAHUB_OTP_TTL_SECONDS", "-1")
    get_settings.cache_clear()
    c = make_client(signed_in=False)
    code = c.post("/api/v1/auth/forgot", json={"phone": "9900000204"}).json()["demo_code"]
    assert (
        c.post(
            "/api/v1/auth/reset-pin", json={"phone": "9900000204", "code": code, "new_pin": "6402"}
        ).status_code
        == 400
    )


def test_ac_21_2_real_businesses_are_told_to_ask_their_owner_until_codes_are_live(make_business, make_client):
    """AC-21.2: until WhatsApp is live only demo accounts get a code; everyone else (known or not) gets the same answer."""
    biz = make_business()
    c = make_client(signed_in=False)
    known = c.post("/api/v1/auth/forgot", json={"phone": biz["phone"]})
    unknown = c.post("/api/v1/auth/forgot", json={"phone": "9000000099"})
    assert known.status_code == unknown.status_code == 503
    assert known.json() == unknown.json()
    assert (
        known.json()["error"]["code"] == "otp_unavailable"
        and "business owner" in known.json()["error"]["message"]
    )
    assert "demo_code" not in known.text


def test_ac_21_2_when_live_the_code_goes_out_by_whatsapp_and_never_in_the_answer(
    monkeypatch, make_business, make_client
):
    """AC-21.2: in live mode the code is sent through the WhatsApp adapter, and the reply doesn't contain it."""
    from karyahub.adapters import whatsapp as wa

    sent = []

    class Fake:
        async def send(self, to, kind, body):
            sent.append((to, kind, body))
            return {"status": "sent"}

    biz = make_business()
    monkeypatch.setenv("KARYAHUB_MODE", "live")
    get_settings.cache_clear()
    monkeypatch.setattr(
        "karyahub.accounts.routes.get_adapters", lambda settings: type("A", (), {"whatsapp": Fake()})()
    )
    c = make_client(signed_in=False)
    r = c.post("/api/v1/auth/forgot", json={"phone": biz["phone"]})
    assert r.status_code == 200 and "demo_code" not in r.text
    assert len(sent) == 1 and sent[0][0] == biz["phone"] and "KaryaHub code is" in sent[0][2]
    code = sent[0][2].split("code is ")[1][:6]
    ok = c.post("/api/v1/auth/reset-pin", json={"phone": biz["phone"], "code": code, "new_pin": "9051"})
    assert ok.status_code == 200
    assert wa is not None


# ---------- configuration ----------
def test_neon_addresses_are_converted_for_the_async_driver():
    """The database address from Neon (postgresql://...?sslmode=require) works with the async driver."""
    url, args = async_url(
        "postgresql://u:p@ep-x-pooler.ap-south-1.aws.neon.tech/karyahub_master_db?sslmode=require&channel_binding=require"
    )
    assert url == "postgresql+asyncpg://u:p@ep-x-pooler.ap-south-1.aws.neon.tech/karyahub_master_db"
    assert args == {"statement_cache_size": 0, "ssl": True}
    assert async_url("")[0].startswith("sqlite+aiosqlite")
    local, local_args = async_url("postgresql://u:p@localhost:5432/karyahub?sslmode=disable")
    assert local.startswith("postgresql+asyncpg://") and "ssl" not in local_args


def test_a_real_database_needs_the_pin_secret(monkeypatch, make_client):
    """With a database address set but no KARYAHUB_PIN_PEPPER, the app refuses to run accounts (fails closed)."""
    monkeypatch.setenv("KARYAHUB_DATABASE_URL", "postgresql://u:p@localhost:5432/none")
    get_settings.cache_clear()
    c = make_client(signed_in=False)
    r = c.post("/api/v1/auth/sign-in", json={"phone": "9900000201", "pin": "2468"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "not_configured"
    assert c.get("/api/health").json()["database"] == "not_configured"


def test_health_reports_the_database_without_secrets(client):
    """/api/health says whether the database answers, and never shows its address."""
    body = client.get("/api/health").json()
    assert body["database"] == "memory" and body["version"] == "0.4.0"
    assert "postgres" not in str(body)


@pytest.mark.parametrize("name", ["KARYAHUB_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL"])
def test_the_database_address_is_read_from_any_of_the_usual_names(monkeypatch, name):
    """Neon's Vercel integration sets DATABASE_URL; KARYAHUB_DATABASE_URL and POSTGRES_URL also work."""
    monkeypatch.setenv(name, "postgresql://u:p@host/db")
    get_settings.cache_clear()
    assert get_settings().database_url == "postgresql://u:p@host/db"
