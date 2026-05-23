"""Testes de autenticação — helpers de auth.py e rotas de auth em app.py.

Cobre:
- Helpers puros: ROLE_RANK, role_at_least
- Fluxo de registro: primeiro usuário vira admin, validações, duplicatas, pending
- Fluxo de login: sucesso, senha errada, usuário desconhecido, pending
- Logout: limpa sessão
- /api/me: sem sessão → 401, com sessão → dados do usuário
- /api/pending (list, approve, reject): permissões, fluxo completo, edge cases
- _cleanup_expired_pending: limpeza de registros expirados
- Decorators login_required e require_role
"""
from __future__ import annotations

import importlib
import sqlite3
from datetime import datetime, timezone, timedelta

import pytest


def _auth(app_module):
    """Retorna o módulo server.auth já carregado junto com app_module."""
    import sys
    return sys.modules["server.auth"]


# ---------------------------------------------------------------------------
# Helpers puros — não precisam de Flask, mas precisam do módulo carregado
# ---------------------------------------------------------------------------

class TestRoleRank:
    """Testa a estrutura e semântica de ROLE_RANK."""

    def test_contem_tres_cargos(self, app_module):
        rank = _auth(app_module).ROLE_RANK
        assert set(rank.keys()) == {"admin", "officer", "member"}

    def test_admin_maior_que_officer(self, app_module):
        rank = _auth(app_module).ROLE_RANK
        assert rank["admin"] > rank["officer"]

    def test_officer_maior_que_member(self, app_module):
        rank = _auth(app_module).ROLE_RANK
        assert rank["officer"] > rank["member"]

    def test_member_maior_que_zero(self, app_module):
        rank = _auth(app_module).ROLE_RANK
        assert rank["member"] > 0


class TestRoleAtLeast:
    """Testa role_at_least com todos os casos relevantes."""

    def test_admin_maior_que_officer(self, app_module):
        assert _auth(app_module).role_at_least("admin", "officer") is True

    def test_admin_maior_que_member(self, app_module):
        assert _auth(app_module).role_at_least("admin", "member") is True

    def test_admin_igual_admin(self, app_module):
        assert _auth(app_module).role_at_least("admin", "admin") is True

    def test_officer_maior_que_member(self, app_module):
        assert _auth(app_module).role_at_least("officer", "member") is True

    def test_officer_igual_officer(self, app_module):
        assert _auth(app_module).role_at_least("officer", "officer") is True

    def test_officer_menor_que_admin(self, app_module):
        assert _auth(app_module).role_at_least("officer", "admin") is False

    def test_member_menor_que_officer(self, app_module):
        assert _auth(app_module).role_at_least("member", "officer") is False

    def test_member_igual_member(self, app_module):
        assert _auth(app_module).role_at_least("member", "member") is True

    def test_cargo_desconhecido_retorna_falso(self, app_module):
        # Cargos desconhecidos mapeiam para 0
        assert _auth(app_module).role_at_least("superuser", "member") is False

    def test_minimo_desconhecido_retorna_falso(self, app_module):
        # Mínimo desconhecido mapeia para 99 — ninguém passa
        assert _auth(app_module).role_at_least("admin", "superadmin") is False

    def test_ambos_desconhecidos(self, app_module):
        # 0 >= 99 → False
        assert _auth(app_module).role_at_least("x", "y") is False


# ---------------------------------------------------------------------------
# Fixtures de conveniência
# ---------------------------------------------------------------------------

@pytest.fixture
def admin_api(api):
    """Registra e mantém sessão do admin."""
    api.register("admin_user")
    return api


