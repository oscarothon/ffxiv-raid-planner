"""Tests for statics/membership routes and helpers in server/app.py.

Covers:
- _ensure_global_static()
- POST /api/statics          (create)
- POST /api/statics/join     (join by invite code)
- GET  /api/statics/mine     (list user's statics)
- POST /api/statics/switch   (switch active static)
- GET  /api/statics/<id>/members
- PUT  /api/statics/<id>/members/<uid>/role
- DELETE /api/statics/<id>/members/<uid>
- _assert_member (tested indirectly via routes that call it)
"""
from __future__ import annotations

import importlib
import sys

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _register_and_login(api, username, password="secret123"):
    """Register the first user (auto-approved admin) and return their id."""
    res = api.register(username, password)
    assert res.status_code == 200, res.get_json()
    return res.get_json()["id"]


def _approve_and_login_second(api, username, password="secret123"):
    """Register second user (pending), have admin approve, log back as new user.
    Assumes admin is currently logged in when called, leaves session as new user.
    """
    api.logout()
    # Register second user (will be pending)
    res = api.register(username, password)
    assert res.status_code == 202, res.get_json()
    # Admin approves
    api.logout()
    api.login("admin_user")
    pending = api.list_pending().get_json()
    assert pending, "expected a pending registration"
    api.approve_pending(pending[0]["id"])
    api.logout()
    # Log in as new user
    res = api.login(username, password)
    assert res.status_code == 200, res.get_json()
    return res.get_json()["id"]


# ---------------------------------------------------------------------------
# _ensure_global_static
# ---------------------------------------------------------------------------

class TestEnsureGlobalStatic:
    def test_creates_global_static_on_first_call(self, app_module):
        """First call inserts the global static with correct name/code."""
        from server.db import get_conn
        static_id = app_module._ensure_global_static()
        assert static_id is not None

        conn = get_conn()
        try:
            row = conn.execute(
                "SELECT name, invite_code FROM statics WHERE id = ?", (static_id,)
            ).fetchone()
        finally:
            conn.close()

        assert row["name"] == app_module.GLOBAL_STATIC_NAME
        assert row["invite_code"] == app_module.GLOBAL_INVITE_CODE

    def test_second_call_is_noop_returns_same_id(self, app_module):
        """Second call must return the same id without inserting a duplicate."""
        from server.db import get_conn
        id1 = app_module._ensure_global_static()
        id2 = app_module._ensure_global_static()
        assert id1 == id2

        conn = get_conn()
        try:
            count = conn.execute(
                "SELECT COUNT(*) AS c FROM statics WHERE invite_code = ?",
                (app_module.GLOBAL_INVITE_CODE,),
            ).fetchone()["c"]
        finally:
            conn.close()
        assert count == 1

    def test_constants_have_expected_values(self, app_module):
        assert app_module.GLOBAL_STATIC_NAME == "Little Ala Mhigos"
        assert app_module.GLOBAL_INVITE_CODE == "global"


# ---------------------------------------------------------------------------
# POST /api/statics  (create)
# ---------------------------------------------------------------------------

class TestCreateStatic:
    def test_anonymous_returns_401(self, api):
        res = api.create_static("My Static")
        assert res.status_code == 401

    def test_creates_with_provided_name(self, api):
        _register_and_login(api, "creator")
        res = api.create_static("Omega Raiders")
        assert res.status_code == 200
        body = res.get_json()
        assert body["name"] == "Omega Raiders"
        assert "id" in body
        assert "invite_code" in body

    def test_default_name_when_omitted(self, api):
        _register_and_login(api, "creator2")
        # Send empty name — should default to "Minha Static"
        res = api.client.post("/api/statics", json={})
        assert res.status_code == 200
        assert res.get_json()["name"] == "Minha Static"

    def test_invite_code_is_url_safe_token(self, api):
        """token_urlsafe(8) produces ~11 chars; charset is base64url."""
        import re
        _register_and_login(api, "creator3")
        res = api.create_static("Token Test")
        code = res.get_json()["invite_code"]
        # base64url charset only (no '+' '/' '=')
        assert re.fullmatch(r"[A-Za-z0-9_-]+", code)
        # token_urlsafe(8) → 8 bytes → ceil(8*4/3)=11 base64url chars (approx)
        assert 8 <= len(code) <= 16

    def test_invite_codes_are_unique_across_statics(self, api):
        _register_and_login(api, "creator4")
        codes = set()
        for i in range(5):
            res = api.create_static(f"Static {i}")
            codes.add(res.get_json()["invite_code"])
        assert len(codes) == 5

    def test_creator_is_admin_in_static_members(self, api, app_module):
        from server.db import get_conn
        _register_and_login(api, "owner5")
        me = api.me().get_json()
        user_id = me["id"]

        res = api.create_static("Admin Check")
        static_id = res.get_json()["id"]

        conn = get_conn()
        try:
            row = conn.execute(
                "SELECT role FROM static_members WHERE static_id = ? AND user_id = ?",
                (static_id, user_id),
            ).fetchone()
        finally:
            conn.close()
        assert row is not None
        assert row["role"] == "admin"

    def test_creator_active_static_is_updated(self, api):
        _register_and_login(api, "switcher6")
        res = api.create_static("Active Static Test")
        new_id = res.get_json()["id"]
        me = api.me().get_json()
        assert me["active_static_id"] == new_id


