"""Comprehensive unit tests for server/db.py.

Covers: get_conn, db_conn, _column_exists, _migrate, _migrate_characters_from_slots,
init_db (schema + idempotency), constants, and DATABASE_PATH override.

Every test is fully isolated — each gets its own SQLite file via tmp_path.
"""
from __future__ import annotations

import importlib
import json
import sqlite3
import sys
from contextlib import contextmanager
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# ---------------------------------------------------------------------------
# Local fixture: isolated server.db module backed by a fresh temp SQLite DB.
# ---------------------------------------------------------------------------

def _reload_db(monkeypatch, tmp_path, db_name: str = "test.db"):
    """Set DATABASE_PATH to a temp file, purge cached modules, re-import db."""
    db_path = tmp_path / db_name
    monkeypatch.setenv("DATABASE_PATH", str(db_path))
    for mod_name in ("server.app", "server.telegram", "server.auth", "server.db"):
        sys.modules.pop(mod_name, None)
    db = importlib.import_module("server.db")
    return db, db_path


@pytest.fixture
def db(monkeypatch, tmp_path):
    """Return freshly-reloaded server.db pointing at an isolated SQLite file."""
    module, _ = _reload_db(monkeypatch, tmp_path)
    return module


@pytest.fixture
def db_with_path(monkeypatch, tmp_path):
    """Return (module, Path) so tests can also inspect the file."""
    return _reload_db(monkeypatch, tmp_path)


# ---------------------------------------------------------------------------
# Helper: create a minimal "legacy" schema (no role / telegram_chat_id / character_json)
# ---------------------------------------------------------------------------

_LEGACY_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    active_static_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS statics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    owner_user_id INTEGER,
    data_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS static_members (
    static_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (static_id, user_id)
);

