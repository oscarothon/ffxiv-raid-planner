# FFXIV Raid Planner — Little Ala Mhigos

Planejador premium de Static do Final Fantasy XIV com gerenciamento de roster, agenda, equipamentos, prioridade de loot e estratégias. Backend Flask + SQLite com autenticação por sessão e dados compartilhados entre todos os membros da static.

## Como rodar localmente

### 1. Instalar dependências

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows PowerShell
# ou: source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
```

### 2. Iniciar o servidor

```bash
python -m server.app
```

O servidor sobe em `http://127.0.0.1:5000` e cria automaticamente o arquivo `data.db` na raiz do projeto na primeira execução.

### 3. Acessar

Abra o navegador em `http://127.0.0.1:5000` (não use `file://` — o backend não responde nesse modo).

## Fluxo de Uso

1. **Cadastrar conta** — usuário (3–32 chars) + senha (≥6 chars)
2. **Criar uma Static** — você recebe um código de convite (ex: `aBc12xYz`)
3. **Compartilhar o código** com seu grupo — todos que entrarem com esse código verão e editarão os mesmos dados
4. **Editar** — todas as mudanças são salvas automaticamente no servidor (debounce de 400ms)

## Variáveis de Ambiente

| Variável         | Padrão                  | Descrição                                          |
|------------------|-------------------------|----------------------------------------------------|
| `SECRET_KEY`     | `dev-only-key-...`      | Chave para assinar cookies de sessão. **Mude em prod!** |
| `DATABASE_PATH`  | `./data.db`             | Caminho do arquivo SQLite                          |
| `FLASK_ENV`      | —                       | `production` ativa cookies Secure (HTTPS only)     |
| `PORT`           | `5000`                  | Porta do servidor                                  |

## Deploy no Render (recomendado)

1. Faça push do repositório para o GitHub
2. Em [render.com](https://render.com) → New Web Service → conecte o repositório
3. O Render lê o `render.yaml` automaticamente:
   - Provisiona um disco persistente de 1GB para o SQLite
   - Gera um `SECRET_KEY` único
   - Faz deploy do gunicorn
4. Acesse a URL pública gerada (algo como `https://ffxiv-raid-planner.onrender.com`)

> ⚠️ **Nota:** O plano gratuito do Render hiberna após 15 min sem tráfego. A primeira request demora ~30s. Para evitar, use UptimeRobot pingando a URL.

## Deploy no Railway

1. `railway init` no diretório do projeto
2. Adicione um volume persistente em `/var/data`
3. Configure as envs:
   - `SECRET_KEY` → valor aleatório
   - `DATABASE_PATH=/var/data/data.db`
4. `railway up`

## Deploy no Fly.io

```bash
fly launch                          # detecta Python, gera fly.toml
fly volumes create sqlite_data --size 1
# edite fly.toml para mount /var/data e env DATABASE_PATH
fly deploy
```

## Estrutura

```
.
├── index.html, css/, js/        ← Frontend estático servido pelo Flask
├── server/
│   ├── app.py                   ← Endpoints REST + bootstrap
│   ├── db.py                    ← Schema SQLite
│   └── auth.py                  ← Sessões e password hashing
├── requirements.txt
├── Procfile, render.yaml        ← Configs de deploy
└── data.db                      ← Banco SQLite (gerado, ignorado pelo git)
```

## API

| Método | Rota                       | Auth | Descrição                                |
|--------|----------------------------|------|------------------------------------------|
| POST   | `/api/register`            | —    | Cadastra usuário + faz login             |
| POST   | `/api/login`               | —    | Login                                    |
| POST   | `/api/logout`              | —    | Limpa sessão                             |
| GET    | `/api/me`                  | ✓    | Dados do usuário atual                   |
| POST   | `/api/statics`             | ✓    | Cria static (gera código de convite)     |
| POST   | `/api/statics/join`        | ✓    | Entra em static via código de convite    |
| GET    | `/api/statics/mine`        | ✓    | Lista statics que o usuário participa    |
| POST   | `/api/statics/switch`      | ✓    | Troca a static ativa                     |
| GET    | `/api/state`               | ✓    | Lê o blob JSON da static ativa           |
| PUT    | `/api/state`               | ✓    | Salva o blob JSON da static ativa        |

Senhas armazenadas com `werkzeug.security.generate_password_hash` (PBKDF2). Sessões são cookies HTTP-only assinados via `SECRET_KEY`.