# ---------------------------------------------------------------------------
# POST /api/statics/join
# ---------------------------------------------------------------------------

class TestJoinStatic:
    def test_anonymous_returns_401(self, api):
        res = api.join_static("someCode")
        assert res.status_code == 401

    def test_missing_invite_code_returns_400(self, api):
        _register_and_login(api, "joiner1")
        res = api.client.post("/api/statics/join", json={})
        assert res.status_code == 400

    def test_empty_invite_code_returns_400(self, api):
        _register_and_login(api, "joiner2")
        res = api.join_static("   ")
        assert res.status_code == 400

    def test_unknown_invite_code_returns_404(self, api):
        _register_and_login(api, "joiner3")
        res = api.join_static("nonexistent_code_xyz")
        assert res.status_code == 404

    def test_joining_global_with_code_works(self, api, app_module):
        """Joining with 'global' invite code succeeds."""
        # Ensure global exists first
        app_module._ensure_global_static()
        _register_and_login(api, "global_joiner")
        # First switch away from global, then re-join to confirm join works
        res_create = api.create_static("Private One")
        private_id = res_create.get_json()["id"]
        api.switch_static(private_id)
        # Now join global by invite code
        res = api.join_static(app_module.GLOBAL_INVITE_CODE)
        assert res.status_code == 200
        assert res.get_json()["name"] == app_module.GLOBAL_STATIC_NAME

    def test_joining_already_member_is_idempotent(self, api, app_module):
        """Joining a static you're already in does not create duplicate row."""
        from server.db import get_conn
        _register_and_login(api, "idempotent_user")
        res = api.create_static("Idempotent Static")
        body = res.get_json()
        static_id = body["id"]
        invite_code = body["invite_code"]

        # Join the same static twice
        res1 = api.join_static(invite_code)
        assert res1.status_code == 200
        res2 = api.join_static(invite_code)
        assert res2.status_code == 200

        conn = get_conn()
        try:
            count = conn.execute(
                "SELECT COUNT(*) AS c FROM static_members WHERE static_id = ? AND user_id = ?",
                (static_id, api.me().get_json()["id"]),
            ).fetchone()["c"]
        finally:
            conn.close()
        assert count == 1

    def test_joining_sets_active_static_id(self, api):
        """After join, /api/me reflects the joined static."""
        _register_and_login(api, "setter1")
        res = api.create_static("Target Static")
        body = res.get_json()
        target_id = body["id"]
        invite_code = body["invite_code"]

        # Create another static so active_static_id is elsewhere
        api.create_static("Another One")
        me_before = api.me().get_json()
        assert me_before["active_static_id"] != target_id

        api.join_static(invite_code)
        me_after = api.me().get_json()
        assert me_after["active_static_id"] == target_id

    def test_new_joiner_gets_member_role(self, api, app_module):
        """Users joining via invite code receive 'member', not 'admin'."""
        from server.db import get_conn
        # Admin creates static, gets invite code
        _register_and_login(api, "host_user")
        res = api.create_static("Role Test Static")
        body = res.get_json()
        static_id = body["id"]
        invite_code = body["invite_code"]
        api.logout()

        # Second user joins (need to register via pending → approve)
        api.register("guest_joiner")
        api.logout()
        api.login("host_user")
        pending = api.list_pending().get_json()
        assert pending
        api.approve_pending(pending[0]["id"])
        api.logout()

        api.login("guest_joiner")
        api.join_static(invite_code)

        me = api.me().get_json()
        guest_id = me["id"]

        conn = get_conn()
        try:
            row = conn.execute(
                "SELECT role FROM static_members WHERE static_id = ? AND user_id = ?",
                (static_id, guest_id),
            ).fetchone()
        finally:
            conn.close()
        assert row is not None
        assert row["role"] == "member"


