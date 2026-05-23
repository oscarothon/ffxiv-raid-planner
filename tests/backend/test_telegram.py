"""Tests for server/telegram.py — configuration helpers, HTTP plumbing,
and all message formatters.

Each test function is tagged @pytest.mark.telegram so it can be run in
isolation with:  pytest -m telegram
"""
from __future__ import annotations

import importlib
import sys
import hashlib
import html as stdlib_html

import pytest
import responses as responses_lib


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _reload_telegram(monkeypatch=None, env_overrides: dict | None = None):
    """Unload the server module cluster and re-import server.telegram.

    Optionally set environment variables before the import so module-level
    code (e.g., SITE_URL = os.environ.get(...)) picks them up.
    """
    for mod_name in ("server.app", "server.telegram", "server.auth", "server.db"):
        sys.modules.pop(mod_name, None)
    # env_overrides applied via os.environ directly because monkeypatch may
    # not be available in every call path; callers pass a pre-configured
    # monkeypatch when they need cleanup.
    return importlib.import_module("server.telegram")


def _reload_with_env(monkeypatch, **env_vars):
    """Set env vars via monkeypatch, reload server.telegram, return module."""
    for k, v in env_vars.items():
        monkeypatch.setenv(k, v)
    for mod_name in ("server.app", "server.telegram", "server.auth", "server.db"):
        sys.modules.pop(mod_name, None)
    return importlib.import_module("server.telegram")


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def tg(monkeypatch):
    """server.telegram with no TELEGRAM_BOT_TOKEN and SECRET_KEY=test-secret-key."""
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET", raising=False)
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    return _reload_telegram()


@pytest.fixture()
def tg_configured(monkeypatch):
    """server.telegram with a fake bot token configured."""
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "fake-token-123")
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET", raising=False)
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    return _reload_telegram()


# ---------------------------------------------------------------------------
# get_bot_token
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_get_bot_token_unset(tg):
    assert tg.get_bot_token() is None


@pytest.mark.telegram
def test_get_bot_token_set(monkeypatch, tg):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "mytoken-xyz")
    assert tg.get_bot_token() == "mytoken-xyz"


# ---------------------------------------------------------------------------
# get_webhook_secret
# ---------------------------------------------------------------------------

_EXPECTED_SECRET_TEST_KEY = "903435311ae5bd67f8b4bff1b42d270f14d7cec1067772072d6c946b7282f774"
_EXPECTED_SECRET_DEFAULT_KEY = "06b14a85f232ff8920d0dc344ae04a273c790f047fa313b81f51242f68cdd9db"


@pytest.mark.telegram
def test_get_webhook_secret_explicit(monkeypatch, tg):
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "my-explicit-secret")
    assert tg.get_webhook_secret() == "my-explicit-secret"


@pytest.mark.telegram
def test_get_webhook_secret_derived_from_secret_key(monkeypatch, tg):
    """When TELEGRAM_WEBHOOK_SECRET is absent, derives sha256 from SECRET_KEY."""
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET", raising=False)
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    result = tg.get_webhook_secret()
    assert result == _EXPECTED_SECRET_TEST_KEY


@pytest.mark.telegram
def test_get_webhook_secret_fallback_default_key(monkeypatch, tg):
    """With no SECRET_KEY, falls back to the hard-coded default."""
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET", raising=False)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    result = tg.get_webhook_secret()
    assert result == _EXPECTED_SECRET_DEFAULT_KEY


@pytest.mark.telegram
def test_get_webhook_secret_is_hex_64_chars(tg):
    """Result must be a 64-char hex string (valid for Telegram header)."""
    result = tg.get_webhook_secret()
    assert isinstance(result, str)
    assert len(result) == 64
    assert all(c in "0123456789abcdef" for c in result)


# ---------------------------------------------------------------------------
# is_configured
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_is_configured_false_when_no_token(tg):
    assert tg.is_configured() is False


