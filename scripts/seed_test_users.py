"""Seed de usuários de teste para a static global local.

Cria 11 usuários cobrindo cenários de Full Party, Light Party, Banco e Fase P
(incompatibilidade por expansão + Limited level). Idempotente: se um username
já existe, pula. Não toca em usuários existentes (Oscar, claude-test, etc).

**Estratégia de status:** todos os novos slots entram como **bench** em todos
os progs. O officer/admin promove pelo UI conforme o cenário de teste
(Full Party / Light Party / Banco), respeitando o cap (8 / 4). Isso evita
estourar o limite de Light Party quando legados já ocupam vagas e mantém
retrocompatibilidade com o roster existente.

Uso (a partir da raiz do projeto):
    python -m scripts.seed_test_users

Senha de todos: `test1234`

Para limpar (recomeçar do zero):
    python -m scripts.seed_test_users --reset

ATENÇÃO: --reset deleta TODOS os usuários cujo username começa com `t_`
e remove os slots correspondentes do roster da static global.
"""

import json
import sys
import sqlite3
from werkzeug.security import generate_password_hash

# Imports do projeto
sys.path.insert(0, '.')
from server.db import DB_PATH


SHARED_PASSWORD = "test1234"
USERNAME_PREFIX = "t_"


# ============================================================================
# Definição do backlog
# ============================================================================
# Cada usuário tem: char (jobs, expansão, ilvl) + statusByProg do slot do roster.
# A lógica está dimensionada para:
#   - Full Party (8) em arcadion_lh (DT, Savage) e DSR (EW, Ultimate)
#   - Light Party (4) em custom_skydeep (DT, Light Party)
#   - Banco (2-3 reservas)
#   - 1 user EW-only (testa incompatibilidade em conteúdo DT, compatível com DSR)
#   - 1 user com BLU lvl 75 (passa em BLU lvl <=75, bloqueado em lvl >=80)

