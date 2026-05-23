"""Tests for character routes and helpers in server/app.py.

Coverage:
- _load_characters_for_static helper
- GET /api/character
- PUT /api/character
- POST /api/character/claim-slot
"""
from __future__ import annotations

import json

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_roster_with_slot(slot_id="slot-1", name="Warrior of Light", ilvl=640,
                            jobs_pool=None, user_id=None):
    """Returns a minimal state payload with a single roster slot."""
    jobs_pool = jobs_pool or ["WAR"]
    slot = {
        "id": slot_id,
        "name": name,
        "ilvl": ilvl,
        "jobsPool": jobs_pool,
        "statusByProg": {},
    }
    if user_id is not None:
        slot["user_id"] = user_id
    return {
        "roster": [slot],
        "events": [],
        "customContents": [],
        "expansions": [],
    }


# ---------------------------------------------------------------------------
# GET /api/character
# ---------------------------------------------------------------------------

class TestGetCharacter:

    def test_anonymous_returns_401(self, client):
        res = client.get("/api/character")
        assert res.status_code == 401

    def test_new_user_no_character_returns_empty_dict(self, api, admin_user):
        # After fresh registration the migration sets an empty character_json
        res = api.get_character()
        assert res.status_code == 200
        body = res.get_json()
        # The migration stores an empty-ish character; we just require it's a dict
        assert isinstance(body, dict)

    def test_returns_stored_character_json(self, api, admin_user):
        char = {"name": "Estinien", "ilvl": 665, "jobs": [{"id": "DRG"}],
                "subscribedProgs": ["p12s"], "currentExpansionId": "dt"}
        api.put_character(char)
        res = api.get_character()
        assert res.status_code == 200
        body = res.get_json()
        assert body["name"] == "Estinien"
        assert body["ilvl"] == 665
        assert body["jobs"] == [{"id": "DRG"}]
        assert body["subscribedProgs"] == ["p12s"]
        assert body["currentExpansionId"] == "dt"

    def test_returns_exact_keys_saved(self, api, admin_user):
        char = {"name": "Y'shtola", "ilvl": 700}
        api.put_character(char)
        body = api.get_character().get_json()
        assert body["name"] == "Y'shtola"
        assert body["ilvl"] == 700


# ---------------------------------------------------------------------------
# PUT /api/character
# ---------------------------------------------------------------------------

