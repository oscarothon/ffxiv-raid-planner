"""Conexão e schema do SQLite para o FFXIV Raid Planner."""
import json
import os
import sqlite3
from contextlib import contextmanager

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.environ.get("DATABASE_PATH", os.path.join(ROOT_DIR, "data.db"))

# Garante que o diretório do banco existe. Crucial em ambientes como Railway
# onde um volume é montado em /data e o caminho do banco é /data/data.db.
_db_dir = os.path.dirname(DB_PATH)
if _db_dir:
    os.makedirs(_db_dir, exist_ok=True)

# Cargos válidos em ordem hierárquica (maior privilégio primeiro)
ROLE_ADMIN = "admin"
ROLE_OFFICER = "officer"
ROLE_MEMBER = "member"
VALID_ROLES = (ROLE_ADMIN, ROLE_OFFICER, ROLE_MEMBER)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    active_static_id INTEGER REFERENCES statics(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS statics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    invite_code TEXT UNIQUE NOT NULL,
    owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    data_json TEXT NOT NULL DEFAULT '{}',
    telegram_chat_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS static_members (
    static_id INTEGER NOT NULL REFERENCES statics(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','officer','member')),
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (static_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_static_members_user ON static_members(user_id);

CREATE TABLE IF NOT EXISTS pending_registrations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    requested_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_conn():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _column_exists(conn, table, column):
    cur = conn.execute(f"PRAGMA table_info({table})")
    return any(row["name"] == column for row in cur.fetchall())


def _migrate(conn):
    """Aplica migrações idempotentes. Seguro de rodar a cada boot."""
    # Adiciona coluna `role` se ainda não existir (DB pré-cargos)
    if not _column_exists(conn, "static_members", "role"):
        conn.execute(
            "ALTER TABLE static_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member'"
        )

    # Fase 12: chat_id do grupo de Telegram vinculado à static
    if not _column_exists(conn, "statics", "telegram_chat_id"):
        conn.execute("ALTER TABLE statics ADD COLUMN telegram_chat_id TEXT")

    # Fase O: personagem do usuário (1:1 com user). JSON com:
    # {name, ilvl, currentExpansionId, jobs: [{id, level}], subscribedProgs: [progId, ...]}
    if not _column_exists(conn, "users", "character_json"):
        conn.execute("ALTER TABLE users ADD COLUMN character_json TEXT")

    # Fase O: para cada user com character_json NULL, deriva o personagem do
    # primeiro slot encontrado no roster de qualquer static. Idempotente:
    # users que já têm character_json (mesmo que vazio "{}") não são tocados.
    _migrate_characters_from_slots(conn)

    # Para cada static sem admin, promove o membro mais antigo (joined_at) a admin.
    # Garante bootstrap: o "primeiro" usuário de qualquer static (incluindo a global)
    # sobe a admin automaticamente se ninguém ocupar o cargo.
    cur = conn.execute(
        """
        SELECT s.id FROM statics s
        WHERE NOT EXISTS (
            SELECT 1 FROM static_members m
            WHERE m.static_id = s.id AND m.role = 'admin'
        )
        """
    )
    statics_without_admin = [row["id"] for row in cur.fetchall()]

    for static_id in statics_without_admin:
        cur = conn.execute(
            """
            SELECT user_id FROM static_members
            WHERE static_id = ?
            ORDER BY joined_at ASC, user_id ASC
            LIMIT 1
            """,
            (static_id,),
        )
        row = cur.fetchone()
        if row:
            conn.execute(
                "UPDATE static_members SET role = 'admin' WHERE static_id = ? AND user_id = ?",
                (static_id, row["user_id"]),
            )


def _migrate_characters_from_slots(conn):
    """Fase O — backfill de users.character_json a partir do slot do roster.

    Para cada user com character_json NULL, varre as statics em que participa,
    procura o slot vinculado (data_json.roster[*].user_id == user.id) e deriva
    {name, ilvl, jobs, subscribedProgs}. currentExpansionId fica null — o
    usuário define depois na aba Personagem.

    Idempotente: users com character_json não-NULL (mesmo "{}") são pulados.
    """
    cur = conn.execute("SELECT id FROM users WHERE character_json IS NULL")
    pending_user_ids = [row["id"] for row in cur.fetchall()]
    if not pending_user_ids:
        return

    cur = conn.execute("SELECT id, data_json FROM statics")
    statics = [(row["id"], row["data_json"]) for row in cur.fetchall()]

    for user_id in pending_user_ids:
        slot = None
        for _sid, raw in statics:
            try:
                data = json.loads(raw or "{}")
            except (TypeError, ValueError):
                continue
            roster = data.get("roster") or []
            slot = next(
                (p for p in roster
                 if isinstance(p, dict) and p.get("user_id") == user_id),
                None,
            )
            if slot:
                break

        if not slot:
            # User sem slot em nenhuma static — grava character vazio para não
            # ficar varrendo de novo nos próximos boots.
            character = {"name": "", "ilvl": None, "currentExpansionId": None,
                         "jobs": [], "subscribedProgs": []}
        else:
            ilvl_raw = slot.get("ilvl")
            ilvl = ilvl_raw if isinstance(ilvl_raw, int) and ilvl_raw >= 0 else None
            jobs_pool = slot.get("jobsPool") or []
            status_by_prog = slot.get("statusByProg") or {}
            character = {
                "name": (slot.get("name") or "")[:80],
                "ilvl": ilvl,
                "currentExpansionId": None,
                "jobs": [{"id": j} for j in jobs_pool if isinstance(j, str)],
                "subscribedProgs": [
                    pid for pid, st in status_by_prog.items()
                    if isinstance(pid, str) and st == "active"
                ],
            }

        conn.execute(
            "UPDATE users SET character_json = ? WHERE id = ?",
            (json.dumps(character, ensure_ascii=False), user_id),
        )


def init_db():
    with db_conn() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)
