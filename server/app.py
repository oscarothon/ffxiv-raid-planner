"""FFXIV Raid Planner — backend Flask + SQLite com auth por sessão."""
import os
import json
import secrets
import sqlite3
import hashlib
from flask import Flask, request, jsonify, session, send_from_directory, make_response
from werkzeug.security import generate_password_hash, check_password_hash

from .db import ROOT_DIR, init_db, get_conn, db_conn, VALID_ROLES, ROLE_ADMIN, ROLE_OFFICER, ROLE_MEMBER
from .auth import login_required, current_user, get_user_role, role_at_least, require_role

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


# ---------- Static global compartilhada (uma única para todos) ----------
GLOBAL_STATIC_NAME = "Little Ala Mhigos"
GLOBAL_INVITE_CODE = "global"


def _ensure_global_static():
    """Garante que existe a static global e retorna seu id."""
    with db_conn() as conn:
        cur = conn.execute("SELECT id FROM statics WHERE invite_code = ?", (GLOBAL_INVITE_CODE,))
        row = cur.fetchone()
        if row:
            return row["id"]
        cur = conn.execute(
            "INSERT INTO statics (name, invite_code, owner_user_id) VALUES (?, ?, NULL)",
            (GLOBAL_STATIC_NAME, GLOBAL_INVITE_CODE),
        )
        return cur.lastrowid


