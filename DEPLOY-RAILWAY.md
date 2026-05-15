# Deploy no Railway — Guia Passo a Passo

Este guia leva você do zero (conta criada, repo no GitHub) até a aplicação rodando online com domínio público e banco persistente.

> **Pré-requisitos:** conta no Railway criada, este repositório no GitHub (já está em `oscarothon/ffxiv-raid-planner`).

---

## ⚠️ Sobre persistência (leia antes de começar)

O projeto usa **SQLite** num arquivo (`data.db`). Em deploy o sistema de arquivos é efêmero — sem um **volume persistente**, o banco é apagado a cada redeploy ou reinício do container.

Railway oferece volumes a partir do plano **Hobby ($5/mês)**. O plano free trial tem $5 de crédito mensal que cobre os custos de um projeto pequeno, mas **volumes só funcionam em planos pagos**.

Se você não quer pagar agora:
- Pode testar o deploy sem volume — o app vai rodar, mas o banco será resetado a cada novo deploy.
- Em algum momento será necessário migrar para PostgreSQL (que o Railway oferece grátis como add-on). Isso fica como tarefa futura no `PLANNING.md`.

Este guia assume que você vai usar o **plano Hobby + volume**.

---

## Etapa 1 — Criar o projeto no Railway

1. Acesse https://railway.com/dashboard
2. Clique em **+ New Project** (canto superior direito)
3. Escolha **Deploy from GitHub repo**
4. Se for a primeira vez, autorize o Railway a acessar sua conta do GitHub
5. Selecione o repositório **`oscarothon/ffxiv-raid-planner`**
6. Railway começa o build automaticamente — **aguarde 1–2 min** até o deploy inicial terminar

> Esse primeiro deploy provavelmente vai rodar, mas o banco será criado dentro do container efêmero. Vamos consertar isso a seguir.

---

## Etapa 2 — Adicionar volume persistente para o SQLite

1. No dashboard do projeto, clique no service que foi criado (deve ter o nome do repo)
2. Vá para a aba **Settings**
3. Role até a seção **Volumes**
4. Clique em **+ New Volume**
5. Configure:
   - **Mount Path:** `/data`
   - **Size:** 1 GB (suficiente para o SQLite, pode ajustar depois)
6. Clique em **Add**

O Railway vai reiniciar o service. Você pode confirmar que o volume está montado clicando no service > aba **Settings** > seção **Volumes** — deve mostrar `/data` montado.

---

## Etapa 3 — Configurar variáveis de ambiente

Ainda no service, vá para a aba **Variables**. Adicione (botão **+ New Variable** para cada uma):

| Nome | Valor | Por quê |
|------|-------|---------|
| `SECRET_KEY` | Gere uma chave aleatória forte | Assina os cookies de sessão. **Não use o valor de dev.** |
| `DATABASE_PATH` | `/data/data.db` | Coloca o banco no volume persistente |
| `FLASK_ENV` | `production` | Habilita cookies `Secure` (HTTPS-only) |

### Como gerar uma SECRET_KEY forte

No seu terminal local:

```powershell
# PowerShell (Windows)
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Copie o output (algo como `xLR3...JKK4`) e cole como valor de `SECRET_KEY`.

Após salvar, o Railway vai redeployar automaticamente.

---

## Etapa 4 — Gerar domínio público

1. No service, abra a aba **Settings**
2. Role até a seção **Networking** > **Public Networking**
3. Clique em **Generate Domain**
4. O Railway cria um domínio tipo `ffxiv-raid-planner-production.up.railway.app`
5. Aguarde ~30s para o DNS propagar

**Teste:** abra o domínio gerado no navegador. Deve aparecer o modal de login do FFXIV Raid Planner.

---

## Etapa 5 — Primeiro registro & promoção a admin

1. Abra o domínio do Railway no navegador
2. Crie sua conta (clique em **Cadastrar**, escolha usuário e senha)
3. O backend automaticamente promove o **primeiro membro da static global** a `admin` — você vai entrar como admin direto
4. Clique em **Membros** no header para confirmar que aparece "Administrador" no badge dourado

Pronto — está no ar.

---

## Etapa 6 — Próximos deploys (automático)

Toda vez que você fizer `git push origin main`, o Railway detecta o push e refaz o deploy. O volume `/data` persiste, então **o banco e os dados não são perdidos**.

Para deploys de branches específicas (ex: testar `feature/fase-1b-sync-railway` antes de mergear), você pode:
1. Configurar **Preview Environments** em Settings > Environments
2. Criar um environment separado e apontar para a branch

---

## Troubleshooting

### O site abre mas dá 500 ao tentar logar
Provavelmente `SECRET_KEY` não foi setada. Vá em Variables e confirme. Sem ela, o Flask usa o fallback dev e cookies podem não funcionar.

### Os dados somem após cada deploy
O volume não está montado. Volte para Etapa 2 e confirme que `/data` está listado na seção Volumes. Confirme também que `DATABASE_PATH=/data/data.db` está em Variables.

### Vejo cookies sendo bloqueados
Verifique se está acessando via HTTPS (domínio do Railway). Em HTTP, o cookie com `Secure` é rejeitado. Se precisa testar em HTTP, remova temporariamente `FLASK_ENV=production`.

### "Application failed to respond"
Veja os logs do service (aba **Deployments** > clique no deploy mais recente > **View Logs**). Geralmente é erro de import ou crash no startup.

### Quero ver o banco diretamente
Use o CLI do Railway:
```powershell
npm install -g @railway/cli
railway login
railway link  # selecione o projeto
railway run python -c "import sqlite3; conn=sqlite3.connect('/data/data.db'); print(conn.execute('SELECT * FROM users').fetchall())"
```

---

## Quando migrar para PostgreSQL

Tarefas que vão se beneficiar de Postgres no futuro (resumido no `PLANNING.md`):
- Concorrência real (vários officers editando simultaneamente)
- Backups automáticos do Railway
- Queries mais complexas (joins, índices avançados)

Railway oferece PostgreSQL grátis como add-on. Quando chegar essa fase, basta:
1. Adicionar **+ New > Database > Add PostgreSQL** no projeto
2. Railway injeta `DATABASE_URL` no service automaticamente
3. Refatorar `db.py` para usar `psycopg2` em vez de `sqlite3`
4. Migrar dados via script

Esse refactor está fora do escopo da Fase 1B atual.
