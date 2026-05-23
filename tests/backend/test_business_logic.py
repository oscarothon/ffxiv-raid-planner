"""Tests for pure business-logic helpers in server/app.py.

Covers:
  - _today_local
  - _resolve_prog
  - _expansion_order
  - _is_event_compatible
  - _count_confirmed_for_date
  - _is_dynamic_prog
  - _evaluate_quorum_opportunities
  - APP_TZ / APP_TZ_OFFSET_HOURS configuration
"""
from __future__ import annotations

import importlib
import os
import sys
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest
from freezegun import freeze_time

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


# ---------------------------------------------------------------------------
# Module-scoped fixture that respects the -4 default (matches conftest)
# ---------------------------------------------------------------------------

@pytest.fixture
def app_module(tmp_path, monkeypatch):
    """Reload server.app with an isolated SQLite DB and APP_TZ_OFFSET_HOURS=-4."""
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
def app_module_utc(tmp_path, monkeypatch):
    """Same as app_module but with APP_TZ_OFFSET_HOURS=0 (UTC)."""
    db_path = tmp_path / "test_utc.db"
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    monkeypatch.setenv("SECRET_KEY", "test-secret-key")
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET", raising=False)
    monkeypatch.setenv("APP_TZ_OFFSET_HOURS", "0")

    for mod_name in ("server.app", "server.telegram", "server.auth", "server.db"):
        if mod_name in sys.modules:
            del sys.modules[mod_name]

    return importlib.import_module("server.app")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _state(**kwargs):
    """Build a minimal state_data dict, merging extra kwargs."""
    base = {
        "roster": [],
        "events": [],
        "customContents": [],
        "expansions": [
            {"id": "arr", "name": "A Realm Reborn", "levelCap": 50, "order": 1},
            {"id": "hw",  "name": "Heavensward",    "levelCap": 60, "order": 2},
            {"id": "sb",  "name": "Stormblood",     "levelCap": 70, "order": 3},
            {"id": "shb", "name": "Shadowbringers",  "levelCap": 80, "order": 4},
            {"id": "ew",  "name": "Endwalker",       "levelCap": 90, "order": 5},
            {"id": "dt",  "name": "Dawntrail",       "levelCap": 100, "order": 6},
        ],
    }
    base.update(kwargs)
    return base


def _roster_avail(n_users, date_str, start_uid=1):
    """Build roster list with `n_users` entries all marking `date_str` as avail."""
    return [
        {"user_id": start_uid + i, "monthlySchedule": {date_str: "avail"}}
        for i in range(n_users)
    ]


# ---------------------------------------------------------------------------
# APP_TZ / APP_TZ_OFFSET_HOURS configuration
# ---------------------------------------------------------------------------

class TestAppTzConfig:
    def test_default_offset_is_minus_four(self, app_module):
        assert app_module.APP_TZ_OFFSET_HOURS == -4

    def test_utc_offset_is_zero(self, app_module_utc):
        assert app_module_utc.APP_TZ_OFFSET_HOURS == 0

    def test_app_tz_matches_offset(self, app_module):
        from datetime import timedelta, timezone
        expected = timezone(timedelta(hours=-4))
        assert app_module.APP_TZ == expected


# ---------------------------------------------------------------------------
# _today_local
# ---------------------------------------------------------------------------

class TestTodayLocal:
    def test_minus_four_at_utc_midnight_returns_previous_day(self, app_module):
        """UTC midnight is 20:00 local time the previous calendar day at -4."""
        with freeze_time("2025-05-24 00:00:00"):
            result = app_module._today_local()
        assert result == date(2025, 5, 23)

    def test_minus_four_after_midnight_local_returns_same_day(self, app_module):
        """04:30 UTC = 00:30 local at -4 — still the same calendar day."""
        with freeze_time("2025-05-24 04:30:00"):
            result = app_module._today_local()
        assert result == date(2025, 5, 24)

    def test_utc_offset_zero_at_midnight(self, app_module_utc):
        """With offset 0, UTC midnight is still the same calendar day."""
        with freeze_time("2025-05-24 00:00:00"):
            result = app_module_utc._today_local()
        assert result == date(2025, 5, 24)

    def test_returns_date_not_datetime(self, app_module):
        with freeze_time("2025-05-24 12:00:00"):
            result = app_module._today_local()
        assert isinstance(result, date)
        # Ensure it is NOT a full datetime (no time attributes beyond date)
        assert not hasattr(result, "hour")