class TestPutCharacter:

    def test_anonymous_returns_401(self, client):
        res = client.put("/api/character", json={"name": "anon"})
        assert res.status_code == 401

    def test_save_and_retrieve_roundtrip(self, api, admin_user):
        char = {"name": "Thancred", "ilvl": 600, "jobs": [{"id": "GNB"}],
                "subscribedProgs": [], "currentExpansionId": None}
        res = api.put_character(char)
        assert res.status_code == 200
        body = res.get_json()
        assert body.get("ok") is True

        retrieved = api.get_character().get_json()
        assert retrieved["name"] == "Thancred"
        assert retrieved["ilvl"] == 600

    # --- name validation ---

    def test_name_max_80_chars_accepted(self, api, admin_user):
        char = {"name": "A" * 80}
        res = api.put_character(char)
        assert res.status_code == 200

    def test_name_81_chars_rejected(self, api, admin_user):
        char = {"name": "A" * 81}
        res = api.put_character(char)
        assert res.status_code == 400
        assert res.get_json()["error"] == "name_too_long"

    def test_name_non_string_rejected(self, api, admin_user):
        res = api.put_character({"name": 42})
        assert res.status_code == 400
        assert res.get_json()["error"] == "invalid_name"

    def test_name_null_accepted(self, api, admin_user):
        # null name means "not set" — route allows it
        res = api.put_character({"name": None})
        assert res.status_code == 200

    # --- ilvl validation ---

    def test_ilvl_zero_accepted(self, api, admin_user):
        res = api.put_character({"ilvl": 0})
        assert res.status_code == 200

    def test_ilvl_positive_accepted(self, api, admin_user):
        res = api.put_character({"ilvl": 665})
        assert res.status_code == 200

    def test_ilvl_negative_rejected(self, api, admin_user):
        res = api.put_character({"ilvl": -1})
        assert res.status_code == 400
        assert res.get_json()["error"] == "invalid_ilvl"

    def test_ilvl_string_rejected(self, api, admin_user):
        res = api.put_character({"ilvl": "640"})
        assert res.status_code == 400
        assert res.get_json()["error"] == "invalid_ilvl"

    def test_ilvl_float_rejected(self, api, admin_user):
        # 640.5 is a float — not isinstance(x, int) in Python (float != int)
        res = api.put_character({"ilvl": 640.5})
        assert res.status_code == 400
        assert res.get_json()["error"] == "invalid_ilvl"

    def test_ilvl_null_accepted(self, api, admin_user):
        res = api.put_character({"ilvl": None})
        assert res.status_code == 200

    # --- jobs validation ---

    def test_jobs_list_accepted(self, api, admin_user):
        res = api.put_character({"jobs": [{"id": "WAR"}, {"id": "DRK"}]})
        assert res.status_code == 200

    def test_jobs_empty_list_accepted(self, api, admin_user):
        res = api.put_character({"jobs": []})
        assert res.status_code == 200

    def test_jobs_non_list_rejected(self, api, admin_user):
        res = api.put_character({"jobs": "WAR"})
        assert res.status_code == 400
        assert res.get_json()["error"] == "invalid_jobs"

    def test_jobs_dict_rejected(self, api, admin_user):
        res = api.put_character({"jobs": {"id": "WAR"}})
        assert res.status_code == 400
        assert res.get_json()["error"] == "invalid_jobs"

    def test_jobs_null_accepted(self, api, admin_user):
        res = api.put_character({"jobs": None})
        assert res.status_code == 200

    # --- subscribedProgs validation ---

    def test_subscribed_progs_list_accepted(self, api, admin_user):
        res = api.put_character({"subscribedProgs": ["p12s", "m4s"]})
        assert res.status_code == 200

    def test_subscribed_progs_non_list_rejected(self, api, admin_user):
        res = api.put_character({"subscribedProgs": "p12s"})
        assert res.status_code == 400
        assert res.get_json()["error"] == "invalid_subscribedProgs"

    def test_subscribed_progs_null_accepted(self, api, admin_user):
        res = api.put_character({"subscribedProgs": None})
        assert res.status_code == 200

    # --- currentExpansionId ---

    def test_current_expansion_id_string_accepted(self, api, admin_user):
        res = api.put_character({"currentExpansionId": "dt"})
        assert res.status_code == 200
        body = api.get_character().get_json()
        assert body["currentExpansionId"] == "dt"

    def test_current_expansion_id_null_accepted(self, api, admin_user):
        res = api.put_character({"currentExpansionId": None})
        assert res.status_code == 200

    # --- unknown / extra fields ---

    def test_extra_unknown_fields_accepted(self, api, admin_user):
        # Route does no strict filtering — unknown fields pass through
        res = api.put_character({"name": "Alphinaud", "unknownField": "value"})
        assert res.status_code == 200
        body = api.get_character().get_json()
        assert body["name"] == "Alphinaud"
        # extra field should be stored (no stripping in the route)
        assert "unknownField" in body

    # --- payload size ---

    def test_payload_too_large_rejected(self, api, admin_user):
        # 20KB limit — build a payload just over it
        big = {"name": "X", "data": "A" * 21000}
        res = api.put_character(big)
        assert res.status_code == 413

    # --- non-dict body ---

    def test_non_dict_json_rejected(self, api, admin_user):
        res = api.client.put("/api/character", json=["not", "a", "dict"])
        assert res.status_code == 400
        assert res.get_json()["error"] == "invalid_json"

    # --- cascades into linked slot (commit 710157b) ---

    def test_put_character_cascades_to_slot_not_tested_directly(self, api, admin_user):
        """PUT /api/character only updates users.character_json — the
        slot cascade (jobsPool sync) mentioned in commit 710157b is handled
        in the party/state route, not here. This is a no-op assertion to
        document scope."""
        # After saving a character, GET returns the new data unchanged
        char = {"name": "G'raha Tia", "ilvl": 665, "jobs": [{"id": "RDM"}]}
        api.put_character(char)
        body = api.get_character().get_json()
        assert body["name"] == "G'raha Tia"


# ---------------------------------------------------------------------------
# POST /api/character/claim-slot
# ---------------------------------------------------------------------------

