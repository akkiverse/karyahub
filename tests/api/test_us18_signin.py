"""US-18: sign-in on the server with mobile number and PIN (CR-0005)."""

from conftest import CSRF, DEMO_OWNER, sign_in
from karyahub.accounts import security
from karyahub.db.engine import get_engine
from karyahub.settings import get_settings
from sqlalchemy import text

BAD = "That mobile number and PIN don't match an active account. Check them, or use Forgot PIN."


def test_ac_18_1_sign_in_sets_a_session_and_me_says_who(make_client):
    """AC-18.1: a right number and PIN signs in, sets an HttpOnly cookie, and /auth/me knows the person."""
    c = make_client(signed_in=False)
    assert c.get("/api/v1/auth/me").json() == {"signed_in": False}
    r = sign_in(c, *DEMO_OWNER)
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["name"] == "Akash Mehta" and body["user"]["role"] == "owner"
    assert body["business"]["name"] == "CoolCare AC Services" and body["business"]["is_demo"] is True
    assert "manage_team" in body["permissions"]
    cookie = r.headers["set-cookie"]
    assert "kh_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert c.get("/api/v1/auth/me").json()["user"]["phone"] == "9900000201"


def test_ac_18_1_sign_out_ends_the_session(make_client):
    """AC-18.1: after signing out the old cookie no longer works."""
    c = make_client(*DEMO_OWNER)
    token = c.cookies.get("kh_session")
    assert c.post("/api/v1/auth/sign-out").status_code == 200
    c.cookies.set("kh_session", token)
    assert c.get("/api/v1/auth/me").json() == {"signed_in": False}


def test_ac_18_2_every_wrong_answer_reads_the_same(make_client, make_business):
    """AC-18.2: wrong PIN, unknown number and a switched-off person all get one message."""
    biz = make_business()
    owner = biz["owner"]
    add = owner.post(
        "/api/v1/team",
        json={
            "name": "Ravi Kale",
            "phone": "9822200002",
            "role": "technician",
            "pin": "6402",
            "must_change_pin": False,
        },
    )
    assert add.status_code == 201
    member_id = add.json()["member"]["id"]
    assert owner.patch(f"/api/v1/team/{member_id}", json={"active": False}).status_code == 200
    c = make_client(signed_in=False)
    messages = {
        sign_in(c, "9900000201", "0000").json()["error"]["message"],  # right number, wrong PIN
        sign_in(c, "9000000099", "2468").json()["error"]["message"],  # no such number
        sign_in(c, "9822200002", "6402").json()["error"]["message"],  # switched off
        sign_in(c, "12345", "2468").json()["error"]["message"],  # not a mobile number
    }
    assert messages == {BAD}


def test_ac_18_3_five_wrong_tries_lock_a_number_for_a_while(make_client):
    """AC-18.3: 5 wrong PINs block the number (even the right PIN), whether or not it has an account."""
    c = make_client(signed_in=False)
    for _ in range(5):
        assert sign_in(c, "9900000202", "1111").status_code == 401
    locked = sign_in(c, "9900000202", "1357")
    assert locked.status_code == 429 and locked.json()["error"]["code"] == "locked"
    assert "Forgot PIN" in locked.json()["error"]["message"]
    for _ in range(5):
        sign_in(c, "9000000077", "1111")  # a number with no account behaves the same
    assert sign_in(c, "9000000077", "1111").status_code == 429


def test_ac_18_4_pins_are_stored_only_as_salted_hashes():
    """AC-18.4: hashes differ per person, depend on the server secret, and verify only the right PIN."""
    a, b = security.hash_pin("2468", "pepper-1"), security.hash_pin("2468", "pepper-1")
    assert a != b and "2468" not in a
    assert security.verify_pin("2468", a, "pepper-1")
    assert not security.verify_pin("2468", a, "pepper-2")
    assert not security.verify_pin("2469", a, "pepper-1")
    assert not security.verify_pin("2468", None, "pepper-1")


def test_ac_18_4_the_database_holds_no_plain_pin(make_client):
    """AC-18.4: the users table has salted hashes, never the PIN itself."""
    c = make_client(*DEMO_OWNER)

    async def rows():
        async with get_engine(get_settings()).connect() as conn:
            return (await conn.execute(text("select phone, pin_hash from users"))).all()

    data = c.portal.call(rows)
    assert len(data) >= 4
    for _, stored in data:
        assert stored.startswith("scrypt$")
        assert not any(pin in stored for pin in ("2468", "1357", "8642", "9753"))


def test_ac_18_4_weak_pins_are_refused():
    """AC-18.4: repeated digits, simple runs and wrong lengths can't be PINs; generated PINs are fine."""
    for bad in ["1111", "1234", "4321", "123456", "12", "1234567", "abcd", ""]:
        assert security.pin_problem(bad), bad
    for good in ["2468", "7391", "135790"]:
        assert security.pin_problem(good) is None, good
    assert all(security.pin_problem(security.generate_pin()) is None for _ in range(50))


def test_ac_18_5_changing_data_needs_the_app_header(make_client):
    """AC-18.5: a request with a session cookie but without the app's header is refused (cross-site safety)."""
    c = make_client(*DEMO_OWNER)
    r = c.post("/api/v1/pipeline/extract", json={"text": "hello"}, headers={"X-Requested-With": ""})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf"
    assert c.post("/api/v1/pipeline/extract", json={"text": "hello"}, headers=CSRF).status_code == 200


def test_ac_18_5_a_forged_or_expired_session_is_not_signed_in(make_client):
    """AC-18.5: a made-up cookie value means signed out."""
    c = make_client(signed_in=False)
    c.cookies.set("kh_session", "not-a-real-session")
    assert c.get("/api/v1/auth/me").json() == {"signed_in": False}
    assert c.get("/api/v1/meta").status_code == 401


def test_ac_18_6_a_temporary_pin_must_be_changed_before_anything_else(platform, make_client):
    """AC-18.6: a person on a temporary PIN can only choose their own PIN until they do."""
    r = platform.post(
        "/api/v1/platform/businesses",
        json={
            "name": "Temp PIN Traders",
            "owner_name": "Mina Rao",
            "owner_phone": "9833300003",
            "owner_pin": "7391",
        },
    )
    assert r.status_code == 201
    c = make_client(signed_in=False)
    login = sign_in(c, "9833300003", "7391").json()
    assert login["user"]["must_change_pin"] is True
    blocked = c.get("/api/v1/team")
    assert blocked.status_code == 403 and blocked.json()["error"]["code"] == "pin_change_required"
    weak = c.post("/api/v1/auth/change-pin", json={"current_pin": "7391", "new_pin": "1234"})
    assert weak.status_code == 422
    wrong = c.post("/api/v1/auth/change-pin", json={"current_pin": "0000", "new_pin": "5826"})
    assert wrong.status_code == 400
    assert (
        c.post("/api/v1/auth/change-pin", json={"current_pin": "7391", "new_pin": "5826"}).status_code == 200
    )
    assert c.get("/api/v1/team").status_code == 200
    again = make_client(signed_in=False)
    assert sign_in(again, "9833300003", "7391").status_code == 401
    assert sign_in(again, "9833300003", "5826").json()["user"]["must_change_pin"] is False