# ---------------------------------------------------------------------------
# _resolve_prog
# ---------------------------------------------------------------------------

class TestResolveProg:
    def test_none_prog_id_returns_none(self, app_module):
        assert app_module._resolve_prog({}, None) is None

    def test_empty_string_returns_none(self, app_module):
        assert app_module._resolve_prog({}, "") is None

    def test_builtin_fru(self, app_module):
        prog = app_module._resolve_prog({}, "FRU")
        assert isinstance(prog, dict)
        assert prog.get("expansionId") == "dt"

    def test_builtin_top(self, app_module):
        prog = app_module._resolve_prog({}, "TOP")
        assert prog.get("expansionId") == "ew"

    def test_builtin_blu_limited(self, app_module):
        prog = app_module._resolve_prog({}, "blue_mage_raid")
        assert prog.get("partyMode") == "limited"
        assert prog.get("limitedJobId") == "BLU"

    def test_custom_content_found(self, app_module):
        state = _state(customContents=[
            {"id": "my_prog", "partyMode": "full", "expansionId": "dt"},
        ])
        prog = app_module._resolve_prog(state, "my_prog")
        assert prog["expansionId"] == "dt"

    def test_custom_content_preferred_over_builtin(self, app_module):
        """If user defines a custom content with same id as a built-in, custom wins."""
        state = _state(customContents=[
            {"id": "FRU", "expansionId": "ew", "partyMode": "full"},
        ])
        prog = app_module._resolve_prog(state, "FRU")
        assert prog["expansionId"] == "ew"

    def test_unknown_id_returns_none(self, app_module):
        assert app_module._resolve_prog({}, "nonexistent_prog_xyz") is None

    def test_state_without_customcontents_key(self, app_module):
        """State dict without 'customContents' key must not raise."""
        state = {"expansions": []}  # no customContents key
        prog = app_module._resolve_prog(state, "FRU")
        assert prog is not None

    def test_customcontents_none_value(self, app_module):
        state = {"customContents": None}
        prog = app_module._resolve_prog(state, "FRU")
        assert prog is not None

    def test_non_dict_entries_in_custom_skipped(self, app_module):
        """Non-dict entries in customContents list must not raise."""
        state = _state(customContents=["garbage", None, {"id": "real", "partyMode": "light"}])
        prog = app_module._resolve_prog(state, "real")
        assert prog["partyMode"] == "light"


# ---------------------------------------------------------------------------
# _expansion_order
# ---------------------------------------------------------------------------

class TestExpansionOrder:
    @pytest.mark.parametrize("exp_id,expected_order", [
        ("arr", 1),
        ("hw",  2),
        ("sb",  3),
        ("shb", 4),
        ("ew",  5),
        ("dt",  6),
        ("limited", 99),
    ])
    def test_seed_orders(self, app_module, exp_id, expected_order):
        """Empty state falls back to _SEED_EXPANSION_ORDERS."""
        assert app_module._expansion_order({}, exp_id) == expected_order

    def test_state_expansion_overrides_seed(self, app_module):
        """Explicit state.expansions entry wins over seed fallback."""
        state = _state(expansions=[{"id": "arr", "order": 99}])
        assert app_module._expansion_order(state, "arr") == 99

    def test_none_expansion_id_returns_none(self, app_module):
        assert app_module._expansion_order({}, None) is None

    def test_empty_string_returns_none(self, app_module):
        assert app_module._expansion_order({}, "") is None

    def test_unknown_expansion_returns_none(self, app_module):
        assert app_module._expansion_order({}, "unknown_exp_zzz") is None

    def test_state_expansions_none_value_falls_back_to_seed(self, app_module):
        state = {"expansions": None}
        assert app_module._expansion_order(state, "dt") == 6

    def test_float_order_accepted(self, app_module):
        state = _state(expansions=[{"id": "arr", "order": 1.5}])
        assert app_module._expansion_order(state, "arr") == 1.5


# ---------------------------------------------------------------------------
# _is_event_compatible
# ---------------------------------------------------------------------------