@pytest.mark.telegram
def test_is_configured_true_when_token_set(monkeypatch, tg):
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "some-token")
    assert tg.is_configured() is True


# ---------------------------------------------------------------------------
# _call
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_call_returns_none_when_not_configured(tg):
    """No HTTP call should be made at all when token is absent."""
    with responses_lib.RequestsMock(assert_all_requests_are_fired=False) as rsps:
        result = tg._call("sendMessage", {"chat_id": 1, "text": "hi"})
    assert result is None
    assert len(rsps.calls) == 0


@pytest.mark.telegram
@responses_lib.activate
def test_call_posts_to_correct_url(tg_configured):
    responses_lib.add(
        responses_lib.POST,
        "https://api.telegram.org/botfake-token-123/sendMessage",
        json={"ok": True, "result": {}},
        status=200,
    )
    tg_configured._call("sendMessage", {"chat_id": 99, "text": "hello"})
    assert len(responses_lib.calls) == 1
    req = responses_lib.calls[0].request
    assert req.url == "https://api.telegram.org/botfake-token-123/sendMessage"


@pytest.mark.telegram
@responses_lib.activate
def test_call_sends_json_body(tg_configured):
    responses_lib.add(
        responses_lib.POST,
        "https://api.telegram.org/botfake-token-123/sendMessage",
        json={"ok": True},
        status=200,
    )
    import json
    payload = {"chat_id": 42, "text": "world", "parse_mode": "HTML"}
    tg_configured._call("sendMessage", payload)
    sent = json.loads(responses_lib.calls[0].request.body)
    assert sent == payload


@pytest.mark.telegram
@responses_lib.activate
def test_call_uses_5s_timeout(tg_configured, monkeypatch):
    """Verify that requests.post is called with timeout=5."""
    captured = {}

    import requests as req_mod
    original_post = req_mod.post

    def fake_post(url, **kwargs):
        captured["timeout"] = kwargs.get("timeout")
        return original_post(url, **kwargs)

    monkeypatch.setattr(req_mod, "post", fake_post)

    responses_lib.add(
        responses_lib.POST,
        "https://api.telegram.org/botfake-token-123/getMe",
        json={"ok": True},
        status=200,
    )
    tg_configured._call("getMe", {})
    assert captured["timeout"] == 5


@pytest.mark.telegram
@responses_lib.activate
def test_call_returns_parsed_json_on_200(tg_configured):
    responses_lib.add(
        responses_lib.POST,
        "https://api.telegram.org/botfake-token-123/getMe",
        json={"ok": True, "result": {"id": 7}},
        status=200,
    )
    result = tg_configured._call("getMe", {})
    assert result == {"ok": True, "result": {"id": 7}}


@pytest.mark.telegram
@responses_lib.activate
def test_call_returns_json_when_ok_false(tg_configured):
    """ok: False still returns the JSON (caller decides what to do)."""
    responses_lib.add(
        responses_lib.POST,
        "https://api.telegram.org/botfake-token-123/sendMessage",
        json={"ok": False, "description": "Bad Request"},
        status=200,
    )
    result = tg_configured._call("sendMessage", {})
    assert result == {"ok": False, "description": "Bad Request"}


@pytest.mark.telegram
@responses_lib.activate
def test_call_returns_none_on_network_error(tg_configured):
    responses_lib.add(
        responses_lib.POST,
        "https://api.telegram.org/botfake-token-123/sendMessage",
        body=ConnectionError("network down"),
    )
    result = tg_configured._call("sendMessage", {"chat_id": 1})
    assert result is None


# ---------------------------------------------------------------------------
# send_group_message
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_send_group_message_returns_false_when_chat_id_none(tg):
    assert tg.send_group_message(None, "hello") is False


@pytest.mark.telegram
def test_send_group_message_returns_false_when_chat_id_empty_string(tg):
    assert tg.send_group_message("", "hello") is False


@pytest.mark.telegram
def test_send_group_message_returns_false_when_chat_id_zero(tg):
    assert tg.send_group_message(0, "hello") is False