CREATE TABLE IF NOT EXISTS pending_registrations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    requested_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def _make_legacy_conn(db_path: Path) -> sqlite3.Connection:
    """Open (or create) a DB at *db_path* with the legacy schema."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(_LEGACY_SCHEMA)
    conn.commit()
    return conn


# ===========================================================================
# Constants
# ===========================================================================


class TestConstants:
    def test_role_values(self, db):
        assert db.ROLE_ADMIN == "admin"
        assert db.ROLE_OFFICER == "officer"
        assert db.ROLE_MEMBER == "member"

    def test_valid_roles_tuple(self, db):
        assert set(db.VALID_ROLES) == {"admin", "officer", "member"}

    def test_schema_is_string(self, db):
        assert isinstance(db.SCHEMA, str)
        assert "CREATE TABLE" in db.SCHEMA


# ===========================================================================
# get_conn
# ===========================================================================


class TestGetConn:
    def test_returns_connection(self, db):
        db.init_db()
        conn = db.get_conn()
        try:
            assert isinstance(conn, sqlite3.Connection)
        finally:
            conn.close()

    def test_row_factory_is_row(self, db):
        """Fetched rows must be accessible by column name."""
        db.init_db()
        conn = db.get_conn()
        try:
            conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                ("alice", "hash"),
            )
            conn.commit()
            row = conn.execute("SELECT id, username FROM users WHERE username='alice'").fetchone()
            # Access by name — must not raise
            assert row["username"] == "alice"
            assert isinstance(row["id"], int)
        finally:
            conn.close()

    def test_foreign_keys_enforced(self, db):
        """INSERT with a bad FK reference must raise IntegrityError."""
        db.init_db()
        conn = db.get_conn()
        try:
            with pytest.raises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO static_members (static_id, user_id, role) VALUES (?, ?, ?)",
                    (9999, 9999, "member"),
                )
                conn.commit()
        finally:
            conn.close()


# ===========================================================================
# db_conn (context manager)
# ===========================================================================


class TestDbConn:
    def test_commits_on_success(self, db):
        """Rows inserted inside db_conn should be visible via a new connection."""
        db.init_db()
        with db.db_conn() as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                ("bob", "hash"),
            )
        # Verify via an independent connection
        raw = sqlite3.connect(db.DB_PATH)
        row = raw.execute("SELECT username FROM users WHERE username='bob'").fetchone()
        raw.close()
        assert row is not None
        assert row[0] == "bob"

    def test_rolls_back_on_exception(self, db):
        """Rows inserted inside db_conn must NOT be committed when an exception occurs."""
        db.init_db()

        with pytest.raises(RuntimeError):
            with db.db_conn() as conn:
                conn.execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    ("charlie", "hash"),
                )
                raise RuntimeError("intentional rollback trigger")

        raw = sqlite3.connect(db.DB_PATH)
        row = raw.execute("SELECT username FROM users WHERE username='charlie'").fetchone()
        raw.close()
        assert row is None

    def test_connection_closed_after_context(self, db):
        """After exiting the context manager, the connection must be closed."""
        db.init_db()
        with db.db_conn() as conn:
            pass  # no-op
        # Attempting to use a closed connection raises ProgrammingError
        with pytest.raises(Exception):
            conn.execute("SELECT 1")

    def test_context_manager_re_raises_exception(self, db):
        """The original exception must propagate out of db_conn."""
        db.init_db()
        sentinel = ValueError("sentinel error")
        with pytest.raises(ValueError, match="sentinel error"):
            with db.db_conn() as conn:
                raise sentinel


# ===========================================================================
# Schema / init_db
# ===========================================================================


class TestSchema:
    def _get_table_names(self, db) -> set[str]:
        with db.db_conn() as conn:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        return {r["name"] for r in rows}

    def _get_columns(self, db, table: str) -> set[str]:
        with db.db_conn() as conn:
            rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
        return {r["name"] for r in rows}

    # -- table existence --

    def test_all_tables_created(self, db):
        db.init_db()
        tables = self._get_table_names(db)
        assert {"users", "statics", "static_members", "pending_registrations"} <= tables

    # -- column sets --

    def test_users_columns(self, db):
        db.init_db()
        cols = self._get_columns(db, "users")
        assert {"id", "username", "password_hash", "active_static_id",
                "created_at", "character_json"} <= cols

    def test_statics_columns(self, db):
        db.init_db()
        cols = self._get_columns(db, "statics")
        assert {"id", "name", "invite_code", "owner_user_id", "data_json",
                "telegram_chat_id", "created_at", "updated_at"} <= cols

    def test_static_members_columns(self, db):
        db.init_db()
        cols = self._get_columns(db, "static_members")
        assert {"static_id", "user_id", "role", "joined_at"} <= cols

    # -- constraints --

    def test_static_members_role_check_constraint(self, db):
        """Inserting an invalid role must raise IntegrityError (CHECK constraint)."""
        db.init_db()
        with pytest.raises(sqlite3.IntegrityError):
            with db.db_conn() as conn:
                # First create a user + static so FKs don't fire before CHECK
                conn.execute(
                    "INSERT INTO users (id, username, password_hash) VALUES (1, 'u1', 'h')"
                )
                conn.execute(
                    "INSERT INTO statics (id, name, invite_code) VALUES (1, 'S', 'CODE1')"
                )
                conn.execute(
                    "INSERT INTO static_members (static_id, user_id, role) VALUES (1, 1, 'peasant')"
                )

    def test_users_username_unique(self, db):
        """Inserting a duplicate username must raise IntegrityError."""
        db.init_db()
        with pytest.raises(sqlite3.IntegrityError):
            with db.db_conn() as conn:
                conn.execute("INSERT INTO users (username, password_hash) VALUES ('dup', 'h')")
                conn.execute("INSERT INTO users (username, password_hash) VALUES ('dup', 'h')")

    def test_statics_invite_code_unique(self, db):
        db.init_db()
        with pytest.raises(sqlite3.IntegrityError):
            with db.db_conn() as conn:
                conn.execute(
                    "INSERT INTO statics (name, invite_code) VALUES ('A', 'SAME')"
                )
                conn.execute(
                    "INSERT INTO statics (name, invite_code) VALUES ('B', 'SAME')"
                )

    def test_pending_registrations_username_unique(self, db):
        db.init_db()
        with pytest.raises(sqlite3.IntegrityError):
            with db.db_conn() as conn:
                conn.execute(
                    "INSERT INTO pending_registrations (username, password_hash) VALUES ('dup', 'h')"
                )
                conn.execute(
                    "INSERT INTO pending_registrations (username, password_hash) VALUES ('dup', 'h')"
                )


# ===========================================================================
# Migrations — idempotency
# ===========================================================================


class TestMigrationsIdempotent:
    def test_init_db_twice_does_not_raise(self, db):
        """Running init_db() twice on the same DB must not raise any error."""
        db.init_db()
        db.init_db()  # second call — must be idempotent

    def test_migrate_twice_does_not_raise(self, db):
        """Calling _migrate directly twice must be safe."""
        db.init_db()
        with db.db_conn() as conn:
            db._migrate(conn)


# ===========================================================================
# Migrations — new columns added to legacy schema
# ===========================================================================


class TestMigrateAddsColumns:
    def test_role_column_added(self, db, tmp_path):
        """Legacy DB without `role` column gets it after _migrate."""
        legacy_path = tmp_path / "legacy.db"
        conn = _make_legacy_conn(legacy_path)
        assert not db._column_exists(conn, "static_members", "role")
        db._migrate(conn)
        conn.commit()
        assert db._column_exists(conn, "static_members", "role")
        conn.close()

    def test_telegram_chat_id_column_added(self, db, tmp_path):
        """Legacy DB without `telegram_chat_id` column gets it after _migrate."""
        legacy_path = tmp_path / "legacy.db"
        conn = _make_legacy_conn(legacy_path)
        assert not db._column_exists(conn, "statics", "telegram_chat_id")
        db._migrate(conn)
        conn.commit()
        assert db._column_exists(conn, "statics", "telegram_chat_id")
        conn.close()

    def test_character_json_column_added(self, db, tmp_path):
        """Legacy DB without `character_json` column gets it after _migrate."""
        legacy_path = tmp_path / "legacy.db"
        conn = _make_legacy_conn(legacy_path)
        assert not db._column_exists(conn, "users", "character_json")
        db._migrate(conn)
        conn.commit()
        assert db._column_exists(conn, "users", "character_json")
        conn.close()

    def test_all_columns_added_in_one_pass(self, db, tmp_path):
        """All three missing columns are added in a single _migrate call."""
        legacy_path = tmp_path / "legacy.db"
        conn = _make_legacy_conn(legacy_path)
        db._migrate(conn)
        conn.commit()
        assert db._column_exists(conn, "static_members", "role")
        assert db._column_exists(conn, "statics", "telegram_chat_id")
        assert db._column_exists(conn, "users", "character_json")
        conn.close()


# ===========================================================================
# _column_exists
# ===========================================================================


class TestColumnExists:
    def test_known_column_returns_true(self, db):
        db.init_db()
        with db.db_conn() as conn:
            assert db._column_exists(conn, "users", "username") is True

    def test_unknown_column_returns_false(self, db):
        db.init_db()
        with db.db_conn() as conn:
            assert db._column_exists(conn, "users", "does_not_exist") is False

    def test_column_in_other_table(self, db):
        db.init_db()
        with db.db_conn() as conn:
            # "role" belongs to static_members, not users
            assert db._column_exists(conn, "users", "role") is False
            assert db._column_exists(conn, "static_members", "role") is True

    def test_nonexistent_table_returns_false(self, db):
        db.init_db()
        with db.db_conn() as conn:
            assert db._column_exists(conn, "ghost_table", "id") is False


# ===========================================================================
# _migrate — admin promotion
# ===========================================================================


class TestMigrateAdminPromotion:
    def _setup_static_with_members(self, conn, role1="member", role2="member",
                                    joined1="2024-01-01 10:00:00",
                                    joined2="2024-01-01 11:00:00"):
        """Helper: insert 1 static + 2 users with configurable roles/joined_at."""
        conn.execute("INSERT INTO users (id, username, password_hash) VALUES (1, 'u1', 'h')")
        conn.execute("INSERT INTO users (id, username, password_hash) VALUES (2, 'u2', 'h')")
        conn.execute("INSERT INTO statics (id, name, invite_code) VALUES (1, 'S', 'CODE')")
        conn.execute(
            "INSERT INTO static_members (static_id, user_id, role, joined_at) VALUES (1, 1, ?, ?)",
            (role1, joined1),
        )
        conn.execute(
            "INSERT INTO static_members (static_id, user_id, role, joined_at) VALUES (1, 2, ?, ?)",
            (role2, joined2),
        )
        conn.commit()

    def test_oldest_member_promoted_to_admin(self, db):
        """With no admin, the earliest joined_at member gets admin."""
        db.init_db()
        with db.db_conn() as conn:
            self._setup_static_with_members(conn)
            # Confirm no admin yet
            row = conn.execute(
                "SELECT role FROM static_members WHERE static_id=1 AND user_id=1"
            ).fetchone()
            assert row["role"] == "member"

            db._migrate(conn)

            row1 = conn.execute(
                "SELECT role FROM static_members WHERE static_id=1 AND user_id=1"
            ).fetchone()
            row2 = conn.execute(
                "SELECT role FROM static_members WHERE static_id=1 AND user_id=2"
            ).fetchone()
            # user 1 has earlier joined_at → admin
            assert row1["role"] == "admin"
            assert row2["role"] == "member"

    def test_existing_admin_not_changed(self, db):
        """If there's already an admin, _migrate leaves everything alone."""
        db.init_db()
        with db.db_conn() as conn:
            # user_id=2 is already admin (later joined_at)
            self._setup_static_with_members(conn, role2="admin")
            db._migrate(conn)
            row1 = conn.execute(
                "SELECT role FROM static_members WHERE static_id=1 AND user_id=1"
            ).fetchone()
            row2 = conn.execute(
                "SELECT role FROM static_members WHERE static_id=1 AND user_id=2"
            ).fetchone()
            # user 1 must remain member; user 2 stays admin
            assert row1["role"] == "member"
            assert row2["role"] == "admin"

    def test_tiebreak_lower_user_id_wins(self, db):
        """Tie on joined_at: lower user_id becomes admin."""
        db.init_db()
        same_time = "2024-06-01 12:00:00"
        with db.db_conn() as conn:
            self._setup_static_with_members(conn,
                                             joined1=same_time,
                                             joined2=same_time)
            db._migrate(conn)
            row1 = conn.execute(
                "SELECT role FROM static_members WHERE static_id=1 AND user_id=1"
            ).fetchone()
            row2 = conn.execute(
                "SELECT role FROM static_members WHERE static_id=1 AND user_id=2"
            ).fetchone()
            # user_id=1 < user_id=2 → user 1 becomes admin
            assert row1["role"] == "admin"
            assert row2["role"] == "member"

    def test_multiple_statics_each_gets_admin(self, db):
        """Every static without an admin receives exactly one promotion."""
        db.init_db()
        with db.db_conn() as conn:
            conn.execute("INSERT INTO users (id, username, password_hash) VALUES (1, 'u1', 'h')")
            conn.execute("INSERT INTO users (id, username, password_hash) VALUES (2, 'u2', 'h')")
            conn.execute("INSERT INTO statics (id, name, invite_code) VALUES (1, 'S1', 'C1')")
            conn.execute("INSERT INTO statics (id, name, invite_code) VALUES (2, 'S2', 'C2')")
            conn.execute(
                "INSERT INTO static_members (static_id, user_id, role) VALUES (1, 1, 'member')"
            )
            conn.execute(
                "INSERT INTO static_members (static_id, user_id, role) VALUES (2, 2, 'member')"
            )
            conn.commit()
            db._migrate(conn)
            r1 = conn.execute(
                "SELECT role FROM static_members WHERE static_id=1 AND user_id=1"
            ).fetchone()
            r2 = conn.execute(
                "SELECT role FROM static_members WHERE static_id=2 AND user_id=2"
            ).fetchone()
            assert r1["role"] == "admin"
            assert r2["role"] == "admin"

    def test_migrate_idempotent_second_call_does_not_double_promote(self, db):
        """Calling _migrate twice on the same data must not break the admin assignment."""
        db.init_db()
        with db.db_conn() as conn:
            self._setup_static_with_members(conn)
            db._migrate(conn)
            # Run again — must not raise or corrupt
            db._migrate(conn)
            admins = conn.execute(
                "SELECT user_id FROM static_members WHERE static_id=1 AND role='admin'"
            ).fetchall()
            assert len(admins) == 1