@pytest.fixture
def officer_api(api, admin_api):
    """Registra um officer e mantém a sessão dele."""
    # Registra como pending
    api2_client = api.client.application.test_client()
    # Usamos o mesmo client — cria segundo usuário como pending
    api.logout()
    # Registra pending com um novo client para não sobrescrever a sessão do admin
    from tests.conftest import APIClient
    api2 = APIClient(api.client.application.test_client())
    api2.register("officer_user")

    # Admin aprova
    api.login("admin_user")
    pending = api.list_pending().get_json()
    pending_id = next(p["id"] for p in pending if p["username"] == "officer_user")
    api.approve_pending(pending_id)

    # Admin promove a officer via DB
    import os
    db_path = os.environ.get("DATABASE_PATH")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(
        "UPDATE static_members SET role = 'officer' "
        "WHERE user_id = (SELECT id FROM users WHERE username = 'officer_user')"
    )
    conn.commit()
    conn.close()

    api.logout()
    api.login("officer_user")
    return api


# ---------------------------------------------------------------------------
# Fluxo de registro
# ---------------------------------------------------------------------------

class TestRegistroPrimeiroUsuario:
    """O primeiro registro auto-vira admin da static global."""

    def test_primeiro_usuario_recebe_status_200(self, api):
        res = api.register("alice")
        assert res.status_code == 200

    def test_primeiro_usuario_vira_admin(self, api):
        api.register("alice")
        me = api.me().get_json()
        assert me["role"] == "admin"

    def test_primeiro_usuario_sessao_ativa(self, api):
        api.register("alice")
        me = api.me()
        assert me.status_code == 200

    def test_primeiro_usuario_retorna_username(self, api):
        api.register("alice")
        me = api.me().get_json()
        assert me["username"] == "alice"

    def test_primeiro_usuario_tem_active_static_id(self, api):
        api.register("alice")
        me = api.me().get_json()
        assert me["active_static_id"] is not None

    def test_retorno_registro_contem_campos(self, api):
        res = api.register("alice")
        data = res.get_json()
        assert "id" in data
        assert data["username"] == "alice"
        assert "active_static_id" in data


class TestRegistroValidacoes:
    """Validações de campo no registro."""

    @pytest.mark.parametrize("username,expected_status", [
        ("ab", 400),           # < 3 chars
        ("", 400),             # vazio
        ("a" * 33, 400),       # > 32 chars
    ])
    def test_username_invalido(self, api, username, expected_status):
        res = api.register(username, "senha123")
        assert res.status_code == expected_status

    @pytest.mark.parametrize("password", ["", "12345", "abc"])
    def test_senha_curta_retorna_400(self, api, password):
        res = api.register("alice", password)
        assert res.status_code == 400

    def test_username_exatamente_3_chars_aceito(self, api):
        res = api.register("ali", "senha123")
        assert res.status_code == 200

    def test_username_exatamente_32_chars_aceito(self, api):
        res = api.register("a" * 32, "senha123")
        assert res.status_code == 200

    def test_senha_exatamente_6_chars_aceita(self, api):
        res = api.register("alice", "123456")
        assert res.status_code == 200

    def test_whitespace_trimado_do_username(self, api):
        res = api.register("  alice  ", "senha123")
        assert res.status_code == 200
        me = api.me().get_json()
        assert me["username"] == "alice"

    def test_sem_json_retorna_400(self, client):
        res = client.post("/api/register")
        assert res.status_code == 400

    def test_json_vazio_retorna_400(self, client):
        res = client.post("/api/register", json={})
        assert res.status_code == 400


class TestRegistroDuplicatas:
    """Duplicatas de username — em users e em pending_registrations."""

    def test_username_duplicado_em_users_retorna_409(self, api, admin_user):
        # admin_user já está em users como "admin_user"
        res = api.register("admin_user", "outrasenha")
        assert res.status_code == 409

    def test_username_duplicado_em_pending_retorna_409(self, api, admin_user):
        # Deslogamos admin para poder registrar um novo pending com o mesmo
        api.logout()
        api.register("novousuario")   # vai para pending (admin existe)
        api.logout()
        # Tentamos registrar de novo com o mesmo username
        res = api.register("novousuario")
        assert res.status_code == 409

    def test_mensagem_de_erro_409_users(self, api, admin_user):
        api.logout()
        res = api.register("admin_user")
        data = res.get_json()
        assert "error" in data

    def test_mensagem_de_erro_409_pending(self, api, admin_user):
        api.logout()
        api.register("novousuario")
        api.logout()
        res = api.register("novousuario")
        data = res.get_json()
        assert "error" in data


