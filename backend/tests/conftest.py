import pytest
from fastapi.testclient import TestClient

from pesa_ledger import brand

BASE = "http://127.0.0.1:8768"


@pytest.fixture(autouse=True)
def ledger_home(tmp_path, monkeypatch):
    """Every test gets an empty ledger folder of its own, never the real ~/.pesa-ledger."""
    monkeypatch.setenv(brand.HOME_ENV, str(tmp_path / "home"))
    return tmp_path / "home"


@pytest.fixture
def app():
    from pesa_ledger.app import create_app
    return create_app()


@pytest.fixture
def client(app):
    c = TestClient(app, base_url=BASE)
    assert c.get(f"/auth?token={app.state.token}", follow_redirects=False).status_code == 303
    return c


@pytest.fixture
def settings():
    return {
        "currency": "KES", "alt": {"code": "USD", "rate": 129},
        "groups": [{"id": "inc", "name": "Income", "kind": "income", "slot": 0},
                   {"id": "ess", "name": "Essentials", "kind": "expense", "slot": 3}],
        "cats": [{"id": "inc_0", "name": "Salary", "group": "inc"}, {"id": "ess_0", "name": "Rent", "group": "ess"}],
        "goals": [{"id": "g1", "name": "Emergency fund", "target": 600000, "deadline": "2026-12", "start": 0, "from": "2026-01", "cats": []}],
    }
