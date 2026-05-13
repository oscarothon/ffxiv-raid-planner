"""FFXIV Raid Planner — backend Flask + SQLite com auth por sessão."""
import os
import json
import secrets
import sqlite3
from flask import Flask, request, jsonify, session, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

from .db import ROOT_DIR, init_db, get_conn, db_conn
from .auth import login_required, current_user

app = Flask(__name__, static_folder=ROOT_DIR, static_url_path="")

# SECRET_KEY: idealmente vem do ambiente em produção. Local: fallback fixo
# para sobreviver a reinícios do dev server.
app.secret_key = os.environ.get("SECRET_KEY") or "dev-only-key-change-me-in-prod"
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("FLASK_ENV") == "production",
    PERMANENT_SESSION_LIFETIME=60 * 60 * 24 * 30,  # 30 dias
)

init_db()


# ---------- Frontend estático ----------
@app.route("/")
def index():
    return send_from_directory(ROOT_DIR, "index.html")


# ---------- Auth ----------
@app.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not (3 <= len(username) <= 32):
        return jsonify({"error": "Usuário deve ter entre 3 e 32 caracteres."}), 400
    if len(password) < 6:
        return jsonify({"error": "Senha deve ter pelo menos 6 caracteres."}), 400

    pwd_hash = generate_password_hash(password)
    try:
        with db_conn() as conn:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, pwd_hash),
            )
            user_id = cur.lastrowid
    except sqlite3.IntegrityError:
        return jsonify({"error": "Nome de usuário já cadastrado."}), 409

    session.permanent = True
    session["user_id"] = user_id
    session["username"] = username
    return jsonify({"id": user_id, "username": username, "active_static_id": None})


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    conn = get_conn()
    try:
        cur = conn.execute("SELECT * FROM users WHERE username = ?", (username,))
        row = cur.fetchone()
        if not row or not check_password_hash(row["password_hash"], password):
            return jsonify({"error": "Usuário ou senha inválidos."}), 401

        session.permanent = True
        session["user_id"] = row["id"]
        session["username"] = row["username"]
        return jsonify({
            "id": row["id"],
            "username": row["username"],
            "active_static_id": row["active_static_id"],
        })
    finally:
        conn.close()


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/me")
def me():
    user = current_user()
    if not user:
        return jsonify({"error": "unauthorized"}), 401
    return jsonify({
        "id": user["id"],
        "username": user["username"],
        "active_static_id": user["active_static_id"],
    })


# ---------- Statics (grupos compartilhados) ----------
@app.post("/api/statics")
@login_required
def create_static():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip() or "Minha Static"
    invite_code = secrets.token_urlsafe(8)

    with db_conn() as conn:
        cur = conn.execute(
            "INSERT INTO statics (name, invite_code, owner_user_id) VALUES (?, ?, ?)",
            (name, invite_code, session["user_id"]),
        )
        static_id = cur.lastrowid
        conn.execute(
            "INSERT INTO static_members (static_id, user_id) VALUES (?, ?)",
            (static_id, session["user_id"]),
        )
        conn.execute(
            "UPDATE users SET active_static_id = ? WHERE id = ?",
            (static_id, session["user_id"]),
        )

    return jsonify({"id": static_id, "name": name, "invite_code": invite_code})


@app.post("/api/statics/join")
@login_required
def join_static():
    data = request.get_json(silent=True) or {}
    code = (data.get("invite_code") or "").strip()
    if not code:
        return jsonify({"error": "Informe o código de convite."}), 400

    with db_conn() as conn:
        cur = conn.execute("SELECT id, name FROM statics WHERE invite_code = ?", (code,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Código de convite inválido."}), 404

        conn.execute(
            "INSERT OR IGNORE INTO static_members (static_id, user_id) VALUES (?, ?)",
            (row["id"], session["user_id"]),
        )
        conn.execute(
            "UPDATE users SET active_static_id = ? WHERE id = ?",
            (row["id"], session["user_id"]),
        )

    return jsonify({"id": row["id"], "name": row["name"]})


@app.get("/api/statics/mine")
@login_required
def my_statics():
    conn = get_conn()
    try:
        cur = conn.execute(
            """
            SELECT s.id, s.name, s.invite_code
            FROM statics s
            JOIN static_members m ON m.static_id = s.id
            WHERE m.user_id = ?
            ORDER BY s.id
            """,
            (session["user_id"],),
        )
        return jsonify([dict(r) for r in cur.fetchall()])
    finally:
        conn.close()


@app.post("/api/statics/switch")
@login_required
def switch_static():
    data = request.get_json(silent=True) or {}
    static_id = data.get("static_id")

    with db_conn() as conn:
        cur = conn.execute(
            "SELECT 1 FROM static_members WHERE static_id = ? AND user_id = ?",
            (static_id, session["user_id"]),
        )
        if not cur.fetchone():
            return jsonify({"error": "Você não é membro desta static."}), 403
        conn.execute(
            "UPDATE users SET active_static_id = ? WHERE id = ?",
            (static_id, session["user_id"]),
        )
    return jsonify({"ok": True, "active_static_id": static_id})


def _get_active_static_id():
    user = current_user()
    if not user:
        return None
    return user["active_static_id"]


def _assert_member(static_id, user_id):
    conn = get_conn()
    try:
        cur = conn.execute(
            "SELECT 1 FROM static_members WHERE static_id = ? AND user_id = ?",
            (static_id, user_id),
        )
        return cur.fetchone() is not None
    finally:
        conn.close()


# ---------- Estado (blob JSON compartilhado da static) ----------
@app.get("/api/state")
@login_required
def get_state():
    static_id = _get_active_static_id()
    if not static_id:
        return jsonify({"error": "no_active_static"}), 404
    if not _assert_member(static_id, session["user_id"]):
        return jsonify({"error": "not_a_member"}), 403

    conn = get_conn()
    try:
        cur = conn.execute(
            "SELECT data_json, name, invite_code, updated_at FROM statics WHERE id = ?",
            (static_id,),
        )
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "static_not_found"}), 404

        try:
            data = json.loads(row["data_json"] or "{}")
        except (TypeError, ValueError):
            data = {}

        return jsonify({
            "static_id": static_id,
            "static_name": row["name"],
            "invite_code": row["invite_code"],
            "updated_at": row["updated_at"],
            "data": data,
        })
    finally:
        conn.close()


@app.put("/api/state")
@login_required
def put_state():
    static_id = _get_active_static_id()
    if not static_id:
        return jsonify({"error": "no_active_static"}), 400
    if not _assert_member(static_id, session["user_id"]):
        return jsonify({"error": "not_a_member"}), 403

    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "invalid_json"}), 400

    with db_conn() as conn:
        conn.execute(
            "UPDATE statics SET data_json = ?, updated_at = datetime('now') WHERE id = ?",
            (json.dumps(payload, ensure_ascii=False), static_id),
        )
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