class TestRegistroSegundoUsuario:
    """Segundo usuário (após admin existir) vai para pending."""

    def test_segundo_registro_retorna_202(self, api, admin_user):
        api.logout()
        res = api.register("bob")
        assert res.status_code == 202

    def test_segundo_registro_retorna_status_pending(self, api, admin_user):
        api.logout()
        res = api.register("bob")
        data = res.get_json()
        assert data.get("status") == "pending"

    def test_segundo_registro_aparece_em_pending(self, api, admin_user):
        api.logout()
        api.register("bob")
        api.login("admin_user")
        pending = api.list_pending().get_json()
        nomes = [p["username"] for p in pending]
        assert "bob" in nomes


# ---------------------------------------------------------------------------
# Fluxo de login
# ---------------------------------------------------------------------------

class TestLogin:
    """Login com credenciais corretas, erradas e edge cases."""

    def test_login_sucesso_retorna_200(self, api, admin_user):
        api.logout()
        res = api.login("admin_user")
        assert res.status_code == 200

    def test_login_sucesso_seta_sessao(self, api, admin_user):
        api.logout()
        api.login("admin_user")
        me = api.me()
        assert me.status_code == 200

    def test_login_retorna_campos(self, api, admin_user):
        api.logout()
        res = api.login("admin_user")
        data = res.get_json()
        assert data["username"] == "admin_user"
        assert "id" in data
        assert "active_static_id" in data

    def test_senha_errada_retorna_401(self, api, admin_user):
        api.logout()
        res = api.login("admin_user", "senha_errada")
        assert res.status_code == 401

    def test_usuario_desconhecido_retorna_401(self, api):
        res = api.login("naoexiste")
        assert res.status_code == 401

    def test_usuario_em_pending_retorna_403(self, api, admin_user):
        api.logout()
        api.register("bob")        # vai para pending
        api.logout()
        res = api.login("bob")
        assert res.status_code == 403

    def test_usuario_em_pending_mensagem_em_portugues(self, api, admin_user):
        api.logout()
        api.register("bob")
        api.logout()
        res = api.login("bob")
        data = res.get_json()
        assert "aprovação" in data.get("error", "")

    def test_login_vincula_usuario_a_static_global(self, api, admin_user):
        api.logout()
        api.login("admin_user")
        me = api.me().get_json()
        assert me["active_static_id"] is not None

    def test_whitespace_no_username_aceito(self, api, admin_user):
        api.logout()
        res = api.login("  admin_user  ")
        assert res.status_code == 200

    def test_login_sem_json_retorna_401(self, client, admin_user):
        # Sem payload válido, username fica vazio → usuário não existe → 401
        res = client.post("/api/login")
        assert res.status_code == 401


# ---------------------------------------------------------------------------
# Logout
# ---------------------------------------------------------------------------

class TestLogout:
    """Logout limpa a sessão."""

    def test_logout_retorna_ok_true(self, api, admin_user):
        res = api.logout()
        assert res.status_code == 200
        assert res.get_json().get("ok") is True

    def test_logout_invalida_sessao(self, api, admin_user):
        api.logout()
        me = api.me()
        assert me.status_code == 401

    def test_logout_sem_sessao_retorna_ok(self, api):
        # Mesmo sem estar logado, logout deve retornar ok
        res = api.logout()
        assert res.status_code == 200
        assert res.get_json().get("ok") is True

    def test_logout_duplo_retorna_ok(self, api, admin_user):
        api.logout()
        res = api.logout()
        assert res.get_json().get("ok") is True


# ---------------------------------------------------------------------------
# /api/me
# ---------------------------------------------------------------------------