class TestClaimSlot:

    def test_anonymous_returns_401(self, client):
        res = client.post("/api/character/claim-slot", json={"slot_id": "s1"})
        assert res.status_code == 401

    def test_missing_slot_id_returns_400(self, api, admin_user):
        res = api.claim_slot(None)  # claim_slot posts {"slot_id": None}
        assert res.status_code == 400
        assert res.get_json()["error"] == "missing_slot_id"

    def test_empty_slot_id_returns_400(self, api, admin_user):
        res = api.client.post("/api/character/claim-slot", json={"slot_id": ""})
        assert res.status_code == 400
        assert res.get_json()["error"] == "missing_slot_id"

    def test_no_active_static_returns_400(self, api):
        # Register user but force active_static_id to NULL by using a fresh user
        # that has no static at all — impossible via normal API but we can use
        # member_user that has been removed from the static.
        # Simpler: register a user that has active static but then switch to no static.
        # Actually with current bootstrap every user gets a global static.
        # We test via a user with no active static by poking DB.
        api.register("lonely")
        api.login("lonely")
        # At this point they ARE in global static (auto-attached).
        # To get 400 we need active_static_id = NULL — do it directly.
        from server import app as server_app
        with server_app.db_conn() as conn:
            conn.execute("UPDATE users SET active_static_id = NULL WHERE username = 'lonely'")
        res = api.claim_slot("any-slot")
        assert res.status_code == 400
        assert res.get_json()["error"] == "no_active_static"

    def test_unknown_slot_returns_404(self, api, admin_user):
        # Admin is in global static; its roster is empty by default
        res = api.claim_slot("nonexistent-slot-xyz")
        assert res.status_code == 404
        assert res.get_json()["error"] == "slot_not_found"

    def test_slot_claimed_by_other_user_returns_409(self, api, admin_user, member_user):
        # member_user fixture leaves us logged in as member_user.
        # Log in as admin to put the state with a slot claimed by admin.
        api.logout()
        api.login("admin_user")
        admin_me = api.client.get("/api/me").get_json()
        admin_id = admin_me["id"]

        state = _make_roster_with_slot(slot_id="slot-taken", user_id=admin_id)
        api.put_state(state)

        # Switch to member and try to claim the same slot
        api.logout()
        api.login("member_user")
        res = api.claim_slot("slot-taken")
        assert res.status_code == 409
        assert res.get_json()["error"] == "slot_already_claimed"

    def test_user_already_has_a_slot_returns_409(self, api, admin_user):
        # Put two slots in the roster: one owned by admin, one free
        admin_me = api.client.get("/api/me").get_json()
        admin_id = admin_me["id"]

        state = {
            "roster": [
                {"id": "slot-mine", "name": "Mine", "ilvl": 600, "jobsPool": [],
                 "statusByProg": {}, "user_id": admin_id},
                {"id": "slot-free", "name": "Free", "ilvl": 600, "jobsPool": [],
                 "statusByProg": {}},
            ],
            "events": [],
            "customContents": [],
            "expansions": [],
        }
        api.put_state(state)

        # Admin tries to claim the free slot but already has slot-mine
        res = api.claim_slot("slot-free")
        assert res.status_code == 409
        assert res.get_json()["error"] == "already_has_slot"

    def test_successful_claim_links_user_to_slot(self, api, admin_user):
        state = _make_roster_with_slot(slot_id="open-slot", name="Hydaelyn",
                                       ilvl=650, jobs_pool=["WHM", "SGE"])
        api.put_state(state)

        res = api.claim_slot("open-slot")
        assert res.status_code == 200
        body = res.get_json()
        assert body["ok"] is True
        assert body["slot_id"] == "open-slot"
        assert isinstance(body["character"], dict)

    def test_successful_claim_backfills_character_from_slot(self, api, admin_user):
        state = _make_roster_with_slot(slot_id="s1", name="Hydaelyn",
                                       ilvl=670, jobs_pool=["WHM"])
        api.put_state(state)

        res = api.claim_slot("s1")
        assert res.status_code == 200
        char = res.get_json()["character"]
        assert char["name"] == "Hydaelyn"
        assert char["ilvl"] == 670
        assert char["jobs"] == [{"id": "WHM"}]
        assert "currentExpansionId" in char
        assert isinstance(char["subscribedProgs"], list)

    def test_successful_claim_does_not_overwrite_existing_character(self, api, admin_user):
        # User already has a character set before claiming
        api.put_character({"name": "My Name", "ilvl": 700, "jobs": [{"id": "DRK"}],
                           "subscribedProgs": [], "currentExpansionId": "dt"})

        state = _make_roster_with_slot(slot_id="s2", name="Slot Name", ilvl=500,
                                       jobs_pool=["WAR"])
        api.put_state(state)

        res = api.claim_slot("s2")
        assert res.status_code == 200
        char = res.get_json()["character"]
        # Existing values should NOT be overwritten
        assert char["name"] == "My Name"
        assert char["ilvl"] == 700
        assert char["jobs"] == [{"id": "DRK"}]

    def test_get_character_reflects_claimed_slot(self, api, admin_user):
        state = _make_roster_with_slot(slot_id="s3", name="Elidibus", ilvl=680,
                                       jobs_pool=["SMN"])
        api.put_state(state)

        api.claim_slot("s3")
        char = api.get_character().get_json()
        assert char["name"] == "Elidibus"
        assert char["ilvl"] == 680
        assert char["jobs"] == [{"id": "SMN"}]

    def test_claim_slot_idempotent_for_same_user(self, api, admin_user):
        """A user who already owns a slot cannot claim it again (treated as
        'already_has_slot'). The route checks for existing slot ownership first
        before checking if the target slot is free, so this returns 409."""
        admin_me = api.client.get("/api/me").get_json()
        admin_id = admin_me["id"]

        # Slot already owned by admin
        state = {
            "roster": [
                {"id": "my-slot", "name": "Mine", "ilvl": 600, "jobsPool": [],
                 "statusByProg": {}, "user_id": admin_id},
            ],
            "events": [],
            "customContents": [],
            "expansions": [],
        }
        api.put_state(state)

        # Second claim attempt returns 409 already_has_slot
        res = api.claim_slot("my-slot")
        assert res.status_code == 409
        assert res.get_json()["error"] == "already_has_slot"


