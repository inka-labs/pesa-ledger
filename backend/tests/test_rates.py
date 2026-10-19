import time

import httpx
import pytest

from pesa_ledger import rates


def answer(source_name, usd=0.0077):
    def fetch(base):
        return {"rates": {"USD": usd, "EUR": 0.0066, "bad": 1, "XYZ": -1}, "date": "2026-10-19", "source": source_name, "source_url": ""}
    fetch.__name__ = source_name
    return fetch


def down(base):
    raise httpx.ConnectError("offline")


@pytest.fixture
def sources(monkeypatch):
    def use(*fns):
        monkeypatch.setattr(rates, "SOURCES", list(fns))
    return use


def test_first_source_answers_and_is_cached(sources, client):
    sources(answer("first"))
    body = client.get("/api/rates?base=kes").json()
    assert body["base"] == "KES" and body["source"] == "first" and not body["stale"]
    assert body["rates"]["USD"] == 0.0077 and body["rates"]["KES"] == 1.0
    assert "bad" not in body["rates"] and "XYZ" not in body["rates"]  # junk dropped
    sources(down)  # served from the cache, no network needed
    assert client.get("/api/rates?base=KES").json()["source"] == "first"


def test_falls_back_to_the_second_source(sources, client):
    sources(down, answer("second"))
    assert client.get("/api/rates?base=KES").json()["source"] == "second"


def test_refresh_fetches_again(sources, client):
    sources(answer("first", usd=0.0077))
    client.get("/api/rates?base=KES")
    sources(answer("first", usd=0.0080))
    assert client.get("/api/rates?base=KES&refresh=true").json()["rates"]["USD"] == 0.0080


def test_old_cache_is_served_stale_when_offline(sources, client, ledger_home):
    sources(answer("first"))
    client.get("/api/rates?base=KES")
    path = ledger_home / "rates" / "KES.json"
    import json
    body = json.loads(path.read_text())
    body["fetched_at"] = time.time() - rates.MAX_AGE - 10
    path.write_text(json.dumps(body))
    sources(down, down)
    got = client.get("/api/rates?base=KES").json()
    assert got["stale"] is True and "Couldn't reach" in got["error"] and got["rates"]["USD"] == 0.0077


def test_nothing_cached_and_offline_is_an_error(sources, client):
    sources(down)
    r = client.get("/api/rates?base=KES")
    assert r.status_code == 503 and "Couldn't reach" in r.json()["detail"]


def test_bad_code(client):
    assert client.get("/api/rates?base=shillings").status_code == 503


@pytest.mark.skipif("not config.getoption('--live')", reason="hits the real services: pytest --live")
def test_live_sources_include_kes():
    for source in rates.SOURCES:
        got = source("KES")
        assert 0.001 < got["rates"]["USD"] < 0.1, source.__name__
