# FFXIV Raid Planner — guia para o Claude Code

## Sobre o projeto

- Backend Flask 3 + SQLite (sem ORM, `sqlite3.Row`) em `server/`.
- Frontend vanilla JS sem bundler — `index.html` carrega `js/data.js`, `js/api.js`, `js/app.js` via `<script>`.
- Integração com Bot API do Telegram em `server/telegram.py` (notificações e webhook).
- Deploy em Railway/Render via gunicorn (ver `Procfile` / `render.yaml`).

## Comandos de teste — **rode sempre antes de declarar uma feature pronta**

| Suite | Comando |
|---|---|
| Backend pytest | `.venv/bin/pytest tests/backend/ -q` |
| Frontend vitest | `./node_modules/.bin/vitest run` |
| Playwright E2E | `./node_modules/.bin/playwright test` |
| Tudo de uma vez | `.venv/bin/pytest tests/backend/ -q && ./node_modules/.bin/vitest run && ./node_modules/.bin/playwright test` |

Dependências de dev: `pip install -r requirements-dev.txt` para Python; `npm install --cache /tmp/npm-cache-ffxiv` para JS (o `--cache` evita o erro de permissão em `~/.npm`). Browsers do Playwright: `./node_modules/.bin/playwright install chromium`.

## Regras para implementação de novas features

**Escreva testes sempre que possível.** O projeto tem cobertura ampla (pytest backend, vitest frontend, Playwright E2E) e a expectativa é que cada feature nova ou bug fix venha acompanhado de testes que cubram o novo comportamento:

1. **Rota nova no backend** → adicionar testes em `tests/backend/test_<modulo>.py` exercitando o caminho feliz + autenticação + cada branch de validação. Use as fixtures de `tests/conftest.py` (`client`, `api`, `admin_user`, `member_user`).
2. **Helper puro no backend** (sem Flask) → teste unitário direto. Use `app_module` para garantir env isolada e import do módulo.
3. **Lógica nova em `js/app.js` que dê para isolar** → vitest+jsdom em `tests/frontend/app.test.js`. Para chamar helpers `const`-declarados, eles já são auto-içados em `window` pelo `tests/frontend/setup.js`.
4. **Novo endpoint usado pelo cliente** → adicionar caso em `tests/frontend/api.test.js`.
5. **Mudança em fluxo de usuário** (login, agendamento, presença, claim) → atualizar/adicionar spec em `tests/e2e/`.

Se a feature for *puramente* visual (CSS, layout) e não der para escrever um teste razoável, está OK pular — mas registre na descrição da PR que não há cobertura automatizada.

## Restrições importantes

- **Não toque em `data.db`** durante desenvolvimento — as fixtures de teste usam SQLite isolado via `DATABASE_PATH`.
- **Não use `git add -A` / `git add .`** — sempre stage arquivos específicos para evitar incluir `data.db`, `.tmp-e2e.db`, `node_modules/`, etc.
- **Co-author obrigatório**: todo commit e corpo de PR criado pelo Claude tem `Co-Authored-By: Claude <noreply@anthropic.com>` (regra global da máquina).
- O timezone do app é `America/Manaus` (GMT-4) via `APP_TZ_OFFSET_HOURS` — para testes baseados em data, **sempre** use `freezegun` em vez de depender do relógio.

## Padrões do código

- Tudo em português brasileiro: nomes de testes, mensagens de erro do usuário, docstrings curtas. Comentários técnicos podem ser em inglês quando forem termos consagrados (ETag, race condition, etc.).
- Backend: `from .db import ...`, `from .auth import ...`, `from . import telegram as tg` (não importe `send_group_message` diretamente — facilita o mock em testes).
- Frontend: nada de bundler ou módulos ES — mantenha tudo IIFE/globais compatíveis com `<script>` tags.

## Estrutura de testes (referência rápida)

```
tests/
├── conftest.py            # fixtures compartilhadas: app_module, app, client, api, admin_user, member_user
├── backend/
│   ├── test_auth.py
│   ├── test_business_logic.py
│   ├── test_character.py
│   ├── test_db.py
│   ├── test_smoke.py
│   ├── test_state.py
│   ├── test_statics.py
│   ├── test_telegram.py
│   └── test_telegram_integration.py
├── frontend/
│   ├── setup.js           # loadScripts(), installFetchMock(), fetchResponse()
│   ├── api.test.js
│   ├── app.test.js
│   ├── data.test.js
│   └── smoke.test.js
└── e2e/
    ├── global-setup.js
    ├── helpers.js
    ├── auth.spec.js
    ├── pending-approval.spec.js
    ├── raid-flow.spec.js
    └── etag-polling.spec.js
```