class TestIsEventCompatible:
    # ---- Permissive fallbacks ----

    def test_no_event_returns_true(self, app_module):
        assert app_module._is_event_compatible(_state(), None, {"currentExpansionId": "dt"}) is True

    def test_no_character_returns_true(self, app_module):
        assert app_module._is_event_compatible(_state(), {"progId": "FRU"}, None) is True

    def test_unknown_prog_returns_true(self, app_module):
        """Unknown prog means no restriction — permissive."""
        event = {"progId": "prog_that_does_not_exist"}
        char = {"currentExpansionId": "arr"}
        assert app_module._is_event_compatible(_state(), event, char) is True

    def test_prog_without_expansion_id_returns_true(self, app_module):
        state = _state(customContents=[{"id": "no_exp_prog", "partyMode": "full"}])
        event = {"progId": "no_exp_prog"}
        char = {"currentExpansionId": "arr"}
        assert app_module._is_event_compatible(state, event, char) is True

    def test_char_without_current_expansion_returns_true(self, app_module):
        """Legacy character without currentExpansionId is permissive — never blocked."""
        event = {"progId": "FRU"}
        char = {}  # no currentExpansionId
        assert app_module._is_event_compatible(_state(), event, char) is True

    # ---- Normal expansion gating ----

    def test_char_at_dt_compatible_with_dt_event(self, app_module):
        event = {"progId": "FRU"}  # FRU = dt
        char = {"currentExpansionId": "dt"}
        assert app_module._is_event_compatible(_state(), event, char) is True

    def test_char_at_ew_compatible_with_dt_event(self, app_module):
        """DT order = 6, EW order = 5 — char not at DT yet."""
        event = {"progId": "FRU"}
        char = {"currentExpansionId": "ew"}
        assert app_module._is_event_compatible(_state(), event, char) is False

    def test_char_at_arr_incompatible_with_dt_event(self, app_module):
        event = {"progId": "FRU"}
        char = {"currentExpansionId": "arr"}
        assert app_module._is_event_compatible(_state(), event, char) is False

    def test_char_at_same_expansion_as_event_compatible(self, app_module):
        """Content expansion order == char expansion order → compatible."""
        event = {"progId": "TOP"}  # ew
        char = {"currentExpansionId": "ew"}
        assert app_module._is_event_compatible(_state(), event, char) is True

    def test_char_at_higher_expansion_compatible(self, app_module):
        """DT char (order 6) can do EW content (order 5)."""
        event = {"progId": "TOP"}  # ew = 5
        char = {"currentExpansionId": "dt"}
        assert app_module._is_event_compatible(_state(), event, char) is True

    def test_custom_expansion_order_used(self, app_module):
        """If state.expansions overrides order, that takes precedence."""
        state = _state(
            customContents=[{"id": "custom_dt_prog", "partyMode": "full", "expansionId": "dt"}],
            expansions=[
                {"id": "arr", "order": 1},
                {"id": "dt",  "order": 6},
            ],
        )
        event = {"progId": "custom_dt_prog"}
        assert app_module._is_event_compatible(state, event, {"currentExpansionId": "arr"}) is False
        assert app_module._is_event_compatible(state, event, {"currentExpansionId": "dt"})  is True

    def test_event_with_unknown_expansion_id_in_prog_returns_true(self, app_module):
        state = _state(customContents=[{"id": "future_prog", "partyMode": "full", "expansionId": "unknown_exp"}])
        event = {"progId": "future_prog"}
        char = {"currentExpansionId": "arr"}
        assert app_module._is_event_compatible(state, event, char) is True

    # ---- Limited content gating ----

    def test_limited_blu_level_too_low(self, app_module):
        event = {"progId": "blue_mage_raid", "limitedJobMinLevel": 70}
        char = {"jobs": [{"id": "BLU", "level": 50}]}
        assert app_module._is_event_compatible(_state(), event, char) is False

    def test_limited_blu_exact_minimum_level(self, app_module):
        event = {"progId": "blue_mage_raid", "limitedJobMinLevel": 70}
        char = {"jobs": [{"id": "BLU", "level": 70}]}
        assert app_module._is_event_compatible(_state(), event, char) is True

    def test_limited_blu_level_above_minimum(self, app_module):
        event = {"progId": "blue_mage_raid", "limitedJobMinLevel": 70}
        char = {"jobs": [{"id": "BLU", "level": 80}]}
        assert app_module._is_event_compatible(_state(), event, char) is True

    def test_limited_blu_job_missing_from_char(self, app_module):
        event = {"progId": "blue_mage_raid", "limitedJobMinLevel": 70}
        char = {"jobs": [{"id": "WHM", "level": 90}]}
        assert app_module._is_event_compatible(_state(), event, char) is False

    def test_limited_char_has_no_jobs_list(self, app_module):
        event = {"progId": "blue_mage_raid", "limitedJobMinLevel": 70}
        char = {"currentExpansionId": "dt"}  # no jobs key
        assert app_module._is_event_compatible(_state(), event, char) is False

    def test_limited_event_without_min_level_is_permissive(self, app_module):
        """Legacy limited event with no limitedJobMinLevel → permissive fallback."""
        event = {"progId": "blue_mage_raid"}  # no limitedJobMinLevel
        char = {"currentExpansionId": "arr"}
        assert app_module._is_event_compatible(_state(), event, char) is True

    def test_limited_event_with_zero_min_level_is_permissive(self, app_module):
        """limitedJobMinLevel=0 is treated as no restriction."""
        event = {"progId": "blue_mage_raid", "limitedJobMinLevel": 0}
        char = {}  # no jobs
        assert app_module._is_event_compatible(_state(), event, char) is True

    def test_limited_unknown_prog_no_job_id_permissive(self, app_module):
        """If limitedJobMinLevel is set but prog is unknown (no limitedJobId), permissive."""
        state = _state(customContents=[{"id": "custom_lim", "partyMode": "limited"}])  # no limitedJobId
        event = {"progId": "custom_lim", "limitedJobMinLevel": 50}
        char = {}
        assert app_module._is_event_compatible(state, event, char) is True

    def test_limited_char_job_level_string_coerced(self, app_module):
        """Job level stored as string should be coerced correctly."""
        event = {"progId": "blue_mage_raid", "limitedJobMinLevel": 70}
        char = {"jobs": [{"id": "BLU", "level": "80"}]}
        assert app_module._is_event_compatible(_state(), event, char) is True

    def test_limited_char_job_level_non_numeric_string(self, app_module):
        """Non-numeric level string → treated as 0 → not compatible."""
        event = {"progId": "blue_mage_raid", "limitedJobMinLevel": 70}
        char = {"jobs": [{"id": "BLU", "level": "max"}]}
        assert app_module._is_event_compatible(_state(), event, char) is False


