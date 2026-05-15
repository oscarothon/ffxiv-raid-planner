"""Helpers de autenticação por sessão (cookies assinados do Flask)."""
from functools import wraps
from flask import session, jsonify
from .db import get_conn

# Hierarquia de cargos: admin > officer > member
ROLE_RANK = {"admin": 3, "officer": 2, "member": 1}


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "unauthorized"}), 401
        return f(*args, **kwargs)
    return wrapper


def current_user():
    if "user_id" not in session:
        return None
    conn = get_conn()
    try:
        cur = conn.execute("SELECT * FROM users WHERE id = ?", (session["user_id"],))
        return cur.fetchone()
    finally:
        conn.close()


def get_user_role(static_id, user_id):
    """Retorna o cargo do user na static (admin/officer/member) ou None."""
    if not static_id or not user_id:
        return None
    conn = get_conn()
    try:
        cur = conn.execute(
            "SELECT role FROM static_members WHERE static_id = ? AND user_id = ?",
            (static_id, user_id),
        )
        row = cur.fetchone()
        return row["role"] if row else None
    finally:
        conn.close()


def role_at_least(role, minimum):
    """True se `role` é igual ou superior a `minimum` na hierarquia."""
    return ROLE_RANK.get(role, 0) >= ROLE_RANK.get(minimum, 99)


def require_role(min_role):
    """Decorator factory: bloqueia se o user logado não tiver o cargo mínimo
    no static ativo."""
    def deco(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if "user_id" not in session:
                return jsonify({"error": "unauthorized"}), 401
            user = current_user()
            if not user:
                return jsonify({"error": "unauthorized"}), 401
            static_id = user["active_static_id"]
            role = get_user_role(static_id, user["id"])
            if not role:
                return jsonify({"error": "not_a_member"}), 403
            if not role_at_least(role, min_role):
                return jsonify({"error": "forbidden", "required_role": min_role, "your_role": role}), 403
            return f(*args, **kwargs)
        return wrapper
    return deco
