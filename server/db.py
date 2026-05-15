"""Conexão e schema do SQLite para o FFXIV Raid Planner."""
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


def init_db():
    with db_conn() as conn:
        conn.executescript(SCHEMA)
        _migrate(conn)