@pytest.mark.telegram
def test_send_group_message_returns_false_when_not_configured(tg):
    assert tg.send_group_message(12345, "hello") is False


@pytest.mark.telegram
@responses_lib.activate
def test_send_group_message_returns_false_when_ok_false(tg_configured):
    responses_lib.add(
        responses_lib.POST,
        "https://api.telegram.org/botfake-token-123/sendMessage",
        json={"ok": False, "description": "Forbidden"},
        status=200,
    )
    assert tg_configured.send_group_message(99, "hi") is False


@pytest.mark.telegram
@responses_lib.activate
def test_send_group_message_returns_true_when_ok(tg_configured):
    responses_lib.add(
        responses_lib.POST,
        "https://api.telegram.org/botfake-token-123/sendMessage",
        json={"ok": True, "result": {"message_id": 1}},
        status=200,
    )
    assert tg_configured.send_group_message(99, "hi") is True


@pytest.mark.telegram
@responses_lib.activate
def test_send_group_message_correct_payload(tg_configured):
    responses_lib.add(
        responses_lib.POST,
        "https://api.telegram.org/botfake-token-123/sendMessage",
        json={"ok": True},
        status=200,
    )
    import json
    tg_configured.send_group_message(-1001234567890, "raid tonight")
    sent = json.loads(responses_lib.calls[0].request.body)
    assert sent["chat_id"] == -1001234567890
    assert sent["text"] == "raid tonight"
    assert sent["parse_mode"] == "HTML"
    assert sent["disable_web_page_preview"] is True


@pytest.mark.telegram
@responses_lib.activate
def test_send_group_message_passes_html_unchanged(tg_configured):
    """HTML in message text is NOT pre-escaped by this function; Telegram parses it."""
    responses_lib.add(
        responses_lib.POST,
        "https://api.telegram.org/botfake-token-123/sendMessage",
        json={"ok": True},
        status=200,
    )
    import json
    raw_html = "<b>Bold</b> & <i>italic</i>"
    tg_configured.send_group_message(1, raw_html)
    sent = json.loads(responses_lib.calls[0].request.body)
    assert sent["text"] == raw_html


# ---------------------------------------------------------------------------
# _format_date
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_format_date_empty_string(tg):
    assert tg._format_date("") == ""


@pytest.mark.telegram
def test_format_date_none(tg):
    assert tg._format_date(None) == ""


@pytest.mark.telegram
def test_format_date_too_short(tg):
    assert tg._format_date("2026-05") == "2026-05"


@pytest.mark.telegram
def test_format_date_bad_month(tg):
    assert tg._format_date("2026-13-40") == "2026-13-40"


@pytest.mark.telegram
def test_format_date_malformed_non_iso(tg):
    assert tg._format_date("not-a-date") == "not-a-date"


@pytest.mark.telegram
@pytest.mark.parametrize("date_str,expected", [
    # 2024-01-01 Monday → seg
    ("2024-01-01", "seg, 01/01"),
    # 2024-01-02 Tuesday → ter
    ("2024-01-02", "ter, 02/01"),
    # 2024-01-03 Wednesday → qua
    ("2024-01-03", "qua, 03/01"),
    # 2024-01-04 Thursday → qui
    ("2024-01-04", "qui, 04/01"),
    # 2024-01-05 Friday → sex
    ("2024-01-05", "sex, 05/01"),
    # 2024-01-06 Saturday → sáb
    ("2024-01-06", "sáb, 06/01"),
    # 2024-01-07 Sunday → dom
    ("2024-01-07", "dom, 07/01"),
])
def test_format_date_all_weekdays(tg, date_str, expected):
    assert tg._format_date(date_str) == expected


@pytest.mark.telegram
def test_format_date_2026_05_22_is_friday(tg):
    # 2026-05-22: weekday() == 4 → "sex"
    assert tg._format_date("2026-05-22") == "sex, 22/05"