# ===========================================================================
# _migrate_characters_from_slots
# ===========================================================================


class TestMigrateCharactersFromSlots:
    def _init_with_slot(self, db, conn, *, user_id: int, slot: dict):
        """Insert a user + a static whose data_json contains *slot* (with user_id set)."""
        slot = dict(slot, user_id=user_id)
        data_json = json.dumps({"roster": [slot]})
        conn.execute(
            "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
            (user_id, f"user{user_id}", "hash"),
        )
        conn.execute(
            "INSERT INTO statics (id, name, invite_code, data_json) VALUES (1, 'S', 'CODE', ?)",
            (data_json,),
        )
        conn.commit()

    # -- happy path --

    def test_user_with_slot_gets_character_populated(self, db):
        db.init_db()
        slot = {
            "name": "Warrior of Light",
            "ilvl": 640,
            "jobsPool": ["WAR", "PLD"],
            "statusByProg": {"ucob": "active", "uwu": "inactive"},
        }
        with db.db_conn() as conn:
            self._init_with_slot(db, conn, user_id=1, slot=slot)
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()

        char = json.loads(row["character_json"])
        assert char["name"] == "Warrior of Light"
        assert char["ilvl"] == 640
        assert char["currentExpansionId"] is None
        assert {"id": "WAR"} in char["jobs"]
        assert {"id": "PLD"} in char["jobs"]
        assert "ucob" in char["subscribedProgs"]
        assert "uwu" not in char["subscribedProgs"]

    def test_user_without_slot_gets_empty_default(self, db):
        db.init_db()
        with db.db_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash) VALUES (1, 'lonely', 'h')"
            )
            conn.commit()
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()

        char = json.loads(row["character_json"])
        assert char == {
            "name": "",
            "ilvl": None,
            "currentExpansionId": None,
            "jobs": [],
            "subscribedProgs": [],
        }

    def test_user_with_existing_character_json_not_touched(self, db):
        db.init_db()
        original = json.dumps({"name": "Kept", "ilvl": 100,
                               "currentExpansionId": "ew",
                               "jobs": [], "subscribedProgs": []})
        with db.db_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash, character_json) VALUES (1, 'u', 'h', ?)",
                (original,),
            )
            # Put a slot in a static too — should NOT overwrite
            conn.execute(
                "INSERT INTO statics (id, name, invite_code, data_json) VALUES (1, 'S', 'C', ?)",
                (json.dumps({"roster": [{"user_id": 1, "name": "New Name", "ilvl": 999,
                                         "jobsPool": [], "statusByProg": {}}]}),),
            )
            conn.commit()
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()

        assert row["character_json"] == original

    def test_empty_braces_json_not_touched(self, db):
        """character_json = '{}' counts as non-NULL — must not be overwritten."""
        db.init_db()
        with db.db_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash, character_json) VALUES (1, 'u', 'h', '{}')",
            )
            conn.commit()
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()

        assert row["character_json"] == "{}"

    # -- ilvl edge cases --

    def test_ilvl_string_becomes_none(self, db):
        db.init_db()
        slot = {"name": "Test", "ilvl": "six-forty",
                "jobsPool": [], "statusByProg": {}}
        with db.db_conn() as conn:
            self._init_with_slot(db, conn, user_id=1, slot=slot)
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()
        char = json.loads(row["character_json"])
        assert char["ilvl"] is None

    def test_ilvl_none_becomes_none(self, db):
        db.init_db()
        slot = {"name": "Test", "ilvl": None,
                "jobsPool": [], "statusByProg": {}}
        with db.db_conn() as conn:
            self._init_with_slot(db, conn, user_id=1, slot=slot)
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()
        char = json.loads(row["character_json"])
        assert char["ilvl"] is None

    def test_ilvl_negative_becomes_none(self, db):
        db.init_db()
        slot = {"name": "Test", "ilvl": -1,
                "jobsPool": [], "statusByProg": {}}
        with db.db_conn() as conn:
            self._init_with_slot(db, conn, user_id=1, slot=slot)
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()
        char = json.loads(row["character_json"])
        assert char["ilvl"] is None

    def test_ilvl_zero_is_valid(self, db):
        """ilvl = 0 is non-negative → should be kept."""
        db.init_db()
        slot = {"name": "Test", "ilvl": 0,
                "jobsPool": [], "statusByProg": {}}
        with db.db_conn() as conn:
            self._init_with_slot(db, conn, user_id=1, slot=slot)
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()
        char = json.loads(row["character_json"])
        assert char["ilvl"] == 0

    # -- jobsPool edge cases --

    def test_non_string_jobs_filtered_out(self, db):
        db.init_db()
        slot = {"name": "Test", "ilvl": 100,
                "jobsPool": ["WAR", 42, None, True, "DRK"],
                "statusByProg": {}}
        with db.db_conn() as conn:
            self._init_with_slot(db, conn, user_id=1, slot=slot)
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()
        char = json.loads(row["character_json"])
        job_ids = [j["id"] for j in char["jobs"]]
        assert job_ids == ["WAR", "DRK"]

    def test_empty_jobs_pool(self, db):
        db.init_db()
        slot = {"name": "Test", "ilvl": 100, "jobsPool": [], "statusByProg": {}}
        with db.db_conn() as conn:
            self._init_with_slot(db, conn, user_id=1, slot=slot)
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()
        char = json.loads(row["character_json"])
        assert char["jobs"] == []

    # -- statusByProg edge cases --

    def test_only_active_progs_subscribed(self, db):
        db.init_db()
        slot = {
            "name": "T",
            "ilvl": 100,
            "jobsPool": [],
            "statusByProg": {
                "prog1": "active",
                "prog2": "cleared",
                "prog3": "inactive",
                "prog4": "active",
            },
        }
        with db.db_conn() as conn:
            self._init_with_slot(db, conn, user_id=1, slot=slot)
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()
        char = json.loads(row["character_json"])
        assert set(char["subscribedProgs"]) == {"prog1", "prog4"}

    def test_empty_status_by_prog(self, db):
        db.init_db()
        slot = {"name": "T", "ilvl": 100, "jobsPool": [], "statusByProg": {}}
        with db.db_conn() as conn:
            self._init_with_slot(db, conn, user_id=1, slot=slot)
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()
        char = json.loads(row["character_json"])
        assert char["subscribedProgs"] == []

    # -- no-op when no pending users --

    def test_no_pending_users_no_error(self, db):
        """Running _migrate_characters_from_slots when all users already have
        character_json should be a silent no-op."""
        db.init_db()
        with db.db_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash, character_json) "
                "VALUES (1, 'u1', 'h', '{}')"
            )
            conn.commit()
            # Should not raise
            db._migrate_characters_from_slots(conn)

    # -- multiple users in one pass --

    def test_multiple_users_processed_independently(self, db):
        db.init_db()
        with db.db_conn() as conn:
            conn.execute(
                "INSERT INTO users (id, username, password_hash) VALUES (1, 'u1', 'h')"
            )
            conn.execute(
                "INSERT INTO users (id, username, password_hash) VALUES (2, 'u2', 'h')"
            )
            # user 1 has a slot; user 2 does not
            data_json = json.dumps({
                "roster": [
                    {"user_id": 1, "name": "Alice", "ilvl": 500,
                     "jobsPool": ["WAR"], "statusByProg": {}}
                ]
            })
            conn.execute(
                "INSERT INTO statics (id, name, invite_code, data_json) VALUES (1, 'S', 'C', ?)",
                (data_json,),
            )
            conn.commit()
            db._migrate_characters_from_slots(conn)
            r1 = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()
            r2 = conn.execute("SELECT character_json FROM users WHERE id=2").fetchone()

        c1 = json.loads(r1["character_json"])
        c2 = json.loads(r2["character_json"])
        assert c1["name"] == "Alice"
        assert c2["name"] == ""
        assert c2["ilvl"] is None

    def test_name_truncated_to_80_chars(self, db):
        db.init_db()
        long_name = "A" * 100
        slot = {"name": long_name, "ilvl": 100, "jobsPool": [], "statusByProg": {}}
        with db.db_conn() as conn:
            self._init_with_slot(db, conn, user_id=1, slot=slot)
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()
        char = json.loads(row["character_json"])
        assert len(char["name"]) == 80

    def test_current_expansion_id_always_null(self, db):
        """currentExpansionId must always be None regardless of slot data."""
        db.init_db()
        slot = {"name": "T", "ilvl": 100, "jobsPool": [],
                "statusByProg": {}, "currentExpansionId": "dawntrail"}
        with db.db_conn() as conn:
            self._init_with_slot(db, conn, user_id=1, slot=slot)
            db._migrate_characters_from_slots(conn)
            row = conn.execute("SELECT character_json FROM users WHERE id=1").fetchone()
        char = json.loads(row["character_json"])
        assert char["currentExpansionId"] is None