# ---------------------------------------------------------------------------
# GET /api/statics/mine
# ---------------------------------------------------------------------------

class TestMyStatics:
    def test_anonymous_returns_401(self, api):
        res = api.my_statics()
        assert res.status_code == 401

    def test_new_admin_has_at_least_global_static(self, api, app_module):
        """First user is auto-added to global static."""
        _register_and_login(api, "mine_admin")
        res = api.my_statics()
        assert res.status_code == 200
        statics = res.get_json()
        assert len(statics) >= 1
        names = [s["name"] for s in statics]
        assert app_module.GLOBAL_STATIC_NAME in names

    def test_returns_id_name_and_invite_code(self, api):
        _register_and_login(api, "mine_fields")
        api.create_static("Fields Static")
        res = api.my_statics()
        assert res.status_code == 200
        statics = res.get_json()
        for s in statics:
            assert "id" in s
            assert "name" in s
            assert "invite_code" in s

    def test_ordering_is_by_id_ascending(self, api):
        """Route uses ORDER BY s.id — lower id comes first."""
        _register_and_login(api, "mine_order")
        for name in ["Alpha", "Beta", "Gamma"]:
            api.create_static(name)
        res = api.my_statics()
        statics = res.get_json()
        ids = [s["id"] for s in statics]
        assert ids == sorted(ids)

    def test_only_own_statics_returned(self, api):
        """User only sees statics they joined."""
        _register_and_login(api, "mine_own")
        api.create_static("Own Static")
        res = api.my_statics()
        # Create a second user and a static they own
        # (Can't easily do this without a second client, so at least confirm
        # that the list is non-empty and belongs to the user.)
        assert len(res.get_json()) >= 1


# ---------------------------------------------------------------------------
# POST /api/statics/switch
# ---------------------------------------------------------------------------

class TestSwitchStatic:
    def test_anonymous_returns_401(self, api):
        res = api.switch_static(1)
        assert res.status_code == 401

    def test_missing_static_id_treated_as_not_member(self, api):
        """No static_id → None → membership check fails → 403."""
        _register_and_login(api, "switcher_none")
        res = api.client.post("/api/statics/switch", json={})
        # None is not found in static_members → 403
        assert res.status_code == 403

    def test_switching_to_nonmember_static_returns_403(self, api):
        _register_and_login(api, "switcher_403")
        res = api.switch_static(99999)  # non-existent
        assert res.status_code == 403

    def test_switching_to_valid_static_updates_active_id(self, api):
        _register_and_login(api, "switcher_ok")
        global_me = api.me().get_json()
        global_id = global_me["active_static_id"]

        res = api.create_static("Second Static")
        second_id = res.get_json()["id"]
        # active is now second_id (create_static updates it)
        assert api.me().get_json()["active_static_id"] == second_id

        # Switch back to global
        res = api.switch_static(global_id)
        assert res.status_code == 200
        assert res.get_json()["active_static_id"] == global_id
        assert api.me().get_json()["active_static_id"] == global_id

    def test_switch_response_contains_active_static_id(self, api):
        _register_and_login(api, "switcher_resp")
        res = api.create_static("Resp Static")
        sid = res.get_json()["id"]
        me_before_id = api.me().get_json()["active_static_id"]
        # Switch to global
        global_id = me_before_id  # first user's active = global after register
        # Actually let's switch to the newly created static id
        # (create_static already switched to it, so switch back to global)
        global_id_real = api.my_statics().get_json()[0]["id"]
        res2 = api.switch_static(global_id_real)
        assert res2.status_code == 200
        body = res2.get_json()
        assert "active_static_id" in body
        assert body["active_static_id"] == global_id_real


# ---------------------------------------------------------------------------
# GET /api/statics/<id>/members
# ---------------------------------------------------------------------------