# ---------------------------------------------------------------------------
# _format_details_line
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_format_details_line_none(tg):
    assert tg._format_details_line(None) == ""


@pytest.mark.telegram
def test_format_details_line_empty(tg):
    assert tg._format_details_line("") == ""


@pytest.mark.telegram
def test_format_details_line_whitespace_only(tg):
    assert tg._format_details_line("   ") == ""


@pytest.mark.telegram
def test_format_details_line_plain_text(tg):
    result = tg._format_details_line("Come prepared")
    assert result == "\n\n<b>Detalhes:</b> Come prepared"


@pytest.mark.telegram
def test_format_details_line_html_chars_escaped(tg):
    result = tg._format_details_line("<script>alert(1)</script>")
    assert "&lt;script&gt;" in result
    assert "<script>" not in result


@pytest.mark.telegram
def test_format_details_line_ampersand_escaped(tg):
    result = tg._format_details_line("A & B")
    assert "&amp;" in result


@pytest.mark.telegram
def test_format_details_line_int_coerced_to_str(tg):
    result = tg._format_details_line(42)
    assert result == "\n\n<b>Detalhes:</b> 42"


# ---------------------------------------------------------------------------
# format_event_created
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_format_event_created_non_dynamic_has_quorum(tg):
    msg = tg.format_event_created("Omega", "2024-01-01", 5, 8, dynamic=False)
    assert "Confirmados: 5/8" in msg
    assert "seg, 01/01" in msg


@pytest.mark.telegram
def test_format_event_created_dynamic_no_quorum_fraction(tg):
    """Dynamic events must NOT include 'X/Y' confirmed line."""
    msg = tg.format_event_created("Omega", "2024-01-01", 5, 8, dynamic=True)
    assert "/" not in msg.split("Confirmados")[1] if "Confirmados" in msg else True
    # The dynamic branch does NOT include a Confirmados line at all
    assert "Confirmados:" not in msg


@pytest.mark.telegram
def test_format_event_created_with_description(tg):
    msg = tg.format_event_created("Omega", "2024-01-01", 5, 8, description="Bring potions")
    assert "<b>Detalhes:</b>" in msg
    assert "Bring potions" in msg


@pytest.mark.telegram
def test_format_event_created_without_description(tg):
    msg = tg.format_event_created("Omega", "2024-01-01", 5, 8)
    assert "Detalhes" not in msg


@pytest.mark.telegram
def test_format_event_created_contains_site_url(tg):
    msg = tg.format_event_created("Omega", "2024-01-01", 5, 8)
    # SITE_URL is set at module import time; must be present
    assert tg.SITE_URL in msg


@pytest.mark.telegram
def test_format_event_created_emoji_and_header(tg):
    msg = tg.format_event_created("Omega", "2024-01-01", 5, 8)
    assert "📅" in msg
    assert "<b>Evento Planejado</b>" in msg


# ---------------------------------------------------------------------------
# format_event_postponed
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_format_event_postponed_contains_both_dates(tg):
    msg = tg.format_event_postponed("Omega", "2024-01-01", "2024-01-08")
    assert "seg, 01/01" in msg
    assert "seg, 08/01" in msg


@pytest.mark.telegram
def test_format_event_postponed_with_description(tg):
    msg = tg.format_event_postponed("Omega", "2024-01-01", "2024-01-08", description="Delay")
    assert "<b>Detalhes:</b>" in msg
    assert "Delay" in msg


@pytest.mark.telegram
def test_format_event_postponed_without_description(tg):
    msg = tg.format_event_postponed("Omega", "2024-01-01", "2024-01-08")
    assert "Detalhes" not in msg


@pytest.mark.telegram
def test_format_event_postponed_contains_site_url(tg):
    msg = tg.format_event_postponed("Omega", "2024-01-01", "2024-01-08")
    assert tg.SITE_URL in msg


@pytest.mark.telegram
def test_format_event_postponed_emoji_and_header(tg):
    msg = tg.format_event_postponed("Omega", "2024-01-01", "2024-01-08")
    assert "📅" in msg
    assert "<b>Evento Adiado</b>" in msg


