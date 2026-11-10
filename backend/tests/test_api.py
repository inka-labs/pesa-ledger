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


def test_allocation_rules(client, settings):
    g = settings["groups"][0]["id"]
    body = {**settings, "allocation": {"rule": "50-30-20", "maps": {"50-30-20": {f"g:{g}": "needs"}},
            "custom": [{"id": "keep", "name": "Keep", "pct": 30, "kind": "min"}], "leftover": True}}
    assert client.put("/api/settings", json=body).status_code == 200
    assert client.put("/api/settings", json={**body, "allocation": {"custom": [{"id": "x", "name": "X", "pct": 140}]}}).status_code == 400
    assert client.put("/api/settings", json={**body, "allocation": {"maps": {"r": {"zz:1": "a"}}}}).status_code == 400


def test_names_and_colours_are_unique(client, settings):
    g0, g1 = settings["groups"][0], settings["groups"][1]
    clash = lambda **kw: {**settings, "groups": [g0, {**g1, **kw}] + settings["groups"][2:]}
    r = client.put("/api/settings", json=clash(name=" " + g0["name"].upper() + " "))
    assert r.status_code == 400 and "Two groups are called" in r.json()["detail"]
    assert client.put("/api/settings", json=clash(slot=g0["slot"], color=None)).status_code == 400
    both = {**settings, "groups": [{**g0, "color": "#AABBCC"}, {**g1, "color": "#aabbcc"}] + settings["groups"][2:]}
    assert client.put("/api/settings", json=both).status_code == 400
    kinds = [{"id": "a", "name": "Spending", "effect": "out"}, {"id": "b", "name": "spending", "effect": "out"}]
    assert client.put("/api/settings", json={**settings, "kinds": kinds}).status_code == 400
    c0 = settings["cats"][0]
    dup = {**settings, "cats": settings["cats"] + [{**c0, "id": "dupe"}]}
    assert client.put("/api/settings", json=dup).status_code == 400
    assert client.put("/api/settings", json=settings).status_code == 200


# Safety ----------------------------------------------------------------------------------------

def test_an_emptied_token_file_is_never_accepted(ledger_home):
    from pesa_ledger.app import create_app
    ledger_home.mkdir(parents=True, exist_ok=True)
    (ledger_home / "session_token").write_text("")
    app = create_app()
    assert len(app.state.token) >= 32
    assert TestClient(app, base_url=BASE).get("/api/ledger").status_code == 401
    assert stat.S_IMODE((ledger_home / "session_token").stat().st_mode) == 0o600


def test_another_local_port_is_another_site(client):
    for origin in ("http://127.0.0.1:9999", "http://localhost:8768"):
        assert client.post("/api/quit", headers={"origin": origin}).status_code == 403
    assert client.post("/api/quit", headers={"sec-fetch-site": "same-site"}).status_code == 403
    assert client.post("/api/quit", headers={"origin": BASE}).status_code == 200
    assert client.post("/api/quit").status_code == 200  # the launcher sends no Origin


def test_a_damaged_file_is_set_aside_not_overwritten(client, settings, ledger_home):
    client.put("/api/settings", json=settings)
    client.put("/api/years/2026", json=YEAR)
    (ledger_home / "years" / "2026.json").write_text('{"actual": {"01": ')
    got = client.get("/api/ledger").json()
    assert "2026" not in got["years"] and "2026.json" in got["problems"][0]
    kept = list((ledger_home / "years").glob("2026.json.damaged-*"))
    assert len(kept) == 1 and kept[0].read_text().startswith('{"actual"')
    assert "problems" not in client.get("/api/ledger").json()  # said once; the copy stays


def test_a_failed_write_leaves_the_old_file_and_no_temp(ledger_home, monkeypatch):
    import pytest
    from pesa_ledger.core import store
    path = ledger_home / "x.json"
    store.write_json(path, {"a": 1})
    monkeypatch.setattr(store.os, "fsync", lambda fd: (_ for _ in ()).throw(OSError("disk full")))
    with pytest.raises(OSError):
        store.write_json(path, {"a": 2})
    assert json.loads(path.read_text()) == {"a": 1}
    assert [p.name for p in ledger_home.iterdir()] == ["x.json"]


def test_restore_keeps_years_it_writes_and_drops_the_rest(client, settings, ledger_home):
    client.put("/api/settings", json=settings)
    client.put("/api/years/2026", json=YEAR)
    name = client.post("/api/backups").json()["name"]
    client.put("/api/years/2027", json=YEAR)
    got = client.post(f"/api/backups/{name}/restore").json()
    assert sorted(got["years"]) == ["2026"]
    assert sorted(p.name for p in (ledger_home / "years").iterdir()) == ["2026.json"]


def test_restore_refuses_a_backup_with_broken_references(client, settings, ledger_home):
    client.put("/api/settings", json=settings)
    bad = {"taken": "", "settings": {**settings, "cats": [{"id": "x", "name": "X", "group": "nope"}]}, "years": {}}
    (ledger_home / "backups").mkdir(exist_ok=True)
    (ledger_home / "backups" / "manual-2026-01-01-000000.json").write_text(json.dumps(bad))
    r = client.post("/api/backups/manual-2026-01-01-000000.json/restore")
    assert r.status_code == 400 and "group that doesn't exist" in r.json()["detail"]


def test_two_goals_cannot_share_an_id(client, settings):
    two = {**settings, "goals": settings["goals"] * 2}
    r = client.put("/api/settings", json=two)
    assert r.status_code == 400 and "Two goals" in r.json()["detail"]


def test_added_expenses_are_kept(client, settings):
    client.put("/api/settings", json=settings)
    doc = {**YEAR, "actual": {"01": {"ess_0": 1550}},
           "entries": {"01": {"ess_0": [{"amount": 1250, "note": "Naivas", "day": 3}, {"amount": 300}]}}}
    r = client.put("/api/years/2026", json=doc)
    assert r.status_code == 200
    got = client.get("/api/ledger").json()["years"]["2026"]["entries"]["01"]["ess_0"]
    assert got[0] == {"amount": 1250, "note": "Naivas", "day": 3} and got[1]["amount"] == 300
    assert client.put("/api/years/2026", json={**doc, "entries": {"01": {"ess_0": [{"amount": 1, "day": 40}]}}}).status_code == 400


def test_goal_items_and_money_added(client, settings):
    g = {**settings["goals"][0], "items": [{"id": "i1", "name": "Deposit", "amount": 80000, "done": True}],
         "deposits": [{"ym": "2026-10", "amount": 5000}]}
    saved = client.put("/api/settings", json={**settings, "goals": [g]}).json()
    assert saved["goals"][0]["items"][0]["done"] is True and saved["goals"][0]["deposits"][0]["amount"] == 5000
    bad = {**g, "items": [{"id": "i1", "name": "Deposit", "amount": -1}]}
    assert client.put("/api/settings", json={**settings, "goals": [bad]}).status_code == 400
