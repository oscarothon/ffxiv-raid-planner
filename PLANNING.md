# Planejamento de Features — FFXIV Raid Planner

Stack: Vanilla JS + Flask + SQLite. Estado por static persistido como JSON blob em `statics.data_json`.

---

## Tabela Resumo

| # | Fase | Descrição | Status | Modelo |
|---|------|-----------|:------:|:------:|
| 0A | Limpeza | Remover emojis decorativos | ✅ | Sonnet |
| 0B | Limpeza | Remover aba "Estratégias & Macros" | ✅ | Sonnet |
| — | Bonus  | Ícones nativos do FFXIV no header e botões de ação | ✅ | Sonnet |
| 1A | Fundação | Sistema de cargos (Admin / Officer / Membro) | ✅ | Opus |
| 1B | Fundação | Consistência de dados entre contas (sync em tempo real) | ⏳ | Opus |
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

## Fase 1B — Consistência de Dados Entre Contas ⏳

**Objetivo:** mudanças feitas por um usuário ficam visíveis para outros sem refresh manual.

**Plano recomendado (Polling + ETag — baixo custo):**
- Backend: `GET /api/state` retorna cabeçalho `ETag` baseado em `updated_at` do static. Aceita `If-None-Match` e retorna `304` quando inalterado.
- Frontend: timer a cada ~30s faz GET com `If-None-Match`. Se `304`, ignora; se mudou, recarrega estado preservando seleções locais (aba ativa, prog inspecionado).

**Alternativa (SSE — mais complexo, ~1s de latência):**
- Endpoint `/api/state/stream` com `text/event-stream` envia push quando `updated_at` muda
- Requer ajustes de threading no gunicorn em produção

**Considerações:**
- Conflitos de escrita simultânea: hoje é last-write-wins. Pode ser aceitável para o uso real (poucos editores ao mesmo tempo).
- `theme` e `sfx` idealmente seriam per-user, não no blob compartilhado — pequeno débito técnico.

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
1A ✅ ──→ 1B ⏳ (próxima)
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

- **Branch ativa:** `feature/fase-1a-sistema-de-cargos`
- **Último commit:** `b85aebc` (sistema de cargos completo)
- **PR a abrir:** https://github.com/oscarothon/ffxiv-raid-planner/pull/new/feature/fase-1a-sistema-de-cargos
- **Próximo passo recomendado:** abrir PR e mergear na `main`, depois iniciar Fase 1B em nova branch