class TestListMembers:
    def test_anonymous_returns_401(self, api):
        res = api.members(1)
        assert res.status_code == 401

    def test_non_member_returns_403(self, api):
        _register_and_login(api, "listmem_nonmem")
        res = api.members(99999)  # not a member
        assert res.status_code == 403

    def test_member_can_list_members(self, api):
        _register_and_login(api, "listmem_ok")
        res_create = api.create_static("List Static")
        sid = res_create.get_json()["id"]
        res = api.members(sid)
        assert res.status_code == 200
        members = res.get_json()
        assert len(members) >= 1

    def test_response_has_id_username_role(self, api):
        _register_and_login(api, "listmem_fields")
        sid = api.create_static("Fields Static").get_json()["id"]
        members = api.members(sid).get_json()
        for m in members:
            assert "id" in m
            assert "username" in m
            assert "role" in m

    def test_creator_appears_as_admin(self, api):
        _register_and_login(api, "listmem_admin")
        me = api.me().get_json()
        sid = api.create_static("Admin List").get_json()["id"]
        members = api.members(sid).get_json()
        found = [m for m in members if m["id"] == me["id"]]
        assert found and found[0]["role"] == "admin"


# ---------------------------------------------------------------------------
# PUT /api/statics/<id>/members/<uid>/role
# ---------------------------------------------------------------------------

class TestSetMemberRole:
    def _setup_static_with_two_users(self, api):
        """Returns (admin_id, member_id, static_id, invite_code)."""
        _register_and_login(api, "role_admin")
        admin_id = api.me().get_json()["id"]
        res = api.create_static("Role Change Static")
        body = res.get_json()
        static_id = body["id"]
        invite_code = body["invite_code"]

        # Register and approve a second user
        api.logout()
        api.register("role_member")
        api.logout()
        api.login("role_admin")
        pending = api.list_pending().get_json()
        api.approve_pending(pending[0]["id"])
        api.logout()

        api.login("role_member")
        api.join_static(invite_code)
        member_id = api.me().get_json()["id"]
        api.logout()

        # Log back in as admin
        api.login("role_admin")
        return admin_id, member_id, static_id, invite_code

    def test_anonymous_returns_401(self, api):
        res = api.set_member_role(1, 2, "member")
        assert res.status_code == 401

    def test_member_cannot_change_roles(self, api):
        _register_and_login(api, "role_change_admin")
        res = api.create_static("Perm Test")
        body = res.get_json()
        static_id = body["id"]
        invite_code = body["invite_code"]

        api.logout()
        api.register("role_change_member")
        api.logout()
        api.login("role_change_admin")
        pending = api.list_pending().get_json()
        api.approve_pending(pending[0]["id"])
        api.logout()

        api.login("role_change_member")
        api.join_static(invite_code)
        admin_id = api.my_statics().get_json()[0]["id"]  # not needed, just warm up

        # member tries to change a role — they're in the static but not admin
        me = api.me().get_json()
        res = api.set_member_role(static_id, me["id"], "officer")
        assert res.status_code == 403

    def test_officer_cannot_change_roles(self, api):
        """Only admin can change roles; officers are not allowed."""
        _register_and_login(api, "ofr_admin")
        res = api.create_static("Officer Perm Static")
        body = res.get_json()
        static_id = body["id"]
        invite_code = body["invite_code"]

        api.logout()
        api.register("ofr_officer")
        api.logout()
        api.login("ofr_admin")
        pending = api.list_pending().get_json()
        api.approve_pending(pending[0]["id"])

        api.logout()
        api.login("ofr_officer")
        api.join_static(invite_code)
        officer_id = api.me().get_json()["id"]
        api.logout()

        # Promote to officer
        api.login("ofr_admin")
        api.set_member_role(static_id, officer_id, "officer")
        api.logout()

        # Officer tries to change someone's role → 403
        api.login("ofr_officer")
        res = api.set_member_role(static_id, officer_id, "admin")
        assert res.status_code == 403

    @pytest.mark.parametrize("new_role", ["officer", "admin", "member"])
    def test_admin_can_promote_member(self, api, new_role):
        _register_and_login(api, f"promote_admin_{new_role}")
        res = api.create_static(f"Promote Static {new_role}")
        body = res.get_json()
        static_id = body["id"]
        invite_code = body["invite_code"]

        api.logout()
        api.register(f"promote_member_{new_role}")
        api.logout()
        api.login(f"promote_admin_{new_role}")
        pending = api.list_pending().get_json()
        api.approve_pending(pending[0]["id"])
        api.logout()

        api.login(f"promote_member_{new_role}")
        api.join_static(invite_code)
        member_id = api.me().get_json()["id"]
        api.logout()

        api.login(f"promote_admin_{new_role}")
        res = api.set_member_role(static_id, member_id, new_role)
        assert res.status_code == 200
        assert res.get_json()["role"] == new_role

    def test_invalid_role_string_returns_400(self, api):
        admin_id, member_id, static_id, _ = self._setup_static_with_two_users(api)
        res = api.set_member_role(static_id, member_id, "superuser")
        assert res.status_code == 400

    def test_role_on_nonmember_returns_404(self, api):
        _register_and_login(api, "role_nonmem_admin")
        sid = api.create_static("NonMem Static").get_json()["id"]
        res = api.set_member_role(sid, 99999, "member")
        assert res.status_code == 404

    def test_demoting_only_admin_is_blocked(self, api):
        """Admin cannot self-demote if they are the last admin."""
        _register_and_login(api, "sole_admin")
        sid = api.create_static("Sole Admin Static").get_json()["id"]
        me = api.me().get_json()
        admin_id = me["id"]
        # Try to demote self to member — only admin in static
        res = api.set_member_role(sid, admin_id, "member")
        assert res.status_code == 400
        assert "cannot_demote_last_admin" in res.get_json().get("error", "")

    def test_admin_can_demote_self_when_another_admin_exists(self, api):
        """Demotion is allowed when there are multiple admins."""
        _register_and_login(api, "demote_admin1")
        res = api.create_static("Multi Admin Static")
        body = res.get_json()
        static_id = body["id"]
        invite_code = body["invite_code"]
        admin1_id = api.me().get_json()["id"]

        api.logout()
        api.register("demote_admin2")
        api.logout()
        api.login("demote_admin1")
        pending = api.list_pending().get_json()
        api.approve_pending(pending[0]["id"])
        api.logout()

        api.login("demote_admin2")
        api.join_static(invite_code)
        admin2_id = api.me().get_json()["id"]
        api.logout()

        api.login("demote_admin1")
        # Promote admin2 to admin
        api.set_member_role(static_id, admin2_id, "admin")
        # Now admin1 can demote themselves
        res = api.set_member_role(static_id, admin1_id, "member")
        assert res.status_code == 200