# ---------------------------------------------------------------------------
# _count_confirmed_for_date
# ---------------------------------------------------------------------------

class TestCountConfirmedForDate:
    def test_empty_roster_returns_zero(self, app_module):
        assert app_module._count_confirmed_for_date(_state(), "2025-06-01") == 0

    def test_counts_avail_status_only(self, app_module):
        state = _state(roster=[
            {"user_id": 1, "monthlySchedule": {"2025-06-01": "avail"}},
            {"user_id": 2, "monthlySchedule": {"2025-06-01": "maybe"}},
            {"user_id": 3, "monthlySchedule": {"2025-06-01": "unavail"}},
        ])
        assert app_module._count_confirmed_for_date(state, "2025-06-01") == 1

    def test_does_not_count_other_dates(self, app_module):
        state = _state(roster=[
            {"user_id": 1, "monthlySchedule": {"2025-06-02": "avail"}},
        ])
        assert app_module._count_confirmed_for_date(state, "2025-06-01") == 0

    def test_counts_multiple_avail(self, app_module):
        state = _state(roster=_roster_avail(5, "2025-06-01"))
        assert app_module._count_confirmed_for_date(state, "2025-06-01") == 5

    def test_with_event_and_chars_filters_incompatible(self, app_module):
        """When event + characters provided, incompatible chars don't count."""
        date_str = "2025-06-01"
        state = _state(roster=_roster_avail(4, date_str))
        event = {"progId": "FRU"}  # dt content
        # Users 1-2 compatible (dt), users 3-4 incompatible (arr)
        chars = {
            1: {"currentExpansionId": "dt"},
            2: {"currentExpansionId": "dt"},
            3: {"currentExpansionId": "arr"},
            4: {"currentExpansionId": "arr"},
        }
        assert app_module._count_confirmed_for_date(state, date_str, event=event, characters=chars) == 2

    def test_without_event_counts_all_avail_regardless_of_expansion(self, app_module):
        date_str = "2025-06-01"
        state = _state(roster=_roster_avail(4, date_str))
        assert app_module._count_confirmed_for_date(state, date_str) == 4

    def test_slot_without_character_counts_permissively(self, app_module):
        """Roster slot with no character in chars map → counted (permissive)."""
        date_str = "2025-06-01"
        state = _state(roster=[{"user_id": 99, "monthlySchedule": {date_str: "avail"}}])
        event = {"progId": "FRU"}
        chars = {}  # user 99 not present
        assert app_module._count_confirmed_for_date(state, date_str, event=event, characters=chars) == 1

    def test_non_dict_roster_entries_skipped(self, app_module):
        state = _state(roster=["bad_entry", None, {"user_id": 1, "monthlySchedule": {"2025-06-01": "avail"}}])
        assert app_module._count_confirmed_for_date(state, "2025-06-01") == 1

    def test_empty_monthly_schedule_returns_zero(self, app_module):
        state = _state(roster=[{"user_id": 1, "monthlySchedule": {}}])
        assert app_module._count_confirmed_for_date(state, "2025-06-01") == 0


