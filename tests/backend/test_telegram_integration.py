"""Integration tests for Telegram-related routes and side effects in server/app.py.

Scope:
- _get_static_telegram_chat_id / _set_static_telegram_chat_id
- POST /api/telegram/webhook
- GET  /api/telegram/status
- POST /api/telegram/unbind
- _notify_new_raid_events  (triggered via PUT /api/state)
- _maybe_send_reminders    (triggered via GET /api/state)
- _evaluate_quorum_opportunities side-effect (triggered via PUT /api/state)

Telegram HTTP calls are patched via:
    monkeypatch.setattr("server.app.tg.send_group_message", fake_send)
"""
from __future__ import annotations

import importlib
import sys
from datetime import date, timedelta
from unittest.mock import MagicMock

import pytest
from freezegun import freeze_time

# ──────────────────────────────────────────────────────────────────────────────
# Markers
# ──────────────────────────────────────────────────────────────────────────────
pytestmark = [pytest.mark.telegram, pytest.mark.integration]


# ──────────────────────────────────────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def tg_app_module(tmp_path, monkeypatch):
    """Reload server.app with TELEGRAM_BOT_TOKEN configured + isolated DB."""
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "tg_test.db"))
    monkeypatch.setenv("SECRET_KEY", "tg-test-secret-key")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "fake-token-123")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "test-webhook-secret")
    monkeypatch.setenv("APP_TZ_OFFSET_HOURS", "-4")

    for mod in ("server.app", "server.telegram", "server.auth", "server.db"):
        sys.modules.pop(mod, None)

    mod = importlib.import_module("server.app")
    return mod


@pytest.fixture
def tg_app(tg_app_module):
    flask_app = tg_app_module.app
    flask_app.config.update(TESTING=True)
    return flask_app


@pytest.fixture
def tg_client(tg_app):
    return tg_app.test_client()


# ──────────────────────────────────────────────────────────────────────────────
# Helper: build fake send_group_message tracker
# ──────────────────────────────────────────────────────────────────────────────

def make_fake_send():
    sent = []

    def fake_send(chat_id, text):
        sent.append((chat_id, text))
        return True

    return sent, fake_send


# ──────────────────────────────────────────────────────────────────────────────
# Helper: register + login via test client
# ──────────────────────────────────────────────────────────────────────────────

def register_and_login(client, username, password="secret123"):
    res = client.post("/api/register", json={"username": username, "password": password})
    return res


def login(client, username, password="secret123"):
    return client.post("/api/login", json={"username": username, "password": password})


def get_active_static_id(client):
    res = client.get("/api/me")
    return res.get_json().get("active_static_id")


def put_state(client, data):
    return client.put("/api/state", json=data)


def get_state(client):
    return client.get("/api/state")


# ──────────────────────────────────────────────────────────────────────────────
# _get_static_telegram_chat_id / _set_static_telegram_chat_id
# ──────────────────────────────────────────────────────────────────────────────

class TestChatIdHelpers:
    def test_unset_returns_none(self, tg_app_module):
        static_id = tg_app_module._ensure_global_static()
        result = tg_app_module._get_static_telegram_chat_id(static_id)
        assert result is None

    def test_set_then_get_returns_chat_id(self, tg_app_module):
        static_id = tg_app_module._ensure_global_static()
        tg_app_module._set_static_telegram_chat_id(static_id, 99887766)
        result = tg_app_module._get_static_telegram_chat_id(static_id)
        assert result == "99887766"

    def test_set_to_none_clears_it(self, tg_app_module):
        static_id = tg_app_module._ensure_global_static()
        tg_app_module._set_static_telegram_chat_id(static_id, 12345)
        tg_app_module._set_static_telegram_chat_id(static_id, None)
        result = tg_app_module._get_static_telegram_chat_id(static_id)
        assert result is None

    def test_set_on_nonexistent_static_is_noop(self, tg_app_module):
        """Setting on a non-existent static ID should not raise (UPDATE on missing row)."""
        # No exception expected — sqlite UPDATE on missing row is a no-op
        tg_app_module._set_static_telegram_chat_id(999999, 12345)
        # And get returns None (no row exists)
        result = tg_app_module._get_static_telegram_chat_id(999999)
        assert result is None


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/telegram/webhook
# ──────────────────────────────────────────────────────────────────────────────