class TestMe:
    """Endpoint /api/me."""

    def test_sem_autenticacao_retorna_401(self, api):
        res = api.me()
        assert res.status_code == 401

    def test_autenticado_retorna_200(self, api, admin_user):
        res = api.me()
        assert res.status_code == 200

    def test_retorna_id(self, api, admin_user):
        me = api.me().get_json()
        assert "id" in me

    def test_retorna_username(self, api, admin_user):
        me = api.me().get_json()
        assert me["username"] == "admin_user"

    def test_retorna_active_static_id(self, api, admin_user):
        me = api.me().get_json()
        assert "active_static_id" in me
        assert me["active_static_id"] is not None

    def test_retorna_role(self, api, admin_user):
        me = api.me().get_json()
        assert me["role"] == "admin"

    def test_member_tem_role_member(self, api, member_user):
        me = api.me().get_json()
        assert me["role"] == "member"


# ---------------------------------------------------------------------------
# /api/pending — listagem
# ---------------------------------------------------------------------------

class TestPendingLista:
    """Listagem de pendentes — permissões e conteúdo."""

    def test_anonimo_retorna_401(self, api):
        res = api.list_pending()
        assert res.status_code == 401

    def test_member_retorna_403(self, api, member_user):
        res = api.list_pending()
        assert res.status_code == 403

    def test_admin_retorna_200(self, api, admin_user):
        res = api.list_pending()
        assert res.status_code == 200

    def test_admin_lista_vazia_quando_nao_ha_pendentes(self, api, admin_user):
        rows = api.list_pending().get_json()
        assert rows == []

    def test_pending_aparece_na_lista(self, api, admin_user):
        api.logout()
        api.register("bob")
        api.login("admin_user")
        rows = api.list_pending().get_json()
        nomes = [r["username"] for r in rows]
        assert "bob" in nomes

    def test_pending_tem_campo_hours_ago(self, api, admin_user):
        api.logout()
        api.register("bob")
        api.login("admin_user")
        rows = api.list_pending().get_json()
        bob = next(r for r in rows if r["username"] == "bob")
        assert "hours_ago" in bob
        assert bob["hours_ago"] == 0  # acabou de registrar

    def test_officer_pode_listar_pendentes(self, officer_api):
        res = officer_api.list_pending()
        assert res.status_code == 200


# ---------------------------------------------------------------------------
# /api/pending — aprovação
# ---------------------------------------------------------------------------

class TestPendingAprova:
    """Aprovação de registros pendentes."""

    def test_aprovar_cria_usuario(self, api, admin_user):
        api.logout()
        api.register("bob")
        api.login("admin_user")
        pending = api.list_pending().get_json()
        bob_id = next(p["id"] for p in pending if p["username"] == "bob")
        res = api.approve_pending(bob_id)
        assert res.status_code == 200
        assert res.get_json().get("ok") is True

    def test_aprovar_retorna_username(self, api, admin_user):
        api.logout()
        api.register("bob")
        api.login("admin_user")
        pending = api.list_pending().get_json()
        bob_id = next(p["id"] for p in pending if p["username"] == "bob")
        data = api.approve_pending(bob_id).get_json()
        assert data["username"] == "bob"

    def test_apos_aprovacao_usuario_pode_logar(self, api, admin_user):
        api.logout()
        api.register("bob")
        api.login("admin_user")
        pending = api.list_pending().get_json()
        bob_id = next(p["id"] for p in pending if p["username"] == "bob")
        api.approve_pending(bob_id)
        api.logout()
        res = api.login("bob")
        assert res.status_code == 200

    def test_apos_aprovacao_removido_de_pending(self, api, admin_user):
        api.logout()
        api.register("bob")
        api.login("admin_user")
        pending = api.list_pending().get_json()
        bob_id = next(p["id"] for p in pending if p["username"] == "bob")
        api.approve_pending(bob_id)
        rows = api.list_pending().get_json()
        nomes = [r["username"] for r in rows]
        assert "bob" not in nomes

    def test_aprovar_id_inexistente_retorna_404(self, api, admin_user):
        res = api.approve_pending(99999)
        assert res.status_code == 404

    def test_aprovar_com_colisao_username_retorna_409(self, api, admin_user, app_module):
        """Colisão: inserir user diretamente no DB antes de aprovar o pending."""
        import os
        api.logout()
        api.register("colide")
        api.login("admin_user")
        pending = api.list_pending().get_json()
        colide_id = next(p["id"] for p in pending if p["username"] == "colide")

        # Força a colisão: insere "colide" em users diretamente
        db_path = os.environ.get("DATABASE_PATH")
        conn = sqlite3.connect(db_path)
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            ("colide", "fakehash"),
        )
        conn.commit()
        conn.close()

        res = api.approve_pending(colide_id)
        assert res.status_code == 409

    def test_anonimo_aprovar_retorna_401(self, api):
        res = api.approve_pending(1)
        assert res.status_code == 401

    def test_member_aprovar_retorna_403(self, api, member_user):
        res = api.approve_pending(1)
        assert res.status_code == 403