# ---------------------------------------------------------------------------
# _is_dynamic_prog
# ---------------------------------------------------------------------------

class TestIsDynamicProg:
    def test_builtin_prog_always_false(self, app_module):
        """Built-in progs are never dynamic — only custom ones can be."""
        assert app_module._is_dynamic_prog({}, "FRU") is False

    def test_custom_full_party_is_false(self, app_module):
        state = _state(customContents=[{"id": "prog1", "partyMode": "full"}])
        assert app_module._is_dynamic_prog(state, "prog1") is False

    def test_custom_light_party_is_false(self, app_module):
        state = _state(customContents=[{"id": "prog1", "partyMode": "light"}])
        assert app_module._is_dynamic_prog(state, "prog1") is False

    def test_custom_dynamic_is_true(self, app_module):
        state = _state(customContents=[{"id": "prog1", "partyMode": "dynamic"}])
        assert app_module._is_dynamic_prog(state, "prog1") is True

    def test_custom_missing_party_mode_defaults_to_full(self, app_module):
        """Missing partyMode defaults to 'full', not dynamic."""
        state = _state(customContents=[{"id": "prog1"}])
        assert app_module._is_dynamic_prog(state, "prog1") is False

    def test_unknown_id_is_false(self, app_module):
        assert app_module._is_dynamic_prog({}, "does_not_exist") is False

    def test_state_without_customcontents(self, app_module):
        assert app_module._is_dynamic_prog({}, "prog1") is False


# ---------------------------------------------------------------------------
# _evaluate_quorum_opportunities
# ---------------------------------------------------------------------------

def _patch_quorum_deps(app_module, chat_id="test_chat_123", is_configured=True,
                       send_returns=True, chars=None):
    """Context manager stack for _evaluate_quorum_opportunities dependencies."""
    import contextlib

    @contextlib.contextmanager
    def combined():
        with patch.object(app_module, "_get_static_telegram_chat_id", return_value=chat_id):
            with patch.object(app_module.tg, "is_configured", return_value=is_configured):
                with patch.object(app_module.tg, "send_group_message", return_value=send_returns) as mock_send:
                    with patch.object(app_module, "get_conn"):
                        with patch.object(app_module, "_load_characters_for_static",
                                          return_value=chars or {}):
                            yield mock_send

    return combined()