USERS = [
    {
        "username": "t_pld",
        "char": {
            "name": "Aedan",
            "ilvl": 720,
            "currentExpansionId": "dt",
            "jobs": [{"id": "PLD"}, {"id": "WAR"}],
        },
        "slot": {
            "flexType": "tank",
            "jobsPool": ["PLD", "WAR"],
            "assignedJobsByProg": {"arcadion_lh": "PLD", "custom_skydeep": "PLD", "DSR": "PLD"},
            "statusByProg": {
                "arcadion_lh": "bench",
                "custom_skydeep": "bench",
                "DSR": "bench",
            },
        },
    },
    {
        "username": "t_drk",
        "char": {
            "name": "Brigid",
            "ilvl": 715,
            "currentExpansionId": "dt",
            "jobs": [{"id": "DRK"}, {"id": "GNB"}],
        },
        "slot": {
            "flexType": "tank",
            "jobsPool": ["DRK", "GNB"],
            "assignedJobsByProg": {"arcadion_lh": "DRK", "DSR": "DRK"},
            "statusByProg": {
                "arcadion_lh": "bench",
                "custom_skydeep": "bench",
                "DSR": "bench",
            },
        },
    },
    {
        "username": "t_whm",
        "char": {
            "name": "Caelan",
            "ilvl": 720,
            "currentExpansionId": "dt",
            "jobs": [{"id": "WHM"}, {"id": "SCH"}],
        },
        "slot": {
            "flexType": "healer",
            "jobsPool": ["WHM", "SCH"],
            "assignedJobsByProg": {"arcadion_lh": "WHM", "custom_skydeep": "WHM", "DSR": "WHM"},
            "statusByProg": {
                "arcadion_lh": "bench",
                "custom_skydeep": "bench",
                "DSR": "bench",
            },
        },
    },
    {
        "username": "t_ast",
        "char": {
            "name": "Daireann",
            "ilvl": 715,
            "currentExpansionId": "dt",
            "jobs": [{"id": "AST"}, {"id": "SGE"}],
        },
        "slot": {
            "flexType": "healer",
            "jobsPool": ["AST", "SGE"],
            "assignedJobsByProg": {"arcadion_lh": "AST", "DSR": "AST"},
            "statusByProg": {
                "arcadion_lh": "bench",
                "custom_skydeep": "bench",
                "DSR": "bench",
            },
        },
    },
    {
        "username": "t_mnk",
        "char": {
            "name": "Eilan",
            "ilvl": 720,
            "currentExpansionId": "dt",
            "jobs": [{"id": "MNK"}, {"id": "DRG"}],
        },
        "slot": {
            "flexType": "melee",
            "jobsPool": ["MNK", "DRG"],
            "assignedJobsByProg": {"arcadion_lh": "MNK", "custom_skydeep": "MNK", "DSR": "MNK"},
            "statusByProg": {
                "arcadion_lh": "bench",
                "custom_skydeep": "bench",
                "DSR": "bench",
            },
        },
    },
    {
        "username": "t_nin",
        "char": {
            "name": "Fiona",
            "ilvl": 715,
            "currentExpansionId": "dt",
            "jobs": [{"id": "NIN"}, {"id": "SAM"}, {"id": "RPR"}, {"id": "VPR"}],
        },
        "slot": {
            "flexType": "melee",
            "jobsPool": ["NIN", "SAM", "RPR", "VPR"],
            "assignedJobsByProg": {"arcadion_lh": "NIN", "DSR": "SAM"},
            "statusByProg": {
                "arcadion_lh": "bench",
                "custom_skydeep": "bench",
                "DSR": "bench",
            },
        },
    },
    {
        "username": "t_brd",
        "char": {
            "name": "Gareth",
            "ilvl": 720,
            "currentExpansionId": "dt",
            "jobs": [{"id": "BRD"}, {"id": "MCH"}, {"id": "DNC"}],
        },
        "slot": {
            "flexType": "ranged",
            "jobsPool": ["BRD", "MCH", "DNC"],
            "assignedJobsByProg": {"arcadion_lh": "BRD", "custom_skydeep": "BRD", "DSR": "BRD"},
            "statusByProg": {
                "arcadion_lh": "bench",
                "custom_skydeep": "bench",
                "DSR": "bench",
            },
        },
    },
    {
        "username": "t_blm",
        "char": {
            "name": "Hela",
            "ilvl": 715,
            "currentExpansionId": "dt",
            "jobs": [{"id": "BLM"}, {"id": "SMN"}, {"id": "RDM"}, {"id": "PCT"}],
        },
        "slot": {
            "flexType": "caster",
            "jobsPool": ["BLM", "SMN", "RDM", "PCT"],
            "assignedJobsByProg": {"arcadion_lh": "BLM", "DSR": "RDM"},
            "statusByProg": {
                "arcadion_lh": "bench",
                "custom_skydeep": "bench",
                "DSR": "bench",
            },
        },
    },
    # Banco fixo: caráter de reserva pra simular reservas
    {
        "username": "t_bench",
        "char": {
            "name": "Juno",
            "ilvl": 700,
            "currentExpansionId": "dt",
            "jobs": [{"id": "GNB"}, {"id": "SGE"}, {"id": "DNC"}],
        },
        "slot": {
            "flexType": "flex",
            "jobsPool": ["GNB", "SGE", "DNC"],
            "assignedJobsByProg": {},
            "statusByProg": {
                "arcadion_lh": "bench",
                "custom_skydeep": "bench",
                "DSR": "bench",
            },
        },
    },
    # Caso Fase P: EW-only → bloqueado em conteúdo DT, compatível em DSR (EW).
    {
        "username": "t_ew_only",
        "char": {
            "name": "Iorath",
            "ilvl": 660,
            "currentExpansionId": "ew",
            "jobs": [{"id": "WHM"}, {"id": "AST"}],
        },
        "slot": {
            "flexType": "healer",
            "jobsPool": ["WHM", "AST"],
            "assignedJobsByProg": {"arcadion_lh": "WHM", "DSR": "AST"},
            # active em ambos para testar: vai aparecer como "Disponíveis fora dos requisitos"
            # em arcadion_lh (DT) mas contar normalmente em DSR (EW).
            "statusByProg": {
                "arcadion_lh": "bench",
                "custom_skydeep": "bench",
                "DSR": "bench",
            },
        },
    },
    # Caso Fase P (Limited): BLU lvl 75 — passa em Lv ≤75, bloqueado em Lv ≥80.
    {
        "username": "t_blu_mid",
        "char": {
            "name": "Kael",
            "ilvl": 700,
            "currentExpansionId": "dt",
            "jobs": [{"id": "BLU", "level": 75}, {"id": "WHM"}],
        },
        "slot": {
            "flexType": "caster",
            "jobsPool": ["BLU", "WHM"],
            "assignedJobsByProg": {"blue_mage_raid": "BLU"},
            "statusByProg": {
                "blue_mage_raid": "bench",
                "arcadion_lh": "bench",
                "custom_skydeep": "bench",
                "DSR": "bench",
            },
        },
    },
]