# ---------------------------------------------------------------------------
# /api/pending — rejeição
# ---------------------------------------------------------------------------

class TestPendingRejeita:
    """Rejeição de registros pendentes."""

    def test_rejeitar_retorna_ok(self, api, admin_user):
        api.logout()
        api.register("bob")
        api.login("admin_user")
        pending = api.list_pending().get_json()
        bob_id = next(p["id"] for p in pending if p["username"] == "bob")
        res = api.reject_pending(bob_id)
        assert res.status_code == 200
        assert res.get_json().get("ok") is True

    def test_apos_rejeicao_usuario_nao_pode_logar(self, api, admin_user):
        api.logout()
        api.register("bob")
        api.login("admin_user")
        pending = api.list_pending().get_json()
        bob_id = next(p["id"] for p in pending if p["username"] == "bob")
        api.reject_pending(bob_id)
        api.logout()
        res = api.login("bob")
        # Rejeitado → removido de pending e sem conta em users → 401
        assert res.status_code == 401

    def test_apos_rejeicao_removido_de_pending(self, api, admin_user):
        api.logout()
        api.register("bob")
        api.login("admin_user")
        pending = api.list_pending().get_json()
        bob_id = next(p["id"] for p in pending if p["username"] == "bob")
        api.reject_pending(bob_id)
        rows = api.list_pending().get_json()
        nomes = [r["username"] for r in rows]
        assert "bob" not in nomes

    def test_rejeitar_id_inexistente_retorna_ok(self, api, admin_user):
        # DELETE de id inexistente é silencioso em SQLite → ok
        res = api.reject_pending(99999)
        assert res.status_code == 200

    def test_anonimo_rejeitar_retorna_401(self, api):
        res = api.reject_pending(1)
        assert res.status_code == 401

    def test_member_rejeitar_retorna_403(self, api, member_user):
        res = api.reject_pending(1)
        assert res.status_code == 403


# ---------------------------------------------------------------------------
# _cleanup_expired_pending
# ---------------------------------------------------------------------------

class TestCleanupExpiredPending:
    """Limpeza automática de pendentes com mais de 24h."""

    def test_pendente_expirado_removido_ao_listar(self, api, admin_user, app_module):
        """Insere row com requested_at antigo e verifica que sumiu ao listar."""
        import os
        db_path = os.environ.get("DATABASE_PATH")
        conn = sqlite3.connect(db_path)
        conn.execute(
            "INSERT INTO pending_registrations (username, password_hash, requested_at) "
            "VALUES (?, ?, datetime('now', '-25 hours'))",
            ("expirado", "fakehash"),
        )
        conn.commit()
        conn.close()

        rows = api.list_pending().get_json()
        nomes = [r["username"] for r in rows]
        assert "expirado" not in nomes

    def test_pendente_recente_nao_removido_ao_listar(self, api, admin_user):
        api.logout()
        api.register("recente")
        api.login("admin_user")
        rows = api.list_pending().get_json()
        nomes = [r["username"] for r in rows]
        assert "recente" in nomes

    def test_pendente_com_23h_nao_removido(self, api, admin_user, app_module):
        """Pending com 23h ainda não deve ser removido (limite é 24h)."""
        import os
        db_path = os.environ.get("DATABASE_PATH")
        conn = sqlite3.connect(db_path)
        conn.execute(
            "INSERT INTO pending_registrations (username, password_hash, requested_at) "
            "VALUES (?, ?, datetime('now', '-23 hours'))",
            ("quaseexpirado", "fakehash"),
        )
        conn.commit()
        conn.close()

        rows = api.list_pending().get_json()
        nomes = [r["username"] for r in rows]
        assert "quaseexpirado" in nomes