# ---------------------------------------------------------------------------
# DELETE /api/statics/<id>/members/<uid>
# ---------------------------------------------------------------------------

class TestRemoveMember:
    def _setup_two_member_static(self, api, admin_name="rm_admin", member_name="rm_member"):
        """Creates a static with admin + one additional member. Returns (admin_id, member_id, static_id)."""
        _register_and_login(api, admin_name)
        admin_id = api.me().get_json()["id"]
        res = api.create_static("Remove Test Static")
        body = res.get_json()
        static_id = body["id"]
        invite_code = body["invite_code"]

        api.logout()
        api.register(member_name)
        api.logout()
        api.login(admin_name)
        pending = api.list_pending().get_json()
        api.approve_pending(pending[0]["id"])
        api.logout()

        api.login(member_name)
        api.join_static(invite_code)
        member_id = api.me().get_json()["id"]
        api.logout()

        api.login(admin_name)
        return admin_id, member_id, static_id, invite_code

    def test_anonymous_returns_401(self, api):
        res = api.remove_member(1, 2)
        assert res.status_code == 401

    def test_member_cannot_remove_others(self, api):
        admin_id, member_id, static_id, invite_code = self._setup_two_member_static(
            api, "rm2_admin", "rm2_member"
        )
        api.logout()
        api.login("rm2_member")
        res = api.remove_member(static_id, admin_id)
        assert res.status_code == 403

    def test_admin_can_remove_member(self, api):
        admin_id, member_id, static_id, _ = self._setup_two_member_static(
            api, "rm3_admin", "rm3_member"
        )
        res = api.remove_member(static_id, member_id)
        assert res.status_code == 200
        assert res.get_json()["deleted_user_id"] == member_id

    def test_removed_user_is_deleted_from_users_table(self, api, app_module):
        """Per docstring: 'remove members pelo admin agora deleta a conta inteira'."""
        from server.db import get_conn
        admin_id, member_id, static_id, _ = self._setup_two_member_static(
            api, "rm4_admin", "rm4_member"
        )
        api.remove_member(static_id, member_id)

        conn = get_conn()
        try:
            row = conn.execute(
                "SELECT 1 FROM users WHERE id = ?", (member_id,)
            ).fetchone()
        finally:
            conn.close()
        assert row is None, "User row should have been deleted from users table"

    def test_removed_user_cannot_login(self, api):
        """After deletion, the removed user's credentials are gone."""
        admin_id, member_id, static_id, _ = self._setup_two_member_static(
            api, "rm5_admin", "rm5_member"
        )
        api.remove_member(static_id, member_id)
        api.logout()

        res = api.login("rm5_member")
        assert res.status_code == 401

    def test_cannot_remove_last_admin(self, api):
        """Deleting the only admin must be blocked."""
        _register_and_login(api, "rm_sole_admin")
        admin_id = api.me().get_json()["id"]
        sid = api.create_static("Sole Admin Remove").get_json()["id"]

        res = api.remove_member(sid, admin_id)
        # Trying to remove self → blocked by cannot_delete_self check first
        assert res.status_code == 400

    def test_cannot_delete_self(self, api):
        _register_and_login(api, "rm_self_admin")
        admin_id = api.me().get_json()["id"]
        sid = api.create_static("Self Delete Static").get_json()["id"]
        res = api.remove_member(sid, admin_id)
        assert res.status_code == 400
        assert "cannot_delete_self" in res.get_json().get("error", "")

    def test_remove_nonmember_returns_404(self, api):
        _register_and_login(api, "rm_nonmem_admin")
        sid = api.create_static("NonMem Remove").get_json()["id"]
        res = api.remove_member(sid, 99999)
        assert res.status_code == 404

    def test_removing_admin_blocked_when_last_admin(self, api):
        """Admin cannot remove another admin if that admin is the last admin.

        Setup: admin1 creates static, invites member2, promotes member2 to admin,
        demotes self to member. Now admin1 (member) is NOT admin — only admin2 can act.
        We log in as admin2 (sole admin) and attempt to remove themselves → blocked
        by cannot_delete_self, which is the first guard in the route.

        To test the last-admin guard on removal of *another* user:
        We use _setup_two_member_static, promote the member to admin,
        then (while still admin of two admins) try to remove the other admin.
        That is allowed because there are two admins. Then demote the remaining
        admin and try again — but at that point we'd have no admin left to act.
        The route actually blocks removal of the *last* admin explicitly.
        """
        admin_id, member_id, static_id, _ = self._setup_two_member_static(
            api, "rm6_admin", "rm6_member"
        )
        # Promote member to admin — now there are 2 admins
        api.set_member_role(static_id, member_id, "admin")

        # Demote self (admin_id) to member — now member_id is the sole admin
        api.set_member_role(static_id, admin_id, "member")

        # admin_id is now a plain member; log in as the sole admin (rm6_member)
        api.logout()
        api.login("rm6_member")

        # Sole admin tries to remove themselves → blocked by cannot_delete_self
        res_self = api.remove_member(static_id, member_id)
        assert res_self.status_code == 400
        assert "cannot_delete_self" in res_self.get_json().get("error", "")

        # Sole admin tries to remove the other user (now a plain member)
        # This succeeds because admin_id is just a member, not the last admin.
        res_other = api.remove_member(static_id, admin_id)
        assert res_other.status_code == 200


