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
from . import telegram as tg

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
    (bootstrap automático). A remoção de membros pelo admin agora deleta
    a conta inteira (em `remove_static_member`), então não há mais
    necessidade de bloqueio por ban.
    """
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
    static_id = _ensure_global_static()

    with db_conn() as conn:
        # Verifica unicidade em ambas as tabelas
        if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            return jsonify({"error": "Nome de usuário já cadastrado."}), 409
        if conn.execute("SELECT 1 FROM pending_registrations WHERE username = ?", (username,)).fetchone():
            return jsonify({"error": "Já existe uma solicitação pendente para este nome de usuário."}), 409

        # Bootstrap: se não há admin na static, auto-aprova o primeiro cadastro
        has_admin = conn.execute(
            "SELECT 1 FROM static_members WHERE static_id = ? AND role = 'admin' LIMIT 1",
            (static_id,)
        ).fetchone() is not None

        if not has_admin:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, pwd_hash),
            )
            user_id = cur.lastrowid
        else:
            conn.execute(
                "INSERT INTO pending_registrations (username, password_hash) VALUES (?, ?)",
                (username, pwd_hash),
            )
            return jsonify({"status": "pending",
                            "message": "Solicitação enviada. Aguarde aprovação de um officer."}), 202

    active_static_id = _attach_user_to_global(user_id)
    session.permanent = True
    session["user_id"] = user_id
    session["username"] = username
    return jsonify({"id": user_id, "username": username, "active_static_id": active_static_id})


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    conn = get_conn()
    try:
        # Verifica se está aguardando aprovação
        if conn.execute("SELECT 1 FROM pending_registrations WHERE username = ?", (username,)).fetchone():
            return jsonify({"error": "Sua conta ainda aguarda aprovação de um officer."}), 403

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


# ---------- Cadastros pendentes ----------
def _cleanup_expired_pending(conn):
    conn.execute(
        "DELETE FROM pending_registrations WHERE requested_at < datetime('now', '-24 hours')"
    )


@app.get("/api/pending")
@login_required
def list_pending():
    user = current_user()
    static_id = user["active_static_id"] or _ensure_global_static()
    if not role_at_least(get_user_role(static_id, user["id"]), ROLE_OFFICER):
        return jsonify({"error": "Acesso negado."}), 403
    with db_conn() as conn:
        _cleanup_expired_pending(conn)
        cur = conn.execute(
            """SELECT id, username, requested_at,
               CAST((julianday('now') - julianday(requested_at)) * 24 AS INTEGER) AS hours_ago
               FROM pending_registrations ORDER BY requested_at ASC"""
        )
        rows = [dict(r) for r in cur.fetchall()]
    return jsonify(rows)


@app.post("/api/pending/<int:pending_id>/approve")
@login_required
def approve_pending(pending_id):
    user = current_user()
    static_id = user["active_static_id"] or _ensure_global_static()
    if not role_at_least(get_user_role(static_id, user["id"]), ROLE_OFFICER):
        return jsonify({"error": "Acesso negado."}), 403
    with db_conn() as conn:
        cur = conn.execute("SELECT * FROM pending_registrations WHERE id = ?", (pending_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Solicitação não encontrada."}), 404
        try:
            cur2 = conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (row["username"], row["password_hash"]),
            )
            new_user_id = cur2.lastrowid
        except sqlite3.IntegrityError:
            return jsonify({"error": "Nome de usuário já existe em users."}), 409
        conn.execute("DELETE FROM pending_registrations WHERE id = ?", (pending_id,))
    _attach_user_to_global(new_user_id)
    return jsonify({"ok": True, "username": row["username"]})


@app.post("/api/pending/<int:pending_id>/reject")
@login_required
def reject_pending(pending_id):
    user = current_user()
    static_id = user["active_static_id"] or _ensure_global_static()
    if not role_at_least(get_user_role(static_id, user["id"]), ROLE_OFFICER):
        return jsonify({"error": "Acesso negado."}), 403
    with db_conn() as conn:
        conn.execute("DELETE FROM pending_registrations WHERE id = ?", (pending_id,))
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

    # Fase 12: piggyback nos GETs para disparar lembretes 24 h / no dia.
    # Best-effort — falhas silenciosas para não impactar a leitura do estado.
    try:
        _maybe_send_reminders(static_id)
    except Exception:
        pass

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
    for fld in ("activeProgs", "scheduledProgs", "customContents"):
        if old.get(fld) != new.get(fld) and not is_officer:
            violations.append(f"{fld}(officer_only)")

    # raidEvents: officer pode tudo. Member pode editar apenas 'description' de
    # eventos onde é o criador (Fase J — canEditEventDetails).
    if old.get("raidEvents") != new.get("raidEvents") and not is_officer:
        old_evts = {e.get("id"): e for e in (old.get("raidEvents") or []) if isinstance(e, dict)}
        new_evts = {e.get("id"): e for e in (new.get("raidEvents") or []) if isinstance(e, dict)}
        if set(old_evts) != set(new_evts):
            violations.append("raidEvents(add_remove_officer_only)")
        else:
            EDITABLE_FIELDS = {"description"}
            for eid, new_evt in new_evts.items():
                old_evt = old_evts[eid]
                if old_evt == new_evt:
                    continue
                if old_evt.get("createdBy") != user_id:
                    violations.append(f"raidEvents[{eid}](not_creator)")
                    continue
                changed = {k for k in set(old_evt) | set(new_evt) if old_evt.get(k) != new_evt.get(k)}
                disallowed = changed - EDITABLE_FIELDS
                if disallowed:
                    violations.append(f"raidEvents[{eid}](fields_locked:{','.join(sorted(disallowed))})")

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

    # Fase 12: dispara notificações no Telegram para eventos novos/adiados/cancelados.
    # Falhas silenciosas — best-effort, não bloqueia o save.
    try:
        _notify_new_raid_events(
            payload,
            old_data.get("raidEvents"),
            payload.get("raidEvents"),
            static_id,
        )
    except Exception:
        pass

    # Fase L: avalia oportunidades de quórum (8+ confirmados em dia sem evento)
    # e re-persiste se quorumSuggestionsSent foi atualizado.
    try:
        if _evaluate_quorum_opportunities(payload, static_id):
            with db_conn() as conn:
                conn.execute(
                    "UPDATE statics SET data_json = ?, updated_at = datetime('now') WHERE id = ?",
                    (json.dumps(payload, ensure_ascii=False), static_id),
                )
                cur = conn.execute("SELECT updated_at FROM statics WHERE id = ?", (static_id,))
                updated_at = cur.fetchone()["updated_at"]
    except Exception:
        pass

    new_etag = _compute_state_etag(static_id, updated_at, session["user_id"], role)
    resp = jsonify({"ok": True, "etag": new_etag, "updated_at": updated_at})
    resp.headers["ETag"] = new_etag
    return resp


# ---------- Personagem (Fase O) ----------
# character_json mora em users.character_json e é 1:1 com o usuário (independente
# de static). Permite que o mesmo user mantenha um único personagem mesmo se
# trocar de static no futuro (alts/multi-static).
@app.get("/api/character")
@login_required
def get_character():
    user_id = session["user_id"]
    conn = get_conn()
    try:
        cur = conn.execute("SELECT character_json FROM users WHERE id = ?", (user_id,))
        row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        return jsonify({"error": "user_not_found"}), 404
    raw = row["character_json"]
    if not raw:
        return jsonify({})
    try:
        return jsonify(json.loads(raw))
    except (TypeError, ValueError):
        return jsonify({})


@app.put("/api/character")
@login_required
def put_character():
    user_id = session["user_id"]
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "invalid_json"}), 400

    # Validação leve: o frontend é a fonte da verdade da estrutura, aqui só
    # protegemos contra payloads absurdamente grandes ou tipos errados.
    serialized = json.dumps(payload, ensure_ascii=False)
    if len(serialized) > 20000:  # 20KB é folgado para um perfil pessoal
        return jsonify({"error": "payload_too_large"}), 413

    # Sanity checks dos campos opcionais — qualquer um pode estar ausente
    name = payload.get("name")
    if name is not None and not isinstance(name, str):
        return jsonify({"error": "invalid_name"}), 400
    if isinstance(name, str) and len(name) > 80:
        return jsonify({"error": "name_too_long"}), 400

    ilvl = payload.get("ilvl")
    if ilvl is not None and not (isinstance(ilvl, int) and ilvl >= 0):
        return jsonify({"error": "invalid_ilvl"}), 400

    jobs = payload.get("jobs")
    if jobs is not None and not isinstance(jobs, list):
        return jsonify({"error": "invalid_jobs"}), 400

    subs = payload.get("subscribedProgs")
    if subs is not None and not isinstance(subs, list):
        return jsonify({"error": "invalid_subscribedProgs"}), 400

    with db_conn() as conn:
        conn.execute(
            "UPDATE users SET character_json = ? WHERE id = ?",
            (serialized, user_id),
        )
    return jsonify({"ok": True})


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


@app.delete("/api/statics/<int:static_id>/members/<int:user_id>")
@login_required
def remove_static_member(static_id, user_id):
    """Remove um membro do static deletando a conta de usuário inteira.

    Admin only. Efeitos:
    - Deleta a linha do user na tabela `users` (cascade limpa static_members)
    - Orfaniza o roster slot vinculado a esse user (user_id → null)
    - Não pode remover o último admin
    - Não pode auto-deletar (admin precisa pedir a outro admin)
    """
    caller_role = get_user_role(static_id, session["user_id"])
    if caller_role != ROLE_ADMIN:
        return jsonify({"error": "forbidden", "required_role": "admin"}), 403

    if user_id == session["user_id"]:
        return jsonify({"error": "cannot_delete_self"}), 400

    if not _assert_member(static_id, user_id):
        return jsonify({"error": "target_not_a_member"}), 404

    # Proteção: não permite remover o último admin
    target_role = get_user_role(static_id, user_id)
    if target_role == ROLE_ADMIN:
        conn = get_conn()
        try:
            cur = conn.execute(
                "SELECT COUNT(*) AS c FROM static_members WHERE static_id = ? AND role = 'admin'",
                (static_id,),
            )
            if cur.fetchone()["c"] <= 1:
                return jsonify({"error": "cannot_remove_last_admin"}), 400
        finally:
            conn.close()

    # Orfaniza slot no roster e deleta a conta inteira
    with db_conn() as conn:
        cur = conn.execute("SELECT data_json FROM statics WHERE id = ?", (static_id,))
        row = cur.fetchone()
        try:
            data = json.loads(row["data_json"] or "{}") if row else {}
        except (TypeError, ValueError):
            data = {}

        roster = data.get("roster")
        slot_orphaned = False
        if isinstance(roster, list):
            for p in roster:
                if isinstance(p, dict) and p.get("user_id") == user_id:
                    p["user_id"] = None
                    slot_orphaned = True

        if slot_orphaned:
            conn.execute(
                "UPDATE statics SET data_json = ?, updated_at = datetime('now') WHERE id = ?",
                (json.dumps(data, ensure_ascii=False), static_id),
            )

        # Deleta a conta — CASCADE limpa static_members automaticamente
        conn.execute("DELETE FROM users WHERE id = ?", (user_id,))

    return jsonify({"ok": True, "deleted_user_id": user_id, "slot_orphaned": slot_orphaned})


# ==========================================================================
# Fase 12 — Integração Telegram
# ==========================================================================

def _get_static_telegram_chat_id(static_id):
    conn = get_conn()
    try:
        cur = conn.execute("SELECT telegram_chat_id FROM statics WHERE id = ?", (static_id,))
        row = cur.fetchone()
        return row["telegram_chat_id"] if row else None
    finally:
        conn.close()


def _set_static_telegram_chat_id(static_id, chat_id):
    chat_id_str = str(chat_id) if chat_id is not None else None
    with db_conn() as conn:
        conn.execute(
            "UPDATE statics SET telegram_chat_id = ? WHERE id = ?",
            (chat_id_str, static_id),
        )


def _count_confirmed_for_date(state_data, date_str):
    """Conta jogadores com 'avail' no monthlySchedule da data.

    'late' (Talvez/Atraso) é status incerto e não conta como confirmação.
    """
    roster = state_data.get("roster") or []
    count = 0
    for p in roster:
        if not isinstance(p, dict):
            continue
        sched = p.get("monthlySchedule") or {}
        if sched.get(date_str) == "avail":
            count += 1
    return count


def _is_dynamic_prog(state_data, prog_id):
    """Detecta se um prog custom é dynamic. Hardcoded é sempre full party."""
    customs = state_data.get("customContents") or []
    for c in customs:
        if isinstance(c, dict) and c.get("id") == prog_id:
            return (c.get("partyMode") or "full") == "dynamic"
    return False


def _notify_new_raid_events(state_data, old_events, new_events, static_id):
    """Detecta eventos recém-criados, adiados ou cancelados e dispara notificações."""
    chat_id = _get_static_telegram_chat_id(static_id)
    if not chat_id or not tg.is_configured():
        return

    old_by_id = {e.get("id"): e for e in (old_events or []) if isinstance(e, dict)}
    new_by_id = {e.get("id"): e for e in (new_events or []) if isinstance(e, dict)}

    for evt in (new_events or []):
        if not isinstance(evt, dict):
            continue
        evt_id = evt.get("id")
        prog_name = evt.get("progName") or evt.get("progId") or "Raid"
        quorum = evt.get("quorum") or 0
        dynamic = _is_dynamic_prog(state_data, evt.get("progId"))

        if evt_id not in old_by_id:
            # Evento novo
            target_date = evt.get("postponedTo") or evt.get("date")
            confirmed = _count_confirmed_for_date(state_data, target_date)
            description = evt.get("description")
            msg = tg.format_event_created(prog_name, target_date, confirmed, quorum, dynamic=dynamic, description=description)
            tg.send_group_message(chat_id, msg)
        else:
            # Evento existente: checa adiamento
            old_evt = old_by_id[evt_id]
            if evt.get("postponedTo") and evt.get("postponedTo") != old_evt.get("postponedTo"):
                old_target = old_evt.get("postponedTo") or old_evt.get("date")
                description = evt.get("description")
                msg = tg.format_event_postponed(prog_name, old_target, evt.get("postponedTo"), description=description)
                tg.send_group_message(chat_id, msg)

    # Detecta cancelamentos (ids que estavam em old e sumiram em new)
    cancelled = [e for e in (old_events or [])
                 if isinstance(e, dict) and e.get("id") not in new_by_id]
    if len(cancelled) > 2:
        # Cascateamento (provavelmente remoção de prog inteiro) — agrega
        tg.send_group_message(chat_id, tg.format_event_cancelled_bulk(len(cancelled)))
    else:
        for old_evt in cancelled:
            prog_name = old_evt.get("progName") or old_evt.get("progId") or "Raid"
            target_date = old_evt.get("postponedTo") or old_evt.get("date")
            msg = tg.format_event_cancelled(prog_name, target_date)
            tg.send_group_message(chat_id, msg)


def _evaluate_quorum_opportunities(state_data, static_id):
    """Detecta dias com 8+ confirmações sem evento agendado e avisa no Telegram.

    Dispara apenas uma vez por (data) usando state.quorumSuggestionsSent como flag.
    Modifica state_data in-place. Retorna True se houve mudanças que precisam ser persistidas.
    """
    chat_id = _get_static_telegram_chat_id(static_id)
    if not chat_id or not tg.is_configured():
        return False

    from datetime import date, timedelta
    today = date.today()
    today_iso = today.isoformat()

    booked_dates = set()
    for evt in (state_data.get("raidEvents") or []):
        if isinstance(evt, dict):
            d = evt.get("postponedTo") or evt.get("date")
            if d:
                booked_dates.add(d)

    sent_in = state_data.get("quorumSuggestionsSent") or {}
    # Housekeeping: descarta entradas com data passada
    sent = {k: v for k, v in sent_in.items() if isinstance(k, str) and k >= today_iso}

    changed = sent != sent_in
    for delta in range(0, 14):
        d = (today + timedelta(days=delta)).isoformat()
        if d in booked_dates or d in sent:
            continue
        count = _count_confirmed_for_date(state_data, d)
        if count >= 8:
            if tg.send_group_message(chat_id, tg.format_quorum_suggestion(d, count)):
                sent[d] = True
                changed = True

    if changed:
        state_data["quorumSuggestionsSent"] = sent
    return changed


def _maybe_send_reminders(static_id):
    """Piggyback: checa eventos do dia/amanhã e dispara lembretes pendentes.

    Chamado dentro do GET /api/state. Best-effort — falhas são engolidas.
    """
    chat_id = _get_static_telegram_chat_id(static_id)
    if not chat_id or not tg.is_configured():
        return

    from datetime import date, timedelta
    today = date.today().isoformat()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    conn = get_conn()
    try:
        cur = conn.execute("SELECT data_json FROM statics WHERE id = ?", (static_id,))
        row = cur.fetchone()
        if not row:
            return
        try:
            data = json.loads(row["data_json"] or "{}")
        except (TypeError, ValueError):
            return
    finally:
        conn.close()

    events = data.get("raidEvents") or []
    if not events:
        return

    changed = False
    for evt in events:
        if not isinstance(evt, dict):
            continue
        target_date = evt.get("postponedTo") or evt.get("date")
        prog_name = evt.get("progName") or evt.get("progId") or "Raid"
        quorum = evt.get("quorum") or 0
        dynamic = _is_dynamic_prog(data, evt.get("progId"))
        confirmed = _count_confirmed_for_date(data, target_date)

        description = evt.get("description")
        if target_date == tomorrow and not evt.get("reminder24hSent"):
            msg = tg.format_reminder_24h(prog_name, target_date, confirmed, quorum, dynamic=dynamic, description=description)
            if tg.send_group_message(chat_id, msg):
                evt["reminder24hSent"] = True
                changed = True
        elif target_date == today and not evt.get("reminderTodaySent"):
            msg = tg.format_reminder_today(prog_name, target_date, confirmed, quorum, dynamic=dynamic, description=description)
            if tg.send_group_message(chat_id, msg):
                evt["reminderTodaySent"] = True
                changed = True

    if changed:
        with db_conn() as conn:
            conn.execute(
                "UPDATE statics SET data_json = ? WHERE id = ?",
                (json.dumps(data, ensure_ascii=False), static_id),
            )


@app.post("/api/telegram/webhook")
def telegram_webhook():
    """Recebe updates do Telegram. Autenticação via secret token no header."""
    # Valida secret (proteção contra invocações externas)
    incoming = request.headers.get("X-Telegram-Bot-Api-Secret-Token") or ""
    expected = tg.get_webhook_secret() or ""
    if not expected or incoming != expected:
        return jsonify({"error": "forbidden"}), 403

    update = request.get_json(silent=True) or {}
    message = update.get("message") or update.get("edited_message") or {}
    chat = message.get("chat") or {}
    text = (message.get("text") or "").strip()
    chat_id = chat.get("id")
    chat_type = chat.get("type")

    # Vincula o grupo quando recebe /start em um chat de grupo
    if chat_id and chat_type in ("group", "supergroup"):
        first_token = text.split()[0] if text else ""
        # /start ou /start@nome_do_bot
        if first_token == "/start" or first_token.startswith("/start@"):
            static_id = _ensure_global_static()
            _set_static_telegram_chat_id(static_id, chat_id)
            chat_title = chat.get("title") or "este grupo"
            confirm = f"✅ Bot vinculado a <b>{chat_title}</b>. Alertas de raid serão enviados aqui."
            tg.send_group_message(chat_id, confirm)
            return jsonify({"ok": True, "bound": True, "chat_id": chat_id})

    # Detecta entrada do bot em um novo grupo via my_chat_member
    member_update = update.get("my_chat_member")
    if member_update:
        new_chat = member_update.get("chat") or {}
        new_status = (member_update.get("new_chat_member") or {}).get("status")
        if new_chat.get("type") in ("group", "supergroup") and new_status in ("member", "administrator"):
            static_id = _ensure_global_static()
            _set_static_telegram_chat_id(static_id, new_chat.get("id"))
            greeting = "👋 Olá! Mande /start aqui pra confirmar o vínculo com o Mhigos Raid Planner."
            tg.send_group_message(new_chat.get("id"), greeting)
            return jsonify({"ok": True, "bound": True, "chat_id": new_chat.get("id")})

    return jsonify({"ok": True})


@app.get("/api/telegram/status")
@login_required
def telegram_status():
    """Retorna o status da integração. Qualquer membro pode consultar."""
    user = current_user()
    static_id = user["active_static_id"] or _ensure_global_static()
    chat_id = _get_static_telegram_chat_id(static_id)
    return jsonify({
        "configured": tg.is_configured(),
        "chat_id": chat_id,
        "bound": bool(chat_id),
    })


@app.post("/api/telegram/unbind")
@login_required
def telegram_unbind():
    """Remove o vínculo do grupo. Apenas admin."""
    user = current_user()
    static_id = user["active_static_id"] or _ensure_global_static()
    if get_user_role(static_id, user["id"]) != ROLE_ADMIN:
        return jsonify({"error": "forbidden", "required_role": "admin"}), 403
    _set_static_telegram_chat_id(static_id, None)
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