# ---------------------------------------------------------------------------
# format_event_cancelled
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_format_event_cancelled_contains_prog_name_and_date(tg):
    msg = tg.format_event_cancelled("Savage Clear", "2024-01-05")
    assert "Savage Clear" in msg
    assert "sex, 05/01" in msg


@pytest.mark.telegram
def test_format_event_cancelled_emoji_and_header(tg):
    msg = tg.format_event_cancelled("Savage Clear", "2024-01-05")
    assert "❌" in msg
    assert "<b>Evento Cancelado</b>" in msg


# ---------------------------------------------------------------------------
# format_event_cancelled_bulk
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_format_event_cancelled_bulk_count_interpolated(tg):
    msg = tg.format_event_cancelled_bulk(3)
    assert "3" in msg


@pytest.mark.telegram
def test_format_event_cancelled_bulk_contains_site_url(tg):
    msg = tg.format_event_cancelled_bulk(3)
    assert tg.SITE_URL in msg


@pytest.mark.telegram
def test_format_event_cancelled_bulk_emoji_and_header(tg):
    msg = tg.format_event_cancelled_bulk(5)
    assert "❌" in msg
    assert "5 eventos cancelados" in msg


# ---------------------------------------------------------------------------
# format_quorum_suggestion
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_format_quorum_suggestion_full_party(tg):
    msg = tg.format_quorum_suggestion("2024-01-01", 6, party_size=8, party_mode="full")
    assert "Full Party (8p)" in msg
    assert "6" in msg
    assert "seg, 01/01" in msg


@pytest.mark.telegram
def test_format_quorum_suggestion_light_party(tg):
    msg = tg.format_quorum_suggestion("2024-01-01", 4, party_size=4, party_mode="light")
    assert "Light Party (4p)" in msg


@pytest.mark.telegram
def test_format_quorum_suggestion_dynamic(tg):
    msg = tg.format_quorum_suggestion("2024-01-01", 3, party_size=3, party_mode="dynamic")
    assert "evento Dynamic (quórum 3)" in msg


@pytest.mark.telegram
def test_format_quorum_suggestion_default_party_size_8(tg):
    msg = tg.format_quorum_suggestion("2024-01-01", 5)
    assert "8p" in msg


@pytest.mark.telegram
def test_format_quorum_suggestion_custom_party_size(tg):
    msg = tg.format_quorum_suggestion("2024-01-01", 6, party_size=6, party_mode="full")
    assert "Full Party (6p)" in msg


@pytest.mark.telegram
def test_format_quorum_suggestion_contains_site_url(tg):
    msg = tg.format_quorum_suggestion("2024-01-01", 8)
    assert tg.SITE_URL in msg


@pytest.mark.telegram
def test_format_quorum_suggestion_emoji_and_header(tg):
    msg = tg.format_quorum_suggestion("2024-01-01", 8)
    assert "✨" in msg
    assert "<b>Oportunidade de evento</b>" in msg


# ---------------------------------------------------------------------------
# format_reminder_24h
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_format_reminder_24h_non_dynamic_has_quorum(tg):
    msg = tg.format_reminder_24h("Omega", "2024-01-01", 5, 8, dynamic=False)
    assert "Confirmados: 5/8" in msg


@pytest.mark.telegram
def test_format_reminder_24h_dynamic_no_quorum_fraction(tg):
    msg = tg.format_reminder_24h("Omega", "2024-01-01", 5, 8, dynamic=True)
    assert "Confirmados: 5." in msg
    assert "Confirmados: 5/8" not in msg


@pytest.mark.telegram
def test_format_reminder_24h_with_description(tg):
    msg = tg.format_reminder_24h("Omega", "2024-01-01", 5, 8, description="Check gear")
    assert "<b>Detalhes:</b>" in msg
    assert "Check gear" in msg