# ---------------------------------------------------------------------------
# Decorator login_required — verificação via rotas que o usam
# ---------------------------------------------------------------------------

class TestLoginRequired:
    """Qualquer rota com @login_required deve retornar 401 sem sessão."""

    @pytest.mark.parametrize("method,path", [
        ("GET", "/api/pending"),
        ("POST", "/api/pending/1/approve"),
        ("POST", "/api/pending/1/reject"),
    ])
    def test_sem_sessao_retorna_401(self, client, method, path):
        if method == "GET":
            res = client.get(path)
        else:
            res = client.post(path, json={})
        assert res.status_code == 401

    def test_com_sessao_valida_nao_retorna_401_em_me(self, api, admin_user):
        res = api.me()
        assert res.status_code != 401


# ---------------------------------------------------------------------------
# Decorator require_role — rota auxiliar de teste
# ---------------------------------------------------------------------------

class TestRequireRole:
    """Testa o decorator require_role via rota auxiliar registrada no app."""

    @pytest.fixture(autouse=True)
    def _registra_rota_auxiliar(self, app):
        """Registra /api/test-require-officer diretamente no app de testes."""
        from server.auth import require_role, ROLE_RANK
        ROLE_OFFICER = "officer"

        @app.route("/api/test-require-officer", methods=["GET"])
        @require_role(ROLE_OFFICER)
        def _test_require_officer_route():
            from flask import jsonify
            return jsonify({"ok": True})

    def test_anonimo_retorna_401(self, client):
        res = client.get("/api/test-require-officer")
        assert res.status_code == 401

    def test_member_retorna_403(self, api, member_user):
        res = api.client.get("/api/test-require-officer")
        assert res.status_code == 403

    def test_member_retorna_required_role(self, api, member_user):
        res = api.client.get("/api/test-require-officer")
        data = res.get_json()
        assert "required_role" in data

    def test_member_retorna_your_role(self, api, member_user):
        res = api.client.get("/api/test-require-officer")
        data = res.get_json()
        assert "your_role" in data
        assert data["your_role"] == "member"

    def test_officer_retorna_200(self, officer_api):
        res = officer_api.client.get("/api/test-require-officer")
        assert res.status_code == 200

    def test_admin_retorna_200(self, api, admin_user):
        res = api.client.get("/api/test-require-officer")
        assert res.status_code == 200


# ---------------------------------------------------------------------------
# _attach_user_to_global — verificado via register/login
# ---------------------------------------------------------------------------

class TestAttachUserToGlobal:
    """Verifica que _attach_user_to_global funciona nos fluxos principais."""

    def test_primeiro_usuario_tem_active_static_id_nao_nulo(self, api):
        api.register("alice")
        me = api.me().get_json()
        assert me["active_static_id"] is not None

    def test_login_define_active_static_id(self, api, admin_user):
        api.logout()
        api.login("admin_user")
        me = api.me().get_json()
        assert me["active_static_id"] is not None

    def test_usuario_aprovado_recebe_active_static_id(self, api, admin_user):
        api.logout()
        api.register("bob")
        api.login("admin_user")
        pending = api.list_pending().get_json()
        bob_id = next(p["id"] for p in pending if p["username"] == "bob")
        api.approve_pending(bob_id)
        api.logout()
        api.login("bob")
        me = api.me().get_json()
        assert me["active_static_id"] is not None