class TestEvaluateQuorumOpportunities:
    TODAY = "2025-05-23"
    FUTURE = "2025-05-25"

    # ---- Guard clauses ----

    def test_no_telegram_chat_id_returns_false(self, app_module):
        state = _state()
        with patch.object(app_module, "_get_static_telegram_chat_id", return_value=None):
            with patch.object(app_module.tg, "is_configured", return_value=True):
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False

    def test_telegram_not_configured_returns_false(self, app_module):
        state = _state()
        with patch.object(app_module, "_get_static_telegram_chat_id", return_value="chat"):
            with patch.object(app_module.tg, "is_configured", return_value=False):
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False

    def test_no_active_progs_returns_false(self, app_module):
        state = _state(activeProgs=[], roster=_roster_avail(8, self.FUTURE))
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False
        assert mock_send.call_count == 0

    # ---- Full party (8 players) ----

    def test_full_party_8_confirmed_triggers_suggestion(self, app_module):
        state = _state(
            customContents=[{"id": "fp", "partyMode": "full"}],
            activeProgs=["fp"],
            roster=_roster_avail(8, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is True
        assert mock_send.call_count == 1
        assert state["quorumSuggestionsSent"].get(self.FUTURE) is True

    def test_full_party_7_confirmed_does_not_trigger(self, app_module):
        state = _state(
            customContents=[{"id": "fp", "partyMode": "full"}],
            activeProgs=["fp"],
            roster=_roster_avail(7, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False
        assert mock_send.call_count == 0

    # ---- Light party (4 players) ----

    def test_light_party_4_confirmed_triggers_suggestion(self, app_module):
        state = _state(
            customContents=[{"id": "lp", "partyMode": "light"}],
            activeProgs=["lp"],
            roster=_roster_avail(4, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is True
        assert mock_send.call_count == 1

    def test_light_party_3_confirmed_does_not_trigger(self, app_module):
        state = _state(
            customContents=[{"id": "lp", "partyMode": "light"}],
            activeProgs=["lp"],
            roster=_roster_avail(3, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False
        assert mock_send.call_count == 0

    # ---- Dynamic prog ----

    def test_dynamic_with_custom_quorum_triggers_when_reached(self, app_module):
        state = _state(
            customContents=[{"id": "dyn", "partyMode": "dynamic", "quorum": 5}],
            activeProgs=["dyn"],
            roster=_roster_avail(5, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is True
        assert mock_send.call_count == 1

    def test_dynamic_with_custom_quorum_below_threshold_does_not_trigger(self, app_module):
        state = _state(
            customContents=[{"id": "dyn", "partyMode": "dynamic", "quorum": 5}],
            activeProgs=["dyn"],
            roster=_roster_avail(4, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False
        assert mock_send.call_count == 0

    def test_dynamic_without_quorum_field_does_not_trigger(self, app_module):
        """Dynamic prog with no quorum configured → must not emit anything."""
        state = _state(
            customContents=[{"id": "dyn", "partyMode": "dynamic"}],  # no quorum
            activeProgs=["dyn"],
            roster=_roster_avail(8, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False
        assert mock_send.call_count == 0

    def test_dynamic_with_quorum_zero_does_not_trigger(self, app_module):
        """quorum=0 is an invalid threshold and must be ignored."""
        state = _state(
            customContents=[{"id": "dyn", "partyMode": "dynamic", "quorum": 0}],
            activeProgs=["dyn"],
            roster=_roster_avail(8, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False
        assert mock_send.call_count == 0

    # ---- Booked dates ----

    def test_booked_date_not_suggested(self, app_module):
        """A date that already has a raidEvent should not get a suggestion."""
        state = _state(
            customContents=[{"id": "fp", "partyMode": "full"}],
            activeProgs=["fp"],
            raidEvents=[{"date": self.FUTURE}],
            roster=_roster_avail(8, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False
        assert mock_send.call_count == 0

    def test_postponed_event_blocks_target_date(self, app_module):
        """A postponed event occupies postponedTo, not its original date."""
        state = _state(
            customContents=[{"id": "fp", "partyMode": "full"}],
            activeProgs=["fp"],
            raidEvents=[{"date": "2025-05-10", "postponedTo": self.FUTURE}],
            roster=_roster_avail(8, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False
        assert mock_send.call_count == 0

    # ---- Past dates ----

    def test_past_date_not_suggested(self, app_module):
        """Dates before today must never emit suggestions."""
        past = "2025-05-20"  # before freeze date 2025-05-23
        state = _state(
            customContents=[{"id": "fp", "partyMode": "full"}],
            activeProgs=["fp"],
            roster=_roster_avail(8, past),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False
        assert mock_send.call_count == 0

    # ---- Already sent ----

    def test_already_sent_date_not_re_suggested(self, app_module):
        state = _state(
            customContents=[{"id": "fp", "partyMode": "full"}],
            activeProgs=["fp"],
            quorumSuggestionsSent={self.FUTURE: True},
            roster=_roster_avail(8, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False
        assert mock_send.call_count == 0

    def test_old_sent_entries_cleaned_up(self, app_module):
        """Past entries in quorumSuggestionsSent must be housekept (dropped)."""
        past_sent = "2025-05-01"
        state = _state(
            customContents=[{"id": "fp", "partyMode": "full"}],
            activeProgs=["fp"],
            quorumSuggestionsSent={past_sent: True},
            roster=_roster_avail(0, self.FUTURE),  # no new triggers
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module):
                app_module._evaluate_quorum_opportunities(state, 1)
        assert past_sent not in (state.get("quorumSuggestionsSent") or {})

    # ---- Limited progs excluded ----

    def test_limited_prog_not_a_candidate(self, app_module):
        """Limited content progs must never be quorum candidates."""
        state = _state(
            customContents=[{"id": "blu_custom", "partyMode": "limited", "limitedJobId": "BLU"}],
            activeProgs=["blu_custom"],
            roster=_roster_avail(8, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False
        assert mock_send.call_count == 0

    # ---- Incompatible characters ----

    def test_incompatible_chars_not_counted_toward_quorum(self, app_module):
        """Only compatible chars count — if they don't reach threshold, no suggestion."""
        date_str = self.FUTURE
        state = _state(
            customContents=[{"id": "fru_custom", "partyMode": "full", "expansionId": "dt"}],
            activeProgs=["fru_custom"],
            roster=_roster_avail(8, date_str),  # 8 total
        )
        # Only 3 of 8 are at DT expansion — below 8-player threshold
        chars = {uid: {"currentExpansionId": "dt"} for uid in range(1, 4)}
        chars.update({uid: {"currentExpansionId": "arr"} for uid in range(4, 9)})

        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module, chars=chars) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is False
        assert mock_send.call_count == 0

    def test_compatible_chars_exactly_at_threshold_triggers(self, app_module):
        """Exactly 8 compatible DT chars should still trigger."""
        date_str = self.FUTURE
        state = _state(
            customContents=[{"id": "fru_custom", "partyMode": "full", "expansionId": "dt"}],
            activeProgs=["fru_custom"],
            roster=_roster_avail(8, date_str),
        )
        chars = {uid: {"currentExpansionId": "dt"} for uid in range(1, 9)}

        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module, chars=chars) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        assert result is True
        assert mock_send.call_count >= 1

    # ---- quorumSuggestionsSent state mutation ----

    def test_state_mutated_in_place_after_send(self, app_module):
        state = _state(
            customContents=[{"id": "fp", "partyMode": "full"}],
            activeProgs=["fp"],
            roster=_roster_avail(8, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module):
                app_module._evaluate_quorum_opportunities(state, 1)
        assert "quorumSuggestionsSent" in state
        assert state["quorumSuggestionsSent"].get(self.FUTURE) is True

    # ---- Multiple progs ----

    def test_multiple_progs_picks_highest_surplus(self, app_module):
        """When multiple progs are active, the one with more surplus players wins."""
        date_str = self.FUTURE
        state = _state(
            customContents=[
                {"id": "lp", "partyMode": "light"},   # threshold 4
                {"id": "fp", "partyMode": "full"},    # threshold 8
            ],
            activeProgs=["lp", "fp"],
            roster=_roster_avail(10, date_str),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module) as mock_send:
                result = app_module._evaluate_quorum_opportunities(state, 1)
        # Should still send exactly one message per qualifying date
        assert result is True
        assert mock_send.call_count == 1

    # ---- Send failure ----

    def test_send_failure_does_not_mark_sent(self, app_module):
        """If send_group_message returns falsy, date must NOT be recorded as sent."""
        state = _state(
            customContents=[{"id": "fp", "partyMode": "full"}],
            activeProgs=["fp"],
            roster=_roster_avail(8, self.FUTURE),
        )
        with freeze_time(self.TODAY):
            with _patch_quorum_deps(app_module, send_returns=False):
                app_module._evaluate_quorum_opportunities(state, 1)
        sent = state.get("quorumSuggestionsSent") or {}
        assert self.FUTURE not in sent