# ===========================================================================
# DATABASE_PATH environment-variable override
# ===========================================================================


class TestDatabasePathEnvVar:
    def test_db_created_at_env_path(self, monkeypatch, tmp_path):
        """When DATABASE_PATH is set to a custom path, init_db creates the file there."""
        custom_path = tmp_path / "custom_dir" / "mydb.db"
        custom_path.parent.mkdir(parents=True, exist_ok=True)
        monkeypatch.setenv("DATABASE_PATH", str(custom_path))

        for mod_name in ("server.app", "server.telegram", "server.auth", "server.db"):
            sys.modules.pop(mod_name, None)
        db = importlib.import_module("server.db")

        db.init_db()
        assert custom_path.exists(), "DB file was not created at the overridden path"

    def test_db_path_attribute_reflects_env(self, monkeypatch, tmp_path):
        """DB_PATH constant on the reloaded module matches the env var value."""
        target = str(tmp_path / "env_test.db")
        monkeypatch.setenv("DATABASE_PATH", target)

        for mod_name in ("server.app", "server.telegram", "server.auth", "server.db"):
            sys.modules.pop(mod_name, None)
        db = importlib.import_module("server.db")

        assert db.DB_PATH == target

    def test_two_reloads_use_different_paths(self, monkeypatch, tmp_path):
        """Two fresh loads with different DATABASE_PATH values stay isolated."""
        path_a = tmp_path / "a.db"
        path_b = tmp_path / "b.db"

        monkeypatch.setenv("DATABASE_PATH", str(path_a))
        for mod_name in ("server.app", "server.telegram", "server.auth", "server.db"):
            sys.modules.pop(mod_name, None)
        db_a = importlib.import_module("server.db")
        db_a.init_db()
        with db_a.db_conn() as conn:
            conn.execute("INSERT INTO users (username, password_hash) VALUES ('onlya', 'h')")

        monkeypatch.setenv("DATABASE_PATH", str(path_b))
        for mod_name in ("server.app", "server.telegram", "server.auth", "server.db"):
            sys.modules.pop(mod_name, None)
        db_b = importlib.import_module("server.db")
        db_b.init_db()

        # 'onlya' must NOT appear in db_b
        with db_b.db_conn() as conn:
            row = conn.execute("SELECT 1 FROM users WHERE username='onlya'").fetchone()
        assert row is None