# ---------------------------------------------------------------------------
# _load_characters_for_static helper
# ---------------------------------------------------------------------------

class TestLoadCharactersForStatic:

    def test_returns_empty_dict_for_static_with_no_characters(self, app_module, api, admin_user):
        """Members without character_json are skipped; result may be empty or
        contain the backfilled empty character from the migration."""
        admin_me = api.client.get("/api/me").get_json()
        static_id = admin_me.get("active_static_id")
        assert static_id is not None

        conn = app_module.get_conn()
        try:
            # Wipe character_json for admin to simulate no-character state
            conn.execute("UPDATE users SET character_json = NULL WHERE id = ?",
                         (admin_me["id"],))
            conn.commit()
            result = app_module._load_characters_for_static(conn, static_id)
        finally:
            conn.close()

        # With NULL character_json the user is skipped
        assert admin_me["id"] not in result

    def test_returns_parsed_character_for_members(self, app_module, api, admin_user):
        char = {"name": "Zenos", "ilvl": 750, "jobs": [{"id": "SAM"}],
                "subscribedProgs": [], "currentExpansionId": None}
        api.put_character(char)

        admin_me = api.client.get("/api/me").get_json()
        static_id = admin_me.get("active_static_id")

        conn = app_module.get_conn()
        try:
            result = app_module._load_characters_for_static(conn, static_id)
        finally:
            conn.close()

        assert admin_me["id"] in result
        assert result[admin_me["id"]]["name"] == "Zenos"
        assert result[admin_me["id"]]["ilvl"] == 750

    def test_members_without_character_json_are_skipped(self, app_module, api,
                                                         admin_user, member_user):
        # member_user gets a backfilled character via migration — wipe it
        from server import app as server_app

        admin_me = api.client.get("/api/me").get_json()

        # Find member id
        api.logout()
        api.login("admin_user")
        static_id = api.client.get("/api/me").get_json().get("active_static_id")
        members = api.members(static_id).get_json()
        member_id = next(m["id"] for m in members if m["username"] == "member_user")

        conn = app_module.get_conn()
        try:
            conn.execute("UPDATE users SET character_json = NULL WHERE id = ?", (member_id,))
            conn.commit()
            result = app_module._load_characters_for_static(conn, static_id)
        finally:
            conn.close()

        assert member_id not in result

    def test_invalid_json_in_character_is_skipped(self, app_module, api, admin_user):
        admin_me = api.client.get("/api/me").get_json()
        static_id = admin_me.get("active_static_id")

        conn = app_module.get_conn()
        try:
            conn.execute("UPDATE users SET character_json = 'not-valid-json' WHERE id = ?",
                         (admin_me["id"],))
            conn.commit()
            result = app_module._load_characters_for_static(conn, static_id)
        finally:
            conn.close()

        assert admin_me["id"] not in result

    def test_returns_dict_keyed_by_user_id(self, app_module, api, admin_user):
        char = {"name": "Venat", "ilvl": 600}
        api.put_character(char)

        admin_me = api.client.get("/api/me").get_json()
        static_id = admin_me.get("active_static_id")

        conn = app_module.get_conn()
        try:
            result = app_module._load_characters_for_static(conn, static_id)
        finally:
            conn.close()

        # Keys must be integer user ids
        for key in result.keys():
            assert isinstance(key, int)

    def test_multiple_members_all_returned(self, app_module, api, admin_user, member_user):
        # Both users in the global static should appear in the result
        # Admin sets their character
        api.logout()
        api.login("admin_user")
        api.put_character({"name": "Admin Char", "ilvl": 600})
        admin_id = api.client.get("/api/me").get_json()["id"]
        static_id = api.client.get("/api/me").get_json()["active_static_id"]

        # Member sets their character
        api.logout()
        api.login("member_user")
        api.put_character({"name": "Member Char", "ilvl": 500})
        member_id = api.client.get("/api/me").get_json()["id"]

        conn = app_module.get_conn()
        try:
            result = app_module._load_characters_for_static(conn, static_id)
        finally:
            conn.close()

        assert admin_id in result
        assert member_id in result
        assert result[admin_id]["name"] == "Admin Char"
        assert result[member_id]["name"] == "Member Char"