class TestTelegramWebhook:
    WEBHOOK_URL = "/api/telegram/webhook"

    def _make_start_update(self, chat_id=111222333, chat_type="group", title="Test Group", text="/start"):
        return {
            "update_id": 1,
            "message": {
                "message_id": 1,
                "chat": {"id": chat_id, "type": chat_type, "title": title},
                "text": text,
            }
        }

    def test_wrong_secret_returns_403(self, tg_client):
        res = tg_client.post(
            self.WEBHOOK_URL,
            json={"update_id": 1},
            headers={"X-Telegram-Bot-Api-Secret-Token": "wrong-secret"},
        )
        assert res.status_code == 403

    def test_missing_secret_returns_403(self, tg_client):
        res = tg_client.post(self.WEBHOOK_URL, json={"update_id": 1})
        assert res.status_code == 403

    def test_correct_secret_no_command_returns_200(self, tg_client):
        res = tg_client.post(
            self.WEBHOOK_URL,
            json={"update_id": 1, "message": {"text": "hello", "chat": {"id": 1, "type": "private"}}},
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )
        assert res.status_code == 200

    def test_bot_not_configured_returns_403_on_bad_secret(self, app_module):
        """With no TELEGRAM_BOT_TOKEN set, the webhook_secret is derived from SECRET_KEY.
        A wrong secret should still return 403."""
        flask_app = app_module.app
        flask_app.config.update(TESTING=True)
        client = flask_app.test_client()
        res = client.post(
            self.WEBHOOK_URL,
            json={"update_id": 1},
            headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"},
        )
        assert res.status_code == 403

    def test_start_command_binds_chat(self, tg_client, tg_app_module, monkeypatch):
        """A /start message from a group chat should bind the chat to the global static."""
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        chat_id = 555666777
        res = tg_client.post(
            self.WEBHOOK_URL,
            json=self._make_start_update(chat_id=chat_id, text="/start"),
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["bound"] is True
        assert data["chat_id"] == chat_id

        # Stored in DB
        static_id = tg_app_module._ensure_global_static()
        stored = tg_app_module._get_static_telegram_chat_id(static_id)
        assert stored == str(chat_id)

        # Confirmation sent
        assert len(sent) == 1
        assert "vinculado" in sent[0][1].lower() or "Bot vinculado" in sent[0][1]

    def test_start_with_bot_name_suffix_binds(self, tg_client, tg_app_module, monkeypatch):
        """'/start@BotName' should also bind."""
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        chat_id = 111333555
        res = tg_client.post(
            self.WEBHOOK_URL,
            json=self._make_start_update(chat_id=chat_id, text="/start@MhigosBot"),
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )
        assert res.status_code == 200
        assert res.get_json()["bound"] is True

    def test_start_from_private_chat_not_bound(self, tg_client, tg_app_module, monkeypatch):
        """A /start in a private chat (type='private') should NOT bind."""
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        static_id = tg_app_module._ensure_global_static()
        before = tg_app_module._get_static_telegram_chat_id(static_id)

        res = tg_client.post(
            self.WEBHOOK_URL,
            json=self._make_start_update(chat_id=9999, chat_type="private", text="/start"),
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )
        assert res.status_code == 200
        # Should not bind
        after = tg_app_module._get_static_telegram_chat_id(static_id)
        assert after == before
        assert len(sent) == 0

    def test_my_chat_member_update_binds_chat(self, tg_client, tg_app_module, monkeypatch):
        """When the bot is added to a group, my_chat_member update should bind."""
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        chat_id = 777888999
        update = {
            "update_id": 5,
            "my_chat_member": {
                "chat": {"id": chat_id, "type": "group", "title": "New Group"},
                "new_chat_member": {"status": "member"},
            }
        }
        res = tg_client.post(
            self.WEBHOOK_URL,
            json=update,
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["bound"] is True

        static_id = tg_app_module._ensure_global_static()
        stored = tg_app_module._get_static_telegram_chat_id(static_id)
        assert stored == str(chat_id)

    def test_non_command_message_ignored(self, tg_client, tg_app_module, monkeypatch):
        """Regular text (no /start) in a group is a no-op."""
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        res = tg_client.post(
            self.WEBHOOK_URL,
            json=self._make_start_update(text="hello world"),
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )
        assert res.status_code == 200
        assert res.get_json() == {"ok": True}
        assert len(sent) == 0

    def test_malformed_update_no_message(self, tg_client):
        """Payload without 'message' key should be handled gracefully."""
        res = tg_client.post(
            self.WEBHOOK_URL,
            json={"update_id": 99},
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )
        assert res.status_code == 200

    def test_malformed_update_no_chat(self, tg_client):
        """Message without 'chat' key should be handled gracefully."""
        res = tg_client.post(
            self.WEBHOOK_URL,
            json={"update_id": 99, "message": {"text": "/start"}},
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )
        assert res.status_code == 200

    def test_empty_payload_handled(self, tg_client):
        """Completely empty JSON should be handled gracefully."""
        res = tg_client.post(
            self.WEBHOOK_URL,
            json={},
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )
        assert res.status_code == 200


# ──────────────────────────────────────────────────────────────────────────────
# GET /api/telegram/status
# ──────────────────────────────────────────────────────────────────────────────

class TestTelegramStatus:
    def test_anonymous_returns_401(self, tg_client):
        res = tg_client.get("/api/telegram/status")
        assert res.status_code == 401

    def test_member_unbound_static(self, tg_client):
        register_and_login(tg_client, "admin1")
        res = tg_client.get("/api/telegram/status")
        assert res.status_code == 200
        data = res.get_json()
        assert data["bound"] is False
        assert data["chat_id"] is None
        assert "configured" in data

    def test_member_sees_configured_true_when_token_set(self, tg_client):
        register_and_login(tg_client, "admin2")
        res = tg_client.get("/api/telegram/status")
        assert res.status_code == 200
        data = res.get_json()
        assert data["configured"] is True

    def test_status_shows_bound_after_webhook_start(self, tg_client, tg_app_module, monkeypatch):
        """After binding via /start, status should reflect bound=True."""
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        # Bind
        tg_client.post(
            "/api/telegram/webhook",
            json={
                "update_id": 1,
                "message": {
                    "chat": {"id": 444555666, "type": "group", "title": "Raid Group"},
                    "text": "/start",
                }
            },
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )

        # Check status as a logged-in user
        register_and_login(tg_client, "status_user")
        res = tg_client.get("/api/telegram/status")
        data = res.get_json()
        assert data["bound"] is True
        assert data["chat_id"] == "444555666"

    def test_all_members_can_read_status(self, tg_client, tg_app_module, monkeypatch):
        """Members (non-admin) can also read the status."""
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        # Register admin + member
        register_and_login(tg_client, "admin_status")  # first = admin
        tg_client.post("/api/logout", json={})

        # register member (pending)
        tg_client.post("/api/register", json={"username": "member_status", "password": "secret123"})
        # approve
        login(tg_client, "admin_status")
        pending = tg_client.get("/api/pending").get_json()
        if pending:
            tg_client.post(f"/api/pending/{pending[0]['id']}/approve")
        tg_client.post("/api/logout", json={})

        # Login as member and check status
        login(tg_client, "member_status")
        res = tg_client.get("/api/telegram/status")
        assert res.status_code == 200


# ──────────────────────────────────────────────────────────────────────────────
# POST /api/telegram/unbind
# ──────────────────────────────────────────────────────────────────────────────

class TestTelegramUnbind:
    def test_anonymous_returns_401(self, tg_client):
        res = tg_client.post("/api/telegram/unbind", json={})
        assert res.status_code == 401

    def test_non_admin_returns_403(self, tg_client, tg_app_module, monkeypatch):
        """Only admin can unbind; members get 403."""
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        # Setup admin + member
        register_and_login(tg_client, "admin_unbind")
        tg_client.post("/api/logout", json={})
        tg_client.post("/api/register", json={"username": "member_unbind", "password": "secret123"})
        login(tg_client, "admin_unbind")
        pending = tg_client.get("/api/pending").get_json()
        if pending:
            tg_client.post(f"/api/pending/{pending[0]['id']}/approve")
        tg_client.post("/api/logout", json={})

        # Login as member and try to unbind
        login(tg_client, "member_unbind")
        res = tg_client.post("/api/telegram/unbind", json={})
        assert res.status_code == 403

    def test_admin_can_unbind(self, tg_client, tg_app_module, monkeypatch):
        """Admin can unbind; chat_id cleared afterwards."""
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        # Bind the chat first via webhook
        tg_client.post(
            "/api/telegram/webhook",
            json={
                "update_id": 1,
                "message": {
                    "chat": {"id": 123456789, "type": "group", "title": "Raid"},
                    "text": "/start",
                }
            },
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )

        # Admin logs in and unbinds
        register_and_login(tg_client, "admin_can_unbind")
        res_unbind = tg_client.post("/api/telegram/unbind", json={})
        assert res_unbind.status_code == 200
        assert res_unbind.get_json()["ok"] is True

        # Status shows unbound
        res_status = tg_client.get("/api/telegram/status")
        data = res_status.get_json()
        assert data["bound"] is False
        assert data["chat_id"] is None

    def test_unbind_idempotent(self, tg_client):
        """Calling unbind when not bound should still succeed (no error)."""
        register_and_login(tg_client, "admin_idempotent")
        # No bind happened — still should not error
        res = tg_client.post("/api/telegram/unbind", json={})
        assert res.status_code == 200


# ──────────────────────────────────────────────────────────────────────────────
# _notify_new_raid_events (triggered via PUT /api/state)
# ──────────────────────────────────────────────────────────────────────────────

class TestNotifyNewRaidEvents:
    """Tests that PUT /api/state correctly fires Telegram notifications."""

    CHAT_ID = 987654321

    def _bind_chat(self, tg_client, monkeypatch, chat_id=None):
        if chat_id is None:
            chat_id = self.CHAT_ID
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)
        tg_client.post(
            "/api/telegram/webhook",
            json={
                "update_id": 1,
                "message": {
                    "chat": {"id": chat_id, "type": "group", "title": "Raid"},
                    "text": "/start",
                }
            },
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )
        return sent, fake_send

    def test_no_notification_when_not_configured(self, app_module, monkeypatch):
        """Without TELEGRAM_BOT_TOKEN, no send_group_message called on PUT /api/state."""
        import server.app as no_tg_app
        flask_app = no_tg_app.app
        flask_app.config.update(TESTING=True)
        client = flask_app.test_client()

        sent = []
        monkeypatch.setattr("server.app.tg.send_group_message", lambda cid, t: sent.append((cid, t)) or True)

        register_and_login(client, "no_tg_user")
        put_state(client, {"raidEvents": [{"id": "e1", "progId": "FRU", "date": "2099-01-01", "quorum": 8}]})
        assert len(sent) == 0

    def test_no_notification_when_chat_not_bound(self, tg_client, tg_app_module, monkeypatch):
        """With token configured but no chat bound, no notifications sent."""
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        register_and_login(tg_client, "unbound_user")
        put_state(tg_client, {"raidEvents": [{"id": "e1", "progId": "FRU", "date": "2099-01-01", "quorum": 8}]})
        assert len(sent) == 0

    def test_new_event_sends_evento_planejado(self, tg_client, tg_app_module, monkeypatch):
        """Adding a new raidEvent triggers format_event_created with 'Evento Planejado'."""
        sent, fake_send = self._bind_chat(tg_client, monkeypatch)

        register_and_login(tg_client, "officer_notify")
        # Clear bind confirmation message
        sent.clear()

        put_state(tg_client, {
            "raidEvents": [
                {"id": "e1", "progId": "FRU", "progName": "FRU", "date": "2099-06-01", "quorum": 8}
            ]
        })

        event_msgs = [t for _, t in sent if "Evento Planejado" in t or "Evento" in t]
        assert event_msgs, f"Expected 'Evento Planejado' in sent messages, got: {sent}"

    def test_event_postponed_sends_adiado(self, tg_client, tg_app_module, monkeypatch):
        """Postponing an event triggers 'Adiado' notification."""
        sent, fake_send = self._bind_chat(tg_client, monkeypatch)

        register_and_login(tg_client, "officer_postpone")
        sent.clear()

        # Create initial event
        put_state(tg_client, {
            "raidEvents": [
                {"id": "e2", "progId": "TOP", "progName": "TOP", "date": "2099-07-01", "quorum": 8}
            ]
        })
        sent.clear()

        # Now postpone it
        put_state(tg_client, {
            "raidEvents": [
                {"id": "e2", "progId": "TOP", "progName": "TOP", "date": "2099-07-01",
                 "postponedTo": "2099-07-15", "quorum": 8}
            ]
        })

        postpone_msgs = [t for _, t in sent if "Adiado" in t or "adiado" in t]
        assert postpone_msgs, f"Expected 'Adiado' in messages, got: {sent}"

    def test_event_cancelled_sends_cancelado(self, tg_client, tg_app_module, monkeypatch):
        """Removing an event triggers 'Cancelado' notification."""
        sent, fake_send = self._bind_chat(tg_client, monkeypatch)

        register_and_login(tg_client, "officer_cancel")
        sent.clear()

        # Create event
        put_state(tg_client, {
            "raidEvents": [
                {"id": "e3", "progId": "DSR", "progName": "DSR", "date": "2099-08-01", "quorum": 8}
            ]
        })
        sent.clear()

        # Remove all events
        put_state(tg_client, {"raidEvents": []})

        cancel_msgs = [t for _, t in sent if "Cancelado" in t or "cancelado" in t]
        assert cancel_msgs, f"Expected 'Cancelado' in messages, got: {sent}"

    def test_multiple_events_cancelled_uses_bulk(self, tg_client, tg_app_module, monkeypatch):
        """Removing >2 events at once should send the bulk cancellation message."""
        sent, fake_send = self._bind_chat(tg_client, monkeypatch)

        register_and_login(tg_client, "officer_bulk")
        sent.clear()

        # Create 3 events
        put_state(tg_client, {
            "raidEvents": [
                {"id": "b1", "progId": "FRU", "progName": "FRU", "date": "2099-09-01", "quorum": 8},
                {"id": "b2", "progId": "FRU", "progName": "FRU", "date": "2099-09-08", "quorum": 8},
                {"id": "b3", "progId": "FRU", "progName": "FRU", "date": "2099-09-15", "quorum": 8},
            ]
        })
        sent.clear()

        # Remove all 3 at once
        put_state(tg_client, {"raidEvents": []})

        # Should use bulk format (> 2 cancelled)
        bulk_msgs = [t for _, t in sent if "eventos cancelados" in t or "Cancelado" in t]
        assert bulk_msgs, f"Expected bulk cancel message, got: {sent}"
        # Should be exactly 1 message (bulk), not 3 individual
        assert len(sent) == 1, f"Expected 1 bulk message but got {len(sent)}: {sent}"

    def test_multiple_new_events_sends_multiple_messages(self, tg_client, tg_app_module, monkeypatch):
        """Adding 2 new events at once should send 2 notifications."""
        sent, fake_send = self._bind_chat(tg_client, monkeypatch)

        register_and_login(tg_client, "officer_multi_add")
        sent.clear()

        put_state(tg_client, {
            "raidEvents": [
                {"id": "m1", "progId": "FRU", "progName": "FRU", "date": "2099-10-01", "quorum": 8},
                {"id": "m2", "progId": "FRU", "progName": "FRU", "date": "2099-10-08", "quorum": 8},
            ]
        })

        event_msgs = [t for _, t in sent if "Evento Planejado" in t]
        assert len(event_msgs) == 2, f"Expected 2 'Evento Planejado' messages, got: {sent}"

    def test_officer_role_triggers_notifications(self, tg_client, tg_app_module, monkeypatch):
        """Officers can add events; notifications should fire for them too."""
        sent, fake_send = self._bind_chat(tg_client, monkeypatch)

        # Create admin first
        register_and_login(tg_client, "admin_for_officer")
        sent.clear()

        # Register officer (pending then approved then promoted)
        tg_client.post("/api/register", json={"username": "officer_role", "password": "secret123"})
        pending = tg_client.get("/api/pending").get_json()
        if pending:
            tg_client.post(f"/api/pending/{pending[0]['id']}/approve")
        # Find officer user id and promote
        members = tg_client.get(f"/api/statics/{get_active_static_id(tg_client)}/members").get_json()
        # members returns {id, username, role, joined_at}
        officer_uid = next((m["id"] for m in members if m.get("username") == "officer_role"), None)
        static_id = get_active_static_id(tg_client)
        tg_client.put(f"/api/statics/{static_id}/members/{officer_uid}/role", json={"role": "officer"})
        tg_client.post("/api/logout", json={})

        login(tg_client, "officer_role")
        sent.clear()

        put_state(tg_client, {
            "raidEvents": [
                {"id": "off1", "progId": "FRU", "progName": "FRU", "date": "2099-11-01", "quorum": 8}
            ]
        })

        event_msgs = [t for _, t in sent if "Evento Planejado" in t]
        assert event_msgs, f"Expected notification from officer, got: {sent}"


# ──────────────────────────────────────────────────────────────────────────────
# _maybe_send_reminders (triggered via GET /api/state)
# ──────────────────────────────────────────────────────────────────────────────

class TestMaybeSendReminders:
    """Tests for the reminder piggyback on GET /api/state."""

    CHAT_ID = 111222333

    def _setup_state_with_event(self, tg_client, monkeypatch, event_date: str, chat_id=None):
        """Bind chat, login as admin, store a state with one raidEvent on given date."""
        if chat_id is None:
            chat_id = self.CHAT_ID

        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        # Bind
        tg_client.post(
            "/api/telegram/webhook",
            json={
                "update_id": 1,
                "message": {
                    "chat": {"id": chat_id, "type": "group", "title": "Raid"},
                    "text": "/start",
                }
            },
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )

        register_and_login(tg_client, f"admin_reminder_{event_date.replace('-', '')}")
        sent.clear()

        put_state(tg_client, {
            "raidEvents": [
                {"id": "rem1", "progId": "FRU", "progName": "FRU", "date": event_date, "quorum": 8}
            ]
        })
        sent.clear()  # Clear creation notification

        return sent, fake_send

    def test_no_reminder_when_not_configured(self, app_module, monkeypatch):
        """Without TELEGRAM_BOT_TOKEN, no reminders sent on GET /api/state."""
        flask_app = app_module.app
        flask_app.config.update(TESTING=True)
        client = flask_app.test_client()

        sent = []
        monkeypatch.setattr("server.app.tg.send_group_message", lambda cid, t: sent.append((cid, t)) or True)

        register_and_login(client, "no_tg_remind")
        get_state(client)
        assert len(sent) == 0

    def test_no_reminder_when_chat_not_bound(self, tg_client, monkeypatch):
        """With token but no chat bound, no reminders sent."""
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        register_and_login(tg_client, "unbound_remind")
        get_state(tg_client)
        assert len(sent) == 0

    @freeze_time("2099-05-14 12:00:00")  # local -4 = 08:00
    def test_24h_reminder_sent_for_tomorrow_event(self, tg_client, tg_app_module, monkeypatch):
        """Event scheduled tomorrow should trigger a 24h reminder."""
        tomorrow = "2099-05-15"
        sent, fake_send = self._setup_state_with_event(tg_client, monkeypatch, tomorrow)

        # Trigger via GET /api/state
        get_state(tg_client)

        reminder_msgs = [t for _, t in sent if "amanhã" in t or "Lembrete" in t]
        assert reminder_msgs, f"Expected 24h reminder, got: {sent}"

    @freeze_time("2099-05-15 12:00:00")
    def test_today_reminder_sent_for_today_event(self, tg_client, tg_app_module, monkeypatch):
        """Event scheduled today should trigger an 'É hoje!' reminder."""
        today = "2099-05-15"
        sent, fake_send = self._setup_state_with_event(tg_client, monkeypatch, today)

        get_state(tg_client)

        today_msgs = [t for _, t in sent if "É hoje" in t or "hoje" in t.lower()]
        assert today_msgs, f"Expected today reminder, got: {sent}"

    @freeze_time("2099-05-10 12:00:00")
    def test_far_future_event_no_reminder(self, tg_client, tg_app_module, monkeypatch):
        """Event far in the future should not trigger any reminder."""
        future = "2099-06-01"
        sent, fake_send = self._setup_state_with_event(tg_client, monkeypatch, future)

        get_state(tg_client)
        assert len(sent) == 0, f"Expected no reminder for far future event, got: {sent}"

    @freeze_time("2099-05-10 12:00:00")
    def test_past_event_no_reminder(self, tg_client, tg_app_module, monkeypatch):
        """Past events should not trigger any reminder."""
        past = "2099-05-01"
        sent, fake_send = self._setup_state_with_event(tg_client, monkeypatch, past)

        get_state(tg_client)
        assert len(sent) == 0, f"Expected no reminder for past event, got: {sent}"

    @freeze_time("2099-05-14 12:00:00")
    def test_24h_reminder_is_idempotent(self, tg_client, tg_app_module, monkeypatch):
        """A 24h reminder is only sent once; a second GET does not re-send."""
        tomorrow = "2099-05-15"
        sent, fake_send = self._setup_state_with_event(tg_client, monkeypatch, tomorrow)

        # First GET
        get_state(tg_client)
        first_count = len([t for _, t in sent if "Lembrete" in t or "amanhã" in t])
        assert first_count >= 1, f"Expected at least 1 reminder, got: {sent}"

        # Second GET in same day
        sent.clear()
        get_state(tg_client)
        second_count = len([t for _, t in sent if "Lembrete" in t or "amanhã" in t])
        assert second_count == 0, f"Expected no re-send, but got: {sent}"

    @freeze_time("2099-05-15 12:00:00")
    def test_today_reminder_is_idempotent(self, tg_client, tg_app_module, monkeypatch):
        """A 'today' reminder is only sent once; second GET does not re-send."""
        today = "2099-05-15"
        sent, fake_send = self._setup_state_with_event(tg_client, monkeypatch, today)

        get_state(tg_client)
        first_count = len([t for _, t in sent if "É hoje" in t])
        assert first_count >= 1, f"Expected at least 1 today reminder, got: {sent}"

        sent.clear()
        get_state(tg_client)
        second_count = len([t for _, t in sent if "É hoje" in t])
        assert second_count == 0, f"Expected no re-send, but got: {sent}"

    @freeze_time("2099-05-14 12:00:00")
    def test_24h_reminder_marker_persisted(self, tg_client, tg_app_module, monkeypatch):
        """After sending the 24h reminder, 'reminder24hSent' should be True in the DB."""
        tomorrow = "2099-05-15"
        sent, fake_send = self._setup_state_with_event(tg_client, monkeypatch, tomorrow)
        static_id = tg_app_module._ensure_global_static()

        get_state(tg_client)

        # Read from DB directly
        from server.db import get_conn
        import json as _json
        conn = get_conn()
        try:
            row = conn.execute("SELECT data_json FROM statics WHERE id = ?", (static_id,)).fetchone()
            data = _json.loads(row["data_json"] or "{}")
        finally:
            conn.close()

        events = data.get("raidEvents") or []
        assert events, "Expected raidEvents in DB"
        reminder_flag = events[0].get("reminder24hSent")
        assert reminder_flag is True, f"Expected reminder24hSent=True, got: {reminder_flag}"

    @freeze_time("2099-05-15 12:00:00")
    def test_today_reminder_marker_persisted(self, tg_client, tg_app_module, monkeypatch):
        """After sending today reminder, 'reminderTodaySent' should be True in the DB."""
        today = "2099-05-15"
        sent, fake_send = self._setup_state_with_event(tg_client, monkeypatch, today)
        static_id = tg_app_module._ensure_global_static()

        get_state(tg_client)

        from server.db import get_conn
        import json as _json
        conn = get_conn()
        try:
            row = conn.execute("SELECT data_json FROM statics WHERE id = ?", (static_id,)).fetchone()
            data = _json.loads(row["data_json"] or "{}")
        finally:
            conn.close()

        events = data.get("raidEvents") or []
        assert events
        assert events[0].get("reminderTodaySent") is True

    def test_cross_day_today_reminder_fires_after_24h(self, tg_client, tg_app_module, monkeypatch):
        """After 24h reminder fires, the 'today' reminder should still fire the next day.

        Note: all HTTP calls (including bind/login/put) must happen inside the first
        freeze_time block so the Flask session cookie timestamp is frozen in 2099 and
        is still valid when the second freeze_time block runs. Jumping from real time
        (~2026) to 2099 would make itsdangerous consider the session expired.
        """
        event_date = "2099-06-20"

        sent_list, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        # Step 1 — Day before: set up everything + GET to fire 24h reminder
        with freeze_time("2099-06-19 12:00:00"):
            # Bind chat
            tg_client.post(
                "/api/telegram/webhook",
                json={
                    "update_id": 1,
                    "message": {
                        "chat": {"id": self.CHAT_ID, "type": "group", "title": "Raid"},
                        "text": "/start",
                    }
                },
                headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
            )
            register_and_login(tg_client, "admin_crossday")
            sent_list.clear()

            put_state(tg_client, {
                "raidEvents": [
                    {"id": "cross1", "progId": "FRU", "progName": "FRU", "date": event_date, "quorum": 8}
                ]
            })
            sent_list.clear()  # Clear event created message

            # Trigger 24h reminder
            get_state(tg_client)

        h24_msgs = [t for _, t in sent_list if "Lembrete" in t or "amanhã" in t]
        assert h24_msgs, f"Expected 24h reminder, got: {sent_list}"
        sent_list.clear()

        # Step 2 — Event day: today reminder should also fire
        with freeze_time("2099-06-20 12:00:00"):
            get_state(tg_client)

        today_msgs = [t for _, t in sent_list if "É hoje" in t]
        assert today_msgs, f"Expected today reminder after 24h, got: {sent_list}"


# ──────────────────────────────────────────────────────────────────────────────
# _evaluate_quorum_opportunities → Telegram side effect
# ──────────────────────────────────────────────────────────────────────────────

class TestEvaluateQuorumOpportunities:
    """Quorum opportunity detection triggers a send_group_message call."""

    CHAT_ID = 333444555

    def _bind_and_login(self, tg_client, monkeypatch):
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        tg_client.post(
            "/api/telegram/webhook",
            json={
                "update_id": 1,
                "message": {
                    "chat": {"id": self.CHAT_ID, "type": "group", "title": "Raid"},
                    "text": "/start",
                }
            },
            headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"},
        )
        register_and_login(tg_client, "quorum_admin")
        sent.clear()
        return sent, fake_send

    def _make_roster_with_avail(self, date_str: str, count: int = 8):
        """Build a roster with `count` players all marked avail on date_str."""
        return [
            {
                "id": f"slot_{i}",
                "monthlySchedule": {date_str: "avail"},
            }
            for i in range(count)
        ]

    @freeze_time("2099-04-01 12:00:00")
    def test_quorum_opportunity_sends_message(self, tg_client, tg_app_module, monkeypatch):
        """When 8+ players are available on a date with no event, 'Oportunidade' is sent."""
        sent, fake_send = self._bind_and_login(tg_client, monkeypatch)

        quorum_date = "2099-04-05"  # within 14-day window
        roster = self._make_roster_with_avail(quorum_date, 8)

        put_state(tg_client, {
            "roster": roster,
            "raidEvents": [],
            "activeProgs": ["FRU"],
            "customContents": [],
            "expansions": [
                {"id": "arr", "name": "A Realm Reborn", "levelCap": 50, "order": 1},
                {"id": "dt", "name": "Dawntrail", "levelCap": 100, "order": 6},
            ],
        })

        quorum_msgs = [t for _, t in sent if "Oportunidade" in t]
        assert quorum_msgs, f"Expected quorum opportunity message, got: {sent}"

    @freeze_time("2099-04-01 12:00:00")
    def test_quorum_opportunity_deduplication(self, tg_client, tg_app_module, monkeypatch):
        """A quorum suggestion for a given date is only sent once (deduplication)."""
        sent, fake_send = self._bind_and_login(tg_client, monkeypatch)

        quorum_date = "2099-04-05"
        roster = self._make_roster_with_avail(quorum_date, 8)

        state_payload = {
            "roster": roster,
            "raidEvents": [],
            "activeProgs": ["FRU"],
            "customContents": [],
            "expansions": [
                {"id": "arr", "name": "A Realm Reborn", "levelCap": 50, "order": 1},
                {"id": "dt", "name": "Dawntrail", "levelCap": 100, "order": 6},
            ],
        }

        # First PUT → should send
        put_state(tg_client, state_payload)
        first_quorum_msgs = [t for _, t in sent if "Oportunidade" in t]
        assert first_quorum_msgs, f"Expected quorum message on first PUT, got: {sent}"
        sent.clear()

        # Second PUT with same availability → should NOT re-send (quorumSuggestionsSent persisted)
        # We need to fetch state first to include quorumSuggestionsSent in our PUT
        state_res = get_state(tg_client)
        state_data = state_res.get_json().get("data", {})
        sent.clear()

        # Merge the quorumSuggestionsSent back in
        state_payload["quorumSuggestionsSent"] = state_data.get("quorumSuggestionsSent", {})
        put_state(tg_client, state_payload)
        second_quorum_msgs = [t for _, t in sent if "Oportunidade" in t]
        assert not second_quorum_msgs, f"Expected no re-send on second PUT, got: {sent}"

    @freeze_time("2099-04-01 12:00:00")
    def test_no_quorum_when_not_configured(self, app_module, monkeypatch):
        """Without TELEGRAM_BOT_TOKEN, quorum side effect never calls send_group_message."""
        flask_app = app_module.app
        flask_app.config.update(TESTING=True)
        client = flask_app.test_client()

        sent = []
        monkeypatch.setattr("server.app.tg.send_group_message", lambda cid, t: sent.append((cid, t)) or True)

        register_and_login(client, "no_tg_quorum")
        quorum_date = "2099-04-05"
        roster = self._make_roster_with_avail(quorum_date, 8)
        put_state(client, {
            "roster": roster,
            "raidEvents": [],
            "activeProgs": ["FRU"],
            "customContents": [],
            "expansions": [
                {"id": "arr", "name": "A Realm Reborn", "levelCap": 50, "order": 1},
                {"id": "dt", "name": "Dawntrail", "levelCap": 100, "order": 6},
            ],
        })
        assert len(sent) == 0

    @freeze_time("2099-04-01 12:00:00")
    def test_no_quorum_when_chat_not_bound(self, tg_client, monkeypatch):
        """With token but no chat bound, quorum opportunity is not sent."""
        sent, fake_send = make_fake_send()
        monkeypatch.setattr("server.app.tg.send_group_message", fake_send)

        register_and_login(tg_client, "unbound_quorum")
        quorum_date = "2099-04-05"
        roster = self._make_roster_with_avail(quorum_date, 8)
        put_state(tg_client, {
            "roster": roster,
            "raidEvents": [],
            "activeProgs": ["FRU"],
            "customContents": [],
            "expansions": [
                {"id": "arr", "name": "A Realm Reborn", "levelCap": 50, "order": 1},
                {"id": "dt", "name": "Dawntrail", "levelCap": 100, "order": 6},
            ],
        })
        assert len(sent) == 0

    @freeze_time("2099-04-01 12:00:00")
    def test_booked_date_skipped(self, tg_client, tg_app_module, monkeypatch):
        """If a raidEvent already exists for a date, no quorum suggestion is sent for it."""
        sent, fake_send = self._bind_and_login(tg_client, monkeypatch)

        quorum_date = "2099-04-05"
        roster = self._make_roster_with_avail(quorum_date, 8)

        put_state(tg_client, {
            "roster": roster,
            "raidEvents": [
                # Event already booked on quorum_date
                {"id": "booked1", "progId": "FRU", "progName": "FRU", "date": quorum_date, "quorum": 8}
            ],
            "activeProgs": ["FRU"],
            "customContents": [],
            "expansions": [
                {"id": "arr", "name": "A Realm Reborn", "levelCap": 50, "order": 1},
                {"id": "dt", "name": "Dawntrail", "levelCap": 100, "order": 6},
            ],
        })

        quorum_msgs = [t for _, t in sent if "Oportunidade" in t]
        assert not quorum_msgs, f"Expected no quorum msg when date is booked, got: {sent}"
