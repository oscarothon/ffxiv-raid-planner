"""Shared pytest fixtures for the FFXIV Raid Planner backend test suite.

Every test gets an isolated SQLite database via ``DATABASE_PATH`` and a freshly
reloaded ``server.app`` module so the module-level ``init_db()`` call runs
against the temp DB. Helpers create users/statics through the public HTTP
surface to mirror real usage.
"""
from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@pytest.fixture
def app_module(tmp_path, monkeypatch):
    """Reload ``server.app`` with an isolated SQLite DB and clean env.

    Test code should depend on this fixture (or ``app`` / ``client``) instead of
    importing ``server.app`` at module scope — otherwise the production
    ``data.db`` would be touched.
    """
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET", raising=False)
    monkeypatch.setenv("APP_TZ_OFFSET_HOURS", "-4")

    for mod_name in ("server.app", "server.telegram", "server.auth", "server.db"):
        if mod_name in sys.modules:
            del sys.modules[mod_name]

    return importlib.import_module("server.app")


@pytest.fixture
def app(app_module):
    flask_app = app_module.app
    flask_app.config.update(TESTING=True)
    return flask_app


@pytest.fixture
def client(app):
    return app.test_client()


# ---------- Helpers ----------

class APIClient:
    """Thin wrapper around Flask's test_client with JSON-aware helpers.

    Tests can do::

        api = APIClient(client)
        res = api.register("alice", "secret123")
        assert res.status_code == 200
    """

    def __init__(self, client):
        self.client = client

    def _post(self, path, body=None):
        return self.client.post(path, json=body or {})

    def _put(self, path, body=None):
        return self.client.put(path, json=body or {})

    def _get(self, path, headers=None):
        return self.client.get(path, headers=headers or {})

    def _delete(self, path):
        return self.client.delete(path)

    # Auth
    def register(self, username, password="secret123"):
        return self._post("/api/register", {"username": username, "password": password})

    def login(self, username, password="secret123"):
        return self._post("/api/login", {"username": username, "password": password})

    def logout(self):
        return self._post("/api/logout")

    def me(self):
        return self._get("/api/me")

    # Statics
    def create_static(self, name="Test Static"):
        return self._post("/api/statics", {"name": name})

    def join_static(self, invite_code):
        return self._post("/api/statics/join", {"invite_code": invite_code})

    def switch_static(self, static_id):
        return self._post("/api/statics/switch", {"static_id": static_id})

    def my_statics(self):
        return self._get("/api/statics/mine")

    def members(self, static_id):
        return self._get(f"/api/statics/{static_id}/members")

    def set_member_role(self, static_id, user_id, role):
        return self._put(f"/api/statics/{static_id}/members/{user_id}/role", {"role": role})

    def remove_member(self, static_id, user_id):
        return self._delete(f"/api/statics/{static_id}/members/{user_id}")

    # State
    def get_state(self, etag=None):
        headers = {"If-None-Match": etag} if etag else None
        return self._get("/api/state", headers=headers)

    def put_state(self, data):
        return self._put("/api/state", data)

    # Character
    def get_character(self):
        return self._get("/api/character")

    def put_character(self, character):
        return self._put("/api/character", character)

    def claim_slot(self, slot_id):
        return self._post("/api/character/claim-slot", {"slot_id": slot_id})

    # Pending
    def list_pending(self):
        return self._get("/api/pending")

    def approve_pending(self, pending_id):
        return self._post(f"/api/pending/{pending_id}/approve")

    def reject_pending(self, pending_id):
        return self._post(f"/api/pending/{pending_id}/reject")

    # Telegram
    def telegram_status(self):
        return self._get("/api/telegram/status")

    def telegram_unbind(self):
        return self._post("/api/telegram/unbind")


@pytest.fixture
def api(client):
    return APIClient(client)


@pytest.fixture
def admin_user(api):
    """First user — auto-promoted to admin of the global static."""
    res = api.register("admin_user")
    assert res.status_code == 200, res.get_json()
    return res.get_json()


@pytest.fixture
def member_user(api, admin_user):
    """Second user — joins after admin exists; auto-approved? No — pending.

    We approve them via the admin to leave them as a member of the global static.
    """
    # Register pending
    res = api.register("member_user")
    assert res.status_code == 202, res.get_json()
    # Admin approves
    api.logout()
    api.login("admin_user")
    pending = api.list_pending().get_json()
    assert pending, "expected pending registration"
    pending_id = pending[0]["id"]
    api.approve_pending(pending_id)
    api.logout()
    # Log back in as the new member
    res = api.login("member_user")
    assert res.status_code == 200
    return res.get_json()


@pytest.fixture
def sample_state():
    """Minimal valid state payload — agents can extend as needed."""
    return {
        "roster": [],
        "events": [],
        "customContents": [],
        "expansions": [
            {"id": "arr", "name": "A Realm Reborn", "levelCap": 50, "order": 1},
            {"id": "dt", "name": "Dawntrail", "levelCap": 100, "order": 6},
        ],
    }