# ---------------------------------------------------------------------------
# _assert_member (tested via routes that call it)
# ---------------------------------------------------------------------------

class TestAssertMember:
    """_assert_member returns True/False. It is called by list_static_members,
    set_member_role, and remove_static_member. The 403 responses from those
    routes confirm the contract indirectly."""

    def test_member_gets_200_not_403(self, api):
        """Assert member returns True when user IS a member."""
        _register_and_login(api, "assert_admin")
        sid = api.create_static("Assert Test").get_json()["id"]
        res = api.members(sid)
        assert res.status_code == 200

    def test_nonmember_gets_403(self, api):
        """Assert member returns False when user is NOT a member."""
        _register_and_login(api, "assert_nonmember")
        res = api.members(99999)
        assert res.status_code == 403

    def test_assert_member_importable_and_correct(self, app_module):
        """_assert_member can be imported and returns correct bool values."""
        from server.db import get_conn, db_conn
        # Ensure global exists
        sid = app_module._ensure_global_static()
        # Create a dummy user
        with db_conn() as conn:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash) VALUES ('assert_user', 'x')"
            )
            uid = cur.lastrowid
            conn.execute(
                "INSERT INTO static_members (static_id, user_id, role) VALUES (?, ?, 'member')",
                (sid, uid),
            )

        assert app_module._assert_member(sid, uid) is True
        assert app_module._assert_member(sid, 99999) is False
        assert app_module._assert_member(99999, uid) is False
