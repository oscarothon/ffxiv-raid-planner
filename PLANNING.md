# Planejamento de Features — FFXIV Raid Planner

Stack: Vanilla JS + Flask + SQLite. Estado por static persistido como JSON blob em `statics.data_json`.

**Produção:** https://mhigos-raid-planner.up.railway.app (Railway, volume persistente em `/data`)

---

## Tabela Resumo

| # | Fase | Descrição | Status | Modelo |
|---|------|-----------|:------:|:------:|
| 0A | Limpeza | Remover emojis decorativos | ✅ | Sonnet |
| 0B | Limpeza | Remover aba "Estratégias & Macros" | ✅ | Sonnet |
| — | Bonus  | Ícones nativos do FFXIV no header e botões de ação | ✅ | Sonnet |
| 1A | Fundação | Sistema de cargos (Admin / Officer / Membro) | ✅ | Opus |
| 1B | Fundação | Consistência de dados entre contas (sync via polling com ETag) | ✅ | Opus |
| —  | Deploy   | Preparação para Railway (volume, env vars, guia) | ✅ | Opus |
| 2A | Feature | Agendar clicando na data + notificação no dashboard | ⏳ | Sonnet |
| 2B | Feature | Drag & drop na prioridade de loot | ⏳ | Sonnet |
| 3  | Polish | Redesign visual da lista de conteúdos | ⏳ | Sonnet |
| 4  | Admin | Gerenciamento de contas pelo administrador (kick/delete) | ⏳ | Opus |

Legenda: ✅ concluído · ⏳ pendente

---

## Fase 0 — Limpeza Rápida ✅

**Commit:** `07502da` em `main`

- **0A** Removidos emojis decorativos de títulos, abas, headers de painéis e textos de botões. Mantidos os emojis funcionais (🎲 🪙 ❌ de loot e ✔️ ⚠️ ❌ do calendário).
- **0B** Aba "Estratégias & Macros" deletada por completo (HTML + bindings JS + estado padrão + CSS).
- **Bonus** Substituição dos emojis do header e das ações do roster por ícones nativos do jogo (`log_out`, `system_configuration`, `sound_settings`, `free_company_chest`, `adventurer_plate`, `party_member`, `party_leader`, `exit_game`). Botões de ação do roster ficaram sem caixa — apenas a imagem com hover scale.

---

## Fase 1A — Sistema de Cargos ✅

**Branch:** `feature/fase-1a-sistema-de-cargos` · **Commit:** `b85aebc`

### Backend (`server/`)

- Coluna `role` em `static_members` (admin / officer / member) com migração idempotente em `db.py`
- Auto-bootstrap: o primeiro membro de cada static é promovido automaticamente a `admin`
- Helpers em `auth.py`: `get_user_role`, `role_at_least`, `require_role`
- `/api/me` e `/api/state` expõem `user_id` e `user_role`
- `GET  /api/statics/<id>/members` — lista membros com cargos (qualquer membro pode ver)
- `PUT  /api/statics/<id>/members/<uid>/role` — admin only, impede rebaixar último admin
- Validação por diff no `PUT /api/state`:
  - `staticName` → admin only
  - `activeProgs`, `scheduledProgs` → officer+
  - `lootPriorities` → officer+ pode reordenar; member apenas reflete sync (add/remove)
  - `roster` → officer+ livre; member só cria/edita/exclui o próprio slot (linkado por `user_id`)

### Frontend (`js/app.js`, `index.html`, `css/styles.css`)

- Variáveis globais: `currentUserId`, `currentUserRole`, `currentStaticId`
- Helpers `isAdmin()`, `isOfficer()`, `isOwnSlot(p)`, `canManageRoles()`, `canManageContent()`, `canEditPlayer(p)`, `canScheduleDate()`, etc.
- Modal "Membros" no header (admin) com select de cargo por membro
- Badge colorido de cargo no user-pill (dourado / azul / cinza)
- Renderização condicional dos botões de ação conforme o cargo
- Member sem slot vê "Crie seu Slot de Jogador"; com slot, o formulário some
- Member no próprio slot: Editar + Excluir (sem mover banco/titular)
- Calendário: células de outros ficam read-only; `<select>` de agendar dia fica `disabled` para non-officers
- Botões ▲▼ de reordenar prioridade de loot some para members
- Sistema de toast tematizado (CSS animado, fonte Cinzel) substitui todos os `alert()` do browser
- Enter nos campos de login/registro dispara o botão correspondente
- `saveState` detecta `403 forbidden_changes` e reverte a UI com toast

---

## Fase 1B — Consistência de Dados Entre Contas ✅

**Branch:** `feature/fase-1b-sync-railway` · **Commit:** `25f5462`

### Backend
- `GET /api/state` retorna ETag (`sha1` truncado de `static_id:updated_at:user_id:role`)
- ETag inclui `role` para invalidar cache quando admin altera o cargo de um membro (bug detectado em teste)
- Suporte a `If-None-Match` com resposta `304` + `Cache-Control: no-cache, must-revalidate`
- `PUT /api/state` retorna novo ETag no body — frontend rastreia sem refazer GET

### Frontend
- Polling a cada 30s consulta `/api/state` com `If-None-Match`
- Hidrate seletivo preserva aba ativa, prog inspecionado, foco em input, cursor e scroll
- Pausa automática quando a aba do navegador está oculta (`document.hidden`)
- Dispara polling imediato ao voltar para a aba (`visibilitychange`)
- Janela quieta de 2s após `saveState()` evita reload em cima de edição
- Toast "Dados atualizados" notifica recepção de mudanças de outro membro
- `saveState` armazena novo ETag retornado pelo PUT para evitar reload desnecessário

