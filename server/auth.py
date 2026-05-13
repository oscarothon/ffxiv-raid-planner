"""Helpers de autenticação por sessão (cookies assinados do Flask)."""
from functools import wraps
from flask import session, jsonify
from .db import get_conn


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