def _attach_user_to_global(user_id):
    """Adiciona o user à static global e marca como ativa.
    Se ninguém ainda é admin na global, este usuário é promovido a admin
    (bootstrap automático)."""
    static_id = _ensure_global_static()
    with db_conn() as conn:
        # Verifica se já existe admin nesta static
        cur = conn.execute(
            "SELECT 1 FROM static_members WHERE static_id = ? AND role = 'admin' LIMIT 1",
            (static_id,),
        )
        has_admin = cur.fetchone() is not None
        initial_role = "member" if has_admin else "admin"

        conn.execute(
            "INSERT OR IGNORE INTO static_members (static_id, user_id, role) VALUES (?, ?, ?)",
            (static_id, user_id, initial_role),
        )
        conn.execute(
            "UPDATE users SET active_static_id = ? WHERE id = ?",
            (static_id, user_id),
        )
    return static_id


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

    static_id = _attach_user_to_global(user_id)
    session.permanent = True
    session["user_id"] = user_id
    session["username"] = username
    return jsonify({"id": user_id, "username": username, "active_static_id": static_id})


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

        # Garante que o usuário sempre está na static global compartilhada
        static_id = _attach_user_to_global(row["id"])

        session.permanent = True
        session["user_id"] = row["id"]
        session["username"] = row["username"]
        return jsonify({
            "id": row["id"],
            "username": row["username"],
            "active_static_id": static_id,
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
    static_id = user["active_static_id"] or _attach_user_to_global(user["id"])
    role = get_user_role(static_id, user["id"])
    return jsonify({
        "id": user["id"],
        "username": user["username"],
        "active_static_id": static_id,
        "role": role,
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
        # Criador da static vira admin automaticamente
        conn.execute(
            "INSERT INTO static_members (static_id, user_id, role) VALUES (?, ?, 'admin')",
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

        # Quem entra via código de convite é sempre member por padrão.
        # Admins existentes podem promover depois.
        conn.execute(
            "INSERT OR IGNORE INTO static_members (static_id, user_id, role) VALUES (?, ?, 'member')",
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
def _compute_state_etag(static_id, updated_at, user_id, role):
    """Gera um ETag específico para o requisitante.

    Inclui o role do user porque /api/state retorna user_role no payload —
    se o cargo do user mudar (via /api/statics/.../role), o ETag também muda,
    fazendo o polling detectar a mudança mesmo sem alteração no data_json.
    """
    raw = f"{static_id}:{updated_at}:{user_id}:{role or 'none'}".encode("utf-8")
    return '"' + hashlib.sha1(raw).hexdigest()[:16] + '"'


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

        role = get_user_role(static_id, session["user_id"])
        etag = _compute_state_etag(static_id, row["updated_at"], session["user_id"], role)

        # Suporte a If-None-Match: retorna 304 quando o cliente já tem a versão atual.
        # ETag inclui role para garantir invalidação ao mudar cargo do usuário.
        client_etag = request.headers.get("If-None-Match")
        if client_etag and client_etag == etag:
            resp = make_response("", 304)
            resp.headers["ETag"] = etag
            resp.headers["Cache-Control"] = "no-cache, must-revalidate"
            return resp

        try:
            data = json.loads(row["data_json"] or "{}")
        except (TypeError, ValueError):
            data = {}

        resp = jsonify({
            "static_id": static_id,
            "static_name": row["name"],
            "invite_code": row["invite_code"],
            "updated_at": row["updated_at"],
            "etag": etag,
            "data": data,
            "user_id": session["user_id"],
            "user_role": role,
        })
        resp.headers["ETag"] = etag
        # Sempre revalidar — o conteúdo é específico do usuário e pode mudar a qualquer momento
        resp.headers["Cache-Control"] = "no-cache, must-revalidate"
        return resp
    finally:
        conn.close()


def _index_roster(roster):
    """Mapeia roster por id para diff rápido."""
    return {p.get("id"): p for p in (roster or []) if p.get("id")}


def _validate_state_diff(old, new, role, user_id):
    """Compara estado antigo e novo e retorna lista de violações de permissão.

    Regras:
    - staticName: admin only
    - activeProgs, scheduledProgs, lootPriorities: officer+
    - roster: officer+ pode tudo; member só pode mexer no slot vinculado ao seu user_id
      e não pode alterar campos de gestão (statusByProg) nem mudar user_id de slots.
    - Campos de view (theme, sfx, currentMonth, contentType, selectedEncounter,
      inspectedProgId): qualquer um.
    """
    violations = []
    is_officer = role_at_least(role, ROLE_OFFICER)
    is_admin = role_at_least(role, ROLE_ADMIN)

    old = old or {}
    new = new or {}

    # Campo admin-only
    if old.get("staticName") != new.get("staticName") and not is_admin:
        violations.append("staticName(admin_only)")

    # Campos officer+ (add/remove direto)
    for fld in ("activeProgs", "scheduledProgs"):
        if old.get(fld) != new.get(fld) and not is_officer:
            violations.append(f"{fld}(officer_only)")

    # Diff do roster
    old_by_id = _index_roster(old.get("roster"))
    new_by_id = _index_roster(new.get("roster"))

    added_ids = set(new_by_id) - set(old_by_id)
    removed_ids = set(old_by_id) - set(new_by_id)
    common_ids = set(old_by_id) & set(new_by_id)

    # Remoções: officer+ pode remover qualquer; member só pode remover o próprio slot
    if removed_ids and not is_officer:
        for mid in removed_ids:
            if old_by_id[mid].get("user_id") != user_id:
                violations.append(f"remove_other_player({mid})")

    # lootPriorities: officer+ pode mexer livre; member pode acompanhar add/remove
    # automaticamente (sincronizado com o roster ativo), mas não reordenar.
    old_lp = old.get("lootPriorities") or {}
    new_lp = new.get("lootPriorities") or {}
    if old_lp != new_lp and not is_officer:
        all_progs = set(old_lp.keys()) | set(new_lp.keys())
        for prog in all_progs:
            old_list = old_lp.get(prog, []) or []
            new_list = new_lp.get(prog, []) or []
            if old_list == new_list:
                continue
            # Compara apenas a ordem dos IDs presentes em ambos
            old_common = [x for x in old_list if x in new_list]
            new_common = [x for x in new_list if x in old_list]
            if old_common != new_common:
                violations.append(f"lootPriorities[{prog}](reorder_officer_only)")

    # Adições
    for mid in added_ids:
        if is_officer:
            continue
        new_p = new_by_id[mid]
        # Member: só pode adicionar slot próprio
        if new_p.get("user_id") != user_id:
            violations.append(f"add_player_not_own({mid})")
            continue
        # Member: só pode ter um slot próprio
        already = any(p.get("user_id") == user_id for p in old_by_id.values())
        if already:
            violations.append(f"add_player_already_has_own({mid})")

    # Modificações
    MANAGEMENT_FIELDS = {"statusByProg", "user_id"}
    for mid in common_ids:
        op = old_by_id[mid]
        np = new_by_id[mid]
        if op == np:
            continue
        if is_officer:
            continue
        # Member: só pode mexer no próprio slot
        if op.get("user_id") != user_id:
            violations.append(f"modify_other_player({mid})")
            continue
        # No próprio slot: campos de gestão são bloqueados
        for f in MANAGEMENT_FIELDS:
            if op.get(f) != np.get(f):
                violations.append(f"modify_management_field({mid}.{f})")

    return violations


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

    role = get_user_role(static_id, session["user_id"])
    if not role:
        return jsonify({"error": "no_role"}), 403

    # Carrega estado atual para validar diff
    conn = get_conn()
    try:
        cur = conn.execute("SELECT data_json FROM statics WHERE id = ?", (static_id,))
        row = cur.fetchone()
        try:
            old_data = json.loads(row["data_json"] or "{}") if row else {}
        except (TypeError, ValueError):
            old_data = {}
    finally:
        conn.close()

    violations = _validate_state_diff(old_data, payload, role, session["user_id"])
    if violations:
        return jsonify({
            "error": "forbidden_changes",
            "your_role": role,
            "violations": violations,
        }), 403

    with db_conn() as conn:
        conn.execute(
            "UPDATE statics SET data_json = ?, updated_at = datetime('now') WHERE id = ?",
            (json.dumps(payload, ensure_ascii=False), static_id),
        )
        cur = conn.execute("SELECT updated_at FROM statics WHERE id = ?", (static_id,))
        updated_at = cur.fetchone()["updated_at"]

    new_etag = _compute_state_etag(static_id, updated_at, session["user_id"], role)
    resp = jsonify({"ok": True, "etag": new_etag, "updated_at": updated_at})
    resp.headers["ETag"] = new_etag
    return resp


# ---------- Gerenciamento de Membros (admin) ----------
@app.get("/api/statics/<int:static_id>/members")
@login_required
def list_static_members(static_id):
    """Lista membros do static com seus cargos. Qualquer membro pode ver."""
    if not _assert_member(static_id, session["user_id"]):
        return jsonify({"error": "not_a_member"}), 403
    conn = get_conn()
    try:
        cur = conn.execute(
            """
            SELECT u.id, u.username, m.role, m.joined_at
            FROM static_members m
            JOIN users u ON u.id = m.user_id
            WHERE m.static_id = ?
            ORDER BY
                CASE m.role WHEN 'admin' THEN 1 WHEN 'officer' THEN 2 ELSE 3 END,
                u.username COLLATE NOCASE
            """,
            (static_id,),
        )
        return jsonify([dict(r) for r in cur.fetchall()])
    finally:
        conn.close()


@app.put("/api/statics/<int:static_id>/members/<int:user_id>/role")
@login_required
def set_member_role(static_id, user_id):
    """Atualiza o cargo de um membro. Apenas admin pode chamar."""
    # Verifica que o caller é admin neste static
    caller_role = get_user_role(static_id, session["user_id"])
    if caller_role != ROLE_ADMIN:
        return jsonify({"error": "forbidden", "required_role": "admin"}), 403

    data = request.get_json(silent=True) or {}
    new_role = (data.get("role") or "").strip().lower()
    if new_role not in VALID_ROLES:
        return jsonify({"error": "invalid_role", "valid": list(VALID_ROLES)}), 400

    # Verifica que o alvo é membro
    if not _assert_member(static_id, user_id):
        return jsonify({"error": "target_not_a_member"}), 404

    # Proteção: impede o admin de auto-rebaixar se for o último admin
    if user_id == session["user_id"] and new_role != ROLE_ADMIN:
        conn = get_conn()
        try:
            cur = conn.execute(
                "SELECT COUNT(*) AS c FROM static_members WHERE static_id = ? AND role = 'admin'",
                (static_id,),
            )
            if cur.fetchone()["c"] <= 1:
                return jsonify({"error": "cannot_demote_last_admin"}), 400
        finally:
            conn.close()

    with db_conn() as conn:
        conn.execute(
            "UPDATE static_members SET role = ? WHERE static_id = ? AND user_id = ?",
            (new_role, static_id, user_id),
        )
    return jsonify({"ok": True, "user_id": user_id, "role": new_role})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