### Débito técnico aceito
- Conflitos de escrita simultânea: ainda é last-write-wins (aceitável para o tamanho real do uso)
- `theme` e `sfx` ainda são per-static (idealmente seriam per-user) — pequeno débito
- SSE não implementado — polling de 30s é suficiente para o caso de uso atual

---

## Deploy — Preparação para Railway ✅

**Arquivos adicionados:**
- `railway.json` — configura builder NIXPACKS e startCommand do gunicorn
- `DEPLOY-RAILWAY.md` — guia passo a passo (volume `/data`, env vars, domínio público, troubleshooting)
- `server/db.py` cria automaticamente o diretório do banco se não existir (necessário para `/data/data.db` no volume)

**Variáveis de ambiente esperadas em produção:**
- `SECRET_KEY` — chave forte para assinar cookies (gerar com `secrets.token_urlsafe(48)`)
- `DATABASE_PATH=/data/data.db` — apontando para o volume persistente
- `FLASK_ENV=production` — ativa cookies `Secure` (HTTPS-only)

---

## Fase 2A — Calendário: Agendar Clicando na Data ⏳

**Objetivo:** substituir o dropdown por coluna do calendário por um modal aberto ao clicar na data.

**Plano:**
- Remover seletor `sel-day-target-prog` do `<thead>` do calendário
- Tornar a célula de data clicável (officer+); abre modal com lista de progs ativos + opção "Limpar agendamento"
- Atualiza `state.scheduledProgs[dateKey]` e dispara `saveState()`
- **Notificação no dashboard:** ao criar/alterar agendamento, registrar em `state.pendingNotifications: [{date, progId, createdBy, seen: false}]`. Renderizar banner persistente no topo do dashboard avisando players a marcarem disponibilidade. Banner some ao clicar "Marcar disponibilidade" ou "Dispensar".

---

## Fase 2B — Drag & Drop na Prioridade de Loot ⏳

**Objetivo:** substituir botões ▲▼ por arrastar e soltar.

**Plano:**
- Em `renderFightSummaryAndPriorities`, adicionar `draggable="true"` aos `<div class="priority-row">` (officer+ apenas)
- Eventos HTML5: `dragstart`, `dragover`, `drop`, `dragend`
- Indicador visual: cursor `grab/grabbing`, highlight do item arrastado e do slot de destino
- Ao soltar, reordena `state.lootPriorities[progId]` e chama `saveState()`
- Manter os botões ▲▼ como fallback acessível? Decidir.

---

## Fase 3 — Redesign Visual da Lista de Conteúdos ⏳

**Objetivo:** transformar os chips simples em cards animados com identidade visual mais forte.

**Plano:**
- Em `renderActiveProgsPanel`, substituir chips por cards contendo:
  - Ícone/imagem do conteúdo
  - Nome + tier + expansão
  - Indicador de progresso ou status (placeholder por enquanto)
  - Botão de remover integrado (não flutuante)
- CSS: `@keyframes fadeInUp` na entrada, `transition` no hover (elevação/brilho)
- Seletor "Adicionar conteúdo" vira um botão `+` que expande uma grade visual de cards disponíveis

---

## Fase 4 — Gerenciamento de Contas pelo Administrador ⏳

**Novo escopo:** admin precisa poder remover contas/membros indesejados da static.

**Plano:**

### Nível 1 — Kick (remover do static)
- Backend: `DELETE /api/statics/<id>/members/<uid>` — admin only
  - Impede remover último admin
  - Decisão pendente: orfanizar slot do roster (`user_id → null`) ou removê-lo. Recomendo orfanizar para preservar histórico.
- Frontend: botão "Remover" ao lado de cada membro no modal de gerenciamento
- Modal de confirmação tematizado (substituindo `confirm()` do browser)
- Toast de sucesso/erro

### Nível 2 — Deletar conta inteira (opcional)
- Backend: `DELETE /api/users/<id>` — admin only, **operação destrutiva**
  - Remove o usuário de todas as statics
  - Cascade via `ON DELETE CASCADE` já presente
  - Orfanizar slots do roster que tinham o `user_id` removido
- Frontend: ação separada com confirmação reforçada (digitar nome do usuário, por exemplo)

**Considerações:**
- Membro deletando própria conta (right-to-be-forgotten) é uma extensão futura
- Auditoria: opcional, registrar quem removeu quem

---

## Dependências entre Fases

```
0A, 0B (paralelas) ✅
   │
   ▼
1A ✅ ──→ 1B ✅ ──→ Deploy Railway ✅
   │
   ├──→ 4 ⏳ (depende de 1A para roles e modal de membros)
   │
   ├──→ 2A ⏳ (depende de 1A para permissões de agendar)
   │
   └──→ 2B ⏳ (depende de 1A para permissão officer+)
                │
                ▼
                3 ⏳ (independente, pode rodar a qualquer momento)
```

---

## Estado Atual

- **Branch ativa:** `main` (Fases 0, 1A e 1B já mergeadas)
- **Produção:** https://mhigos-raid-planner.up.railway.app no ar com volume persistente
- **Próximo passo recomendado:** escolher entre Fase 4 (admin deletar contas), 2A (calendário com clique), 2B (drag & drop loot) ou 3 (redesign cards)