@pytest.mark.telegram
def test_format_reminder_24h_without_description(tg):
    msg = tg.format_reminder_24h("Omega", "2024-01-01", 5, 8)
    assert "Detalhes" not in msg


@pytest.mark.telegram
def test_format_reminder_24h_contains_pretty_date(tg):
    msg = tg.format_reminder_24h("Omega", "2024-01-05", 5, 8)
    assert "sex, 05/01" in msg


@pytest.mark.telegram
def test_format_reminder_24h_emoji_and_header(tg):
    msg = tg.format_reminder_24h("Omega", "2024-01-01", 5, 8)
    assert "⏰" in msg
    assert "<b>Lembrete</b>" in msg


@pytest.mark.telegram
def test_format_reminder_24h_contains_site_url(tg):
    msg = tg.format_reminder_24h("Omega", "2024-01-01", 5, 8)
    assert tg.SITE_URL in msg


# ---------------------------------------------------------------------------
# format_reminder_today
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_format_reminder_today_non_dynamic_has_quorum(tg):
    msg = tg.format_reminder_today("Omega", "2024-01-01", 5, 8, dynamic=False)
    assert "Confirmados: 5/8" in msg


@pytest.mark.telegram
def test_format_reminder_today_dynamic_no_quorum_fraction(tg):
    msg = tg.format_reminder_today("Omega", "2024-01-01", 5, 8, dynamic=True)
    assert "Confirmados: 5." in msg
    assert "Confirmados: 5/8" not in msg


@pytest.mark.telegram
def test_format_reminder_today_with_description(tg):
    msg = tg.format_reminder_today("Omega", "2024-01-01", 5, 8, description="Farm night")
    assert "<b>Detalhes:</b>" in msg
    assert "Farm night" in msg


@pytest.mark.telegram
def test_format_reminder_today_without_description(tg):
    msg = tg.format_reminder_today("Omega", "2024-01-01", 5, 8)
    assert "Detalhes" not in msg


@pytest.mark.telegram
def test_format_reminder_today_contains_pretty_date(tg):
    msg = tg.format_reminder_today("Omega", "2024-01-05", 5, 8)
    assert "sex, 05/01" in msg


@pytest.mark.telegram
def test_format_reminder_today_emoji_and_header(tg):
    msg = tg.format_reminder_today("Omega", "2024-01-01", 5, 8)
    assert "⚔️" in msg
    assert "<b>É hoje!</b>" in msg


@pytest.mark.telegram
def test_format_reminder_today_contains_boa_raid(tg):
    msg = tg.format_reminder_today("Omega", "2024-01-01", 5, 8)
    assert "Boa raid!" in msg


# ---------------------------------------------------------------------------
# SITE_URL configuration (module-level env var)
# ---------------------------------------------------------------------------

@pytest.mark.telegram
def test_site_url_default_value(tg):
    """When SITE_URL env var is unset, module has a non-empty default."""
    assert tg.SITE_URL
    assert tg.SITE_URL.startswith("http")


@pytest.mark.telegram
def test_site_url_custom_env_reflected_in_formatters(monkeypatch):
    """Changing SITE_URL before import changes formatter output."""
    monkeypatch.setenv("SITE_URL", "https://my-custom-planner.example.com")
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    for mod_name in ("server.app", "server.telegram", "server.auth", "server.db"):
        sys.modules.pop(mod_name, None)
    tg2 = importlib.import_module("server.telegram")
    assert tg2.SITE_URL == "https://my-custom-planner.example.com"
    msg = tg2.format_event_created("Prog", "2024-01-01", 5, 8)
    assert "https://my-custom-planner.example.com" in msg


@pytest.mark.telegram
def test_site_url_env_changes_quorum_suggestion_url(monkeypatch):
    monkeypatch.setenv("SITE_URL", "https://raid-planner-staging.example.com")
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    for mod_name in ("server.app", "server.telegram", "server.auth", "server.db"):
        sys.modules.pop(mod_name, None)
    tg2 = importlib.import_module("server.telegram")
    msg = tg2.format_quorum_suggestion("2024-01-01", 6)
    assert "https://raid-planner-staging.example.com" in msg