def _slot_template(user_id: int, name: str, ilvl: int, jobs_pool: list, flex_type: str,
                   assigned_by_prog: dict, status_by_prog: dict) -> dict:
    """Monta um slot do roster compatível com o schema da Fase O.2.

    Identidade primária (name/ilvl/jobs) vem do character_json — slot guarda
    apenas o backup legacy e os campos por-prog (assignedJob, status, loot).
    """
    return {
        "id": f"slot_seed_{user_id}",
        "user_id": user_id,
        "name": name,
        "flexType": flex_type,
        "jobsPool": jobs_pool,
        "assignedJob": jobs_pool[0] if jobs_pool else None,
        "assignedJobsByProg": assigned_by_prog,
        "monthlySchedule": {},
        "statusByProg": status_by_prog,
        "ilvl": ilvl,
        "bis": False,
        "status": "active",
        "lootPreferences": {},
    }


def seed():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Static global (já existe — id=1 sempre na DB local atual)
    static_id = conn.execute(
        "SELECT id FROM statics WHERE invite_code = 'global'"
    ).fetchone()["id"]

    pwd_hash = generate_password_hash(SHARED_PASSWORD)
    created = []
    skipped = []

    # 1. Insere users + character_json
    for entry in USERS:
        username = entry["username"]
        if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            skipped.append(username)
            continue
        char_with_extras = {**entry["char"], "subscribedProgs": []}
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, character_json) VALUES (?, ?, ?)",
            (username, pwd_hash, json.dumps(char_with_extras, ensure_ascii=False)),
        )
        user_id = cur.lastrowid
        conn.execute(
            "INSERT INTO static_members (static_id, user_id, role) VALUES (?, ?, 'member')",
            (static_id, user_id),
        )
        conn.execute(
            "UPDATE users SET active_static_id = ? WHERE id = ?",
            (static_id, user_id),
        )
        created.append((username, user_id))

    if not created:
        conn.close()
        print(f"Nada a fazer. Skipped (já existiam): {skipped}")
        return

    # 2. Atualiza data_json.roster com os slots dos novos users
    row = conn.execute(
        "SELECT data_json FROM statics WHERE id = ?", (static_id,)
    ).fetchone()
    data = json.loads(row["data_json"] or "{}")
    roster = data.setdefault("roster", [])

    # Map username → user_id (apenas dos recém-criados)
    user_id_by_username = dict(created)

    for entry in USERS:
        username = entry["username"]
        if username not in user_id_by_username:
            continue
        user_id = user_id_by_username[username]
        # Já tem slot? (idempotência defensiva)
        if any(p.get("user_id") == user_id for p in roster):
            continue
        slot = _slot_template(
            user_id=user_id,
            name=entry["char"]["name"],
            ilvl=entry["char"]["ilvl"],
            jobs_pool=entry["slot"]["jobsPool"],
            flex_type=entry["slot"]["flexType"],
            assigned_by_prog=entry["slot"]["assignedJobsByProg"],
            status_by_prog=entry["slot"]["statusByProg"],
        )
        roster.append(slot)

    data["roster"] = roster
    conn.execute(
        "UPDATE statics SET data_json = ?, updated_at = datetime('now') WHERE id = ?",
        (json.dumps(data, ensure_ascii=False), static_id),
    )
    conn.commit()
    conn.close()

    print(f"Criados {len(created)} novos usuários:")
    for username, uid in created:
        print(f"  user_id={uid:>3}  username={username}  senha={SHARED_PASSWORD}")
    if skipped:
        print(f"Pulados (já existiam): {', '.join(skipped)}")


def reset():
    """Remove TODOS os usuários cujo username começa com `t_` + slots associados."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # Coleta user_ids dos t_*
    rows = conn.execute(
        "SELECT id, username FROM users WHERE username LIKE 't\\_%' ESCAPE '\\'"
    ).fetchall()
    user_ids = [r["id"] for r in rows]
    usernames = [r["username"] for r in rows]

    if not user_ids:
        print("Nenhum usuário de teste encontrado.")
        conn.close()
        return

    # Static global
    static_row = conn.execute(
        "SELECT id, data_json FROM statics WHERE invite_code = 'global'"
    ).fetchone()
    static_id = static_row["id"]
    data = json.loads(static_row["data_json"] or "{}")
    roster = data.get("roster") or []
    before = len(roster)
    data["roster"] = [p for p in roster if p.get("user_id") not in user_ids]
    after = len(data["roster"])

    placeholders = ",".join("?" * len(user_ids))
    conn.execute(f"DELETE FROM static_members WHERE user_id IN ({placeholders})", user_ids)
    conn.execute(f"DELETE FROM users WHERE id IN ({placeholders})", user_ids)
    conn.execute(
        "UPDATE statics SET data_json = ?, updated_at = datetime('now') WHERE id = ?",
        (json.dumps(data, ensure_ascii=False), static_id),
    )
    conn.commit()
    conn.close()

    print(f"Removidos {len(user_ids)} usuários: {usernames}")
    print(f"Slots removidos do roster: {before - after}")


if __name__ == "__main__":
    if "--reset" in sys.argv:
        reset()
    else:
        seed()
