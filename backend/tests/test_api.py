import json
import stat

from fastapi.testclient import TestClient

from conftest import BASE

YEAR = {"actual": {"01": {"inc_0": 400000, "ess_0": 18000}}, "budget": {"11": {"ess_0": 40000}},
        "plan": {"inc_0": 6300000, "ess_0": 216000}, "notes": {"01": "First month"}}


def test_api_needs_sign_in(app):
    anon = TestClient(app, base_url=BASE)
    r = anon.get("/api/ledger")
    assert r.status_code == 401 and "Not signed in" in r.json()["detail"]
    assert anon.get("/auth?token=wrong").status_code == 401


def test_other_hosts_and_origins_refused(client):
    assert client.get("/api/ledger", headers={"host": "evil.example"}).status_code == 403
    r = client.put("/api/settings", json={}, headers={"origin": "https://evil.example"})
    assert r.status_code == 403


def test_empty_ledger(client):
    assert client.get("/api/ledger").json() == {"settings": None, "years": {}}


def test_settings_and_years_round_trip(client, settings, ledger_home):
    saved = client.put("/api/settings", json=settings).json()
    assert saved["goals"][0]["from"] == "2026-01"  # written back under its JSON name
    assert client.put("/api/years/2026", json={**YEAR, "year": 2026}).status_code == 200
    got = client.get("/api/ledger").json()
    assert got["settings"]["cats"][1]["name"] == "Rent"
    assert got["years"]["2026"]["actual"]["01"]["inc_0"] == 400000
    assert got["years"]["2026"]["budget"]["11"]["ess_0"] == 40000
    # finances are owner-only on disk
    mode = stat.S_IMODE((ledger_home / "years" / "2026.json").stat().st_mode)
    assert mode == 0o600


def test_older_settings_get_the_default_types_and_palette(client, settings):
    saved = client.put("/api/settings", json=settings).json()
    assert [k["id"] for k in saved["kinds"]] == ["income", "saving", "expense"]
    assert saved["palette"] == "pesa"


def test_custom_types_and_colours(client, settings):
    custom = {**settings,
              "kinds": [*settings.get("kinds", []), {"id": "income", "name": "Income", "effect": "in"},
                        {"id": "expense", "name": "Spending", "effect": "out"},
                        {"id": "k1", "name": "Transfers", "effect": "none"}],
              "groups": [*settings["groups"], {"id": "tr", "name": "Between accounts", "kind": "k1", "slot": 5, "color": "#aa3377"}],
              "palette": "viridis"}
    saved = client.put("/api/settings", json=custom).json()
    assert saved["groups"][-1]["color"] == "#aa3377" and saved["palette"] == "viridis"
    bad_type = {**custom, "groups": [{**custom["groups"][0], "kind": "nope"}]}
    r = client.put("/api/settings", json=bad_type)
    assert r.status_code == 400 and "type that doesn't exist" in r.json()["detail"]
    assert client.put("/api/settings", json={**custom, "groups": [{**custom["groups"][-1], "color": "red"}]}).status_code == 400
    assert client.put("/api/settings", json={**custom, "kinds": [{"id": "x", "name": "X", "effect": "sideways"}]}).status_code == 400


def test_bad_writes_are_refused_with_a_reason(client, settings):
    bad_cat = {**settings, "cats": [{"id": "x", "name": "Orphan", "group": "nope"}]}
    r = client.put("/api/settings", json=bad_cat)
    assert r.status_code == 400 and "group that doesn't exist" in r.json()["detail"]
    r = client.put("/api/years/2026", json={"actual": {"13": {"a": 1}}})
    assert r.status_code == 400
    r = client.put("/api/years/2026", json={"actual": {"01": {"a": "lots"}}})
    assert r.status_code == 400
    assert client.put("/api/years/1200", json={}).status_code == 400
    assert client.put("/api/settings", json={**settings, "surprise": 1}).status_code == 400


def test_delete_year(client):
    client.put("/api/years/2025", json=YEAR)
    assert client.delete("/api/years/2025").status_code == 204
    assert client.get("/api/ledger").json()["years"] == {}


def test_daily_backup_then_restore(client, settings, ledger_home):
    client.put("/api/settings", json=settings)
    client.put("/api/years/2026", json=YEAR)
    # the first change of the day snapshots the ledger as it was before it (empty: nothing kept),
    # so take a manual backup of the state we want back
    name = client.post("/api/backups").json()["name"]
    client.put("/api/years/2026", json={"actual": {"01": {"inc_0": 1}}})
    client.put("/api/years/2027", json={"plan": {"inc_0": 5}})
    listed = client.get("/api/backups").json()["backups"]
    assert any(b["name"] == name for b in listed)
    restored = client.post(f"/api/backups/{name}/restore").json()
    assert restored["years"]["2026"]["actual"]["01"]["inc_0"] == 400000
    assert "2027" not in restored["years"]
    # restoring keeps a copy of what it replaced
    assert any(p.name.startswith("before-restore-") for p in (ledger_home / "backups").iterdir())


def test_daily_backup_keeps_yesterdays_state(client, settings, ledger_home):
    client.put("/api/settings", json=settings)
    client.put("/api/years/2026", json=YEAR)
    # pretend today's backup was yesterday's: the next change makes a new one holding the current ledger
    for p in (ledger_home / "backups").glob("auto-*.json"):
        p.unlink()
    client.put("/api/years/2026", json={"actual": {}})
    auto = next((ledger_home / "backups").glob("auto-*.json"))
    assert json.loads(auto.read_text())["years"]["2026"]["actual"]["01"]["inc_0"] == 400000


def test_restore_rejects_odd_names(client):
    # a path in the name never reaches the restore code (no such route)
    assert client.post("/api/backups/..%2Fsettings.json/restore").status_code in (400, 404, 405)
    assert client.post("/api/backups/nothing.json/restore").status_code == 400


def test_version(client):
    body = client.get("/api/version").json()
    assert body["name"] == "Pesa Ledger" and "autostart" in body


def test_one_offs_round_trip_and_are_checked(client):
    year = {"actual": {"11": {"car": 1150000}}, "oneoff": {"11": {"car": {"amount": 1150000, "note": " Car "}}}}
    assert client.put("/api/years/2025", json=year).status_code == 200
    assert client.get("/api/ledger").json()["years"]["2025"]["oneoff"]["11"]["car"] == {"amount": 1150000, "note": "Car"}
    assert client.put("/api/years/2025", json={"oneoff": {"11": {"car": {"note": "no amount"}}}}).status_code == 400


def test_repeats_funds_accounts_and_balances(client, settings):
    cats = [{**settings["cats"][0], "repeat": 42500, "fund": {"target": 60000, "due": "2027-01", "from": "2026-02", "every": 12}}] + settings["cats"][1:]
    body = {**settings, "cats": cats, "accounts": [{"id": "mmf", "name": "MMF", "cats": [cats[0]["id"]]}, {"id": "loan", "name": "Loan", "debt": True}],
            "health": {"ef": "a:mmf", "essential": [settings["groups"][0]["id"]], "rent": cats[0]["id"]}}
    saved = client.put("/api/settings", json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()["cats"][0]["fund"]["from"] == "2026-02"
    assert client.put("/api/settings", json={**body, "health": {"ef": "x:mmf"}}).status_code == 400
    assert client.put("/api/settings", json={**body, "accounts": body["accounts"] * 2}).status_code == 400
    assert client.put("/api/years/2026", json={"balances": {"10": {"mmf": 250000, "loan": 40000}}}).status_code == 200
    assert client.get("/api/ledger").json()["years"]["2026"]["balances"]["10"]["mmf"] == 250000