@pytest.mark.telegram
def test_site_url_env_changes_bulk_cancel_url(monkeypatch):
    monkeypatch.setenv("SITE_URL", "https://raid-planner-staging.example.com")
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    for mod_name in ("server.app", "server.telegram", "server.auth", "server.db"):
        sys.modules.pop(mod_name, None)
    tg2 = importlib.import_module("server.telegram")
    msg = tg2.format_event_cancelled_bulk(2)
    assert "https://raid-planner-staging.example.com" in msg


# ---------------------------------------------------------------------------
# Fase Q — _format_time_suffix + horário em mensagens
# ---------------------------------------------------------------------------

@pytest.mark.telegram
class TestFaseQTimeFormatting:
    def test_format_time_suffix_with_time_only(self, tg):
        assert tg._format_time_suffix("20:30") == " às 20:30"

    def test_format_time_suffix_with_time_and_duration_round_hours(self, tg):
        assert tg._format_time_suffix("20:30", 120) == " às 20:30 (2h)"

    def test_format_time_suffix_with_time_and_duration_partial(self, tg):
        assert tg._format_time_suffix("20:30", 150) == " às 20:30 (2h30)"

    def test_format_time_suffix_without_time_returns_placeholder(self, tg):
        assert tg._format_time_suffix(None) == " (horário a definir)"
        assert tg._format_time_suffix("") == " (horário a definir)"

    def test_format_event_created_with_time_includes_suffix(self, tg):
        msg = tg.format_event_created("DSR", "2024-01-01", 8, 8, time_str="20:30", duration_min=180)
        assert "às 20:30 (3h)" in msg

    def test_format_event_created_without_time_shows_placeholder(self, tg):
        msg = tg.format_event_created("DSR", "2024-01-01", 8, 8)
        assert "(horário a definir)" in msg

    def test_format_reminder_24h_with_time(self, tg):
        msg = tg.format_reminder_24h("FRU", "2024-01-01", 6, 8, time_str="21:00", duration_min=120)
        assert "às 21:00 (2h)" in msg

    def test_format_reminder_today_without_time(self, tg):
        msg = tg.format_reminder_today("FRU", "2024-01-01", 6, 8)
        assert "(horário a definir)" in msg

    def test_format_event_postponed_includes_times_when_present(self, tg):
        msg = tg.format_event_postponed(
            "DSR", "2024-01-01", "2024-01-08",
            old_time="20:30", new_time="21:00",
        )
        assert "20:30" in msg
        assert "21:00" in msg

    def test_format_event_postponed_works_without_times(self, tg):
        """Retrocompat — não passa old_time/new_time: mensagem sai como antes."""
        msg = tg.format_event_postponed("DSR", "2024-01-01", "2024-01-08")
        assert "DSR foi adiado" in msg
        # Sem time, não deve aparecer "às" no suffix
        assert "às" not in msg

    def test_format_event_cancelled_with_time(self, tg):
        msg = tg.format_event_cancelled("FRU", "2024-01-01", time_str="20:30")
        assert "20:30" in msg

    def test_format_event_cancelled_without_time(self, tg):
        """Retrocompat — sem time_str funciona como antes."""
        msg = tg.format_event_cancelled("FRU", "2024-01-01")
        assert "Cancelado" in msg

    def test_format_quorum_suggestion_with_window(self, tg):
        msg = tg.format_quorum_suggestion("2024-01-01", 8, window_start="20:00", window_end="22:00")
        assert "20:00–22:00" in msg
        assert "na janela" in msg

    def test_format_quorum_suggestion_without_window_legacy(self, tg):
        """Sem window_start/window_end mantém formato legado."""
        msg = tg.format_quorum_suggestion("2024-01-01", 8)
        assert "20:00–22:00" not in msg
        assert "8 pessoa(s) disponíveis" in msg

