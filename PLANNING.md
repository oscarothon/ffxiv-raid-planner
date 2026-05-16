# Planejamento de Features — FFXIV Raid Planner

Stack: Vanilla JS + Flask + SQLite. Estado por static persistido como JSON blob em `statics.data_json`.

**Produção:** https://mhigos-raid-planner.up.railway.app (Railway, volume persistente em `/data`)

---

## Tabela Resumo

| # | Fase | Descrição | Status | Modelo |
|---|------|-----------|:------:|:------:|
| 0A | Limpeza | Remover emojis decorativos | ✅ | Sonnet |
| 0B | Limpeza | Remover aba "Estratégias & Macros" | ✅ | Sonnet |
| —  | Bonus   | Ícones nativos do FFXIV no header e botões de ação | ✅ | Sonnet |
| 1A | Fundação | Sistema de cargos (Admin / Officer / Membro) | ✅ | Opus |
| 1B | Fundação | Consistência de dados entre contas (sync via polling com ETag) | ✅ | Opus |
| —  | Deploy   | Preparação para Railway (volume, env vars, guia) | ✅ | Opus |
| 4  | Admin    | Admin exclui contas (delete permanente + orfaniza slot) | ✅ | Opus |
| 5  | Bugfixes | Correções pontuais (tooltip, layout do slot, atualização silenciosa) | ✅ | Sonnet |
| 6  | Limpeza  | Remover botão e fluxo "Compartilhar / Dados" | ✅ | Sonnet |
| 2A | Feature  | Agendar clicando na data + notificação no dashboard | ✅ | Sonnet |
| 2B | Feature  | Drag & drop na prioridade de loot | ⏳ | Sonnet |
| 7  | Tema     | Consertar botão "Tema" + adicionar tema "Warrior of Darkness" (roxo escuro) | ✅ | Sonnet |
| 8  | Conteúdo | Tipos de conteúdo customizáveis (party sizes 8/4/dinâmico + tipos novos) | ⏳ | Opus |
| 9  | Auth     | Cadastro com aprovação por officer/admin (timeout 24h) | ⏳ | Opus |
| 3  | Polish   | Redesign visual da lista de conteúdos (cards animados) | ⏳ | Sonnet |
| 10 | Mobile   | Responsividade completa (mobile, tablet, ultrawide) | ⏳ | Sonnet |

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
- ETag inclui `role` para invalidar cache quando admin altera o cargo de um membro
- Suporte a `If-None-Match` com resposta `304` + `Cache-Control: no-cache, must-revalidate`
- `PUT /api/state` retorna novo ETag no body — frontend rastreia sem refazer GET

### Frontend
- Polling consulta `/api/state` com `If-None-Match` (intervalo 15s após Fase 4)
- Hidrate seletivo preserva aba ativa, prog inspecionado, foco em input, cursor e scroll
- Pausa automática quando a aba do navegador está oculta (`document.hidden`)
- Dispara polling imediato em `visibilitychange` e `window.focus` (após Fase 4)
- Janela quieta de 2s após `saveState()` evita reload em cima de edição
- Toast "Dados atualizados" notifica recepção de mudanças de outro membro

### Débito técnico aceito
- Conflitos de escrita simultânea: ainda é last-write-wins (aceitável para o tamanho real do uso)
- `theme` e `sfx` ainda são per-static (idealmente seriam per-user) — pequeno débito
- SSE não implementado — polling é suficiente para o caso de uso atual

---

## Deploy — Preparação para Railway ✅

**Arquivos:** `railway.json`, `DEPLOY-RAILWAY.md`, ajuste em `server/db.py` para criar o diretório do banco.

**Variáveis de ambiente em produção:** `SECRET_KEY`, `DATABASE_PATH=/data/data.db`, `FLASK_ENV=production`.

---

## Fase 4 — Gerenciamento de Contas pelo Administrador ✅

**Branch:** `feature/fase-4-admin-gerenciar-contas` · **Commit:** `843f5e7`

### Backend
- `DELETE /api/statics/<id>/members/<uid>` deleta a conta inteira (`users` row). Cascade automático limpa `static_members`. Orfaniza o slot do roster vinculado (`user_id → null`).
- Bloqueios: admin não pode excluir a própria conta; não pode excluir o último admin.

### Frontend
- Botão de excluir (ícone `exit_game.png`) ao lado de cada membro no modal admin. Desabilitado para o próprio admin e para o último admin.
- Modal de confirmação tematizado **genérico** (`showConfirm({title, message, detail, danger, ...})`) com z-index 1500 para sobrepor outros modais.
- Substitui `confirm()` do browser também em "Excluir Jogador" e "Limpar Todos".
- Polling reage a `401 unauthorized` e `403 not_a_member` chamando `handleKickFromStatic`, que faz logout e volta para login.
- Polling: intervalo 15s + dispara em `window.focus` (mais responsivo).

### Decisão de design
- Sem "ban list" — conta apagada permanentemente; usuário pode se re-cadastrar.
- O slot do roster fica orfão, preservando histórico no planner.

---

## Fase 5 — Bugfixes ✅

**Objetivo:** correções pontuais reportadas em produção.

### B1 — Título do bracelete cortado
- Sintoma: na aba Equipamentos, o label "Braceletes" (ou similar) não cabe na linha do slot e fica truncado.
- Investigação: olhar o CSS de `.gear-row-slotname` e o grid do `.gear-slot-row`. Provavelmente flex/grid com `min-width` ou `overflow:hidden` apertado demais.
- Fix: ajustar largura mínima ou permitir wrap para 2 linhas.

### B2 — Tooltip "Emperor's New" indesejada
- Sintoma: hover nos slots de equipamento mostra tooltip nativa do browser com o `title` (ex: "The Emperor's New Bracelet").
- Causa: os elementos `.gear-row-icon-wrap` e `.gear-row-slotname` têm atributo `title` setado para `slot.itemName || slot.name` em `renderEquipmentPanel`.
- Fix: remover o `title` desses elementos. Não substituir por nada — não deve aparecer nenhuma tooltip ao passar o mouse.

### B3 — Slot novo e datas do calendário não atualizam em tempo real (silenciosamente)
- Sintoma: outro usuário cria um slot ou marca datas, mas o usuário atual só vê após F5.
- Diagnóstico provável: o polling funciona, mas o `applyRemoteState` está vinculado a um toast obrigatório — então pode estar sendo "engolido" em algum caso. Ou o `lastStateETag` não está sendo invalidado para mudanças de `data_json` sem mudança de role.
- Fix:
  - Confirmar que o polling realmente detecta mudanças em `data_json` (testar via curl + delay).
  - Remover o toast "Dados atualizados" quando a única mudança for em `roster` (slot/dates) — atualização silenciosa.
  - Manter o toast só para mudanças de cargo, conteúdo agendado e estrutura do static.

**Modelo:** Sonnet.

---

## Fase 6 — Remover Botão "Compartilhar / Dados" ⏳

**Objetivo:** simplificar o header retirando o fluxo de export/import JSON, agora coberto pelo backend.

**Plano:**
- Remover do `index.html`: botão `btn-export-import`, modal `modal-share` inteiro.
- Remover do `js/app.js`: bindings de `btn-export-import`, `btn-copy-export`, `btn-save-import`, `btn-show-export`, `btn-show-import` e referências relacionadas.
- Remover do `css/styles.css`: estilos exclusivos do modal-share, se houver.

**Modelo:** Sonnet.

---

## Fase 2A — Calendário: Agendar Clicando na Data ⏳

**Objetivo:** substituir o dropdown por coluna do calendário por um modal aberto ao clicar na data.

**Plano:**
- Remover seletor `sel-day-target-prog` do `<thead>` do calendário.
- Tornar a célula de data clicável (officer+); abre modal com lista de progs ativos + opção "Limpar agendamento".
- Atualiza `state.scheduledProgs[dateKey]` e dispara `saveState()`.
- **Notificação no dashboard:** ao criar/alterar agendamento, registrar em `state.pendingNotifications: [{date, progId, createdBy, seen: false}]`. Renderizar banner persistente no topo do dashboard avisando players a marcarem disponibilidade. Banner some ao clicar "Marcar disponibilidade" ou "Dispensar".

**Modelo:** Sonnet.

---

## Fase 2B — Drag & Drop na Prioridade de Loot ⏳

**Objetivo:** substituir botões ▲▼ por arrastar e soltar.

**Plano:**
- Em `renderFightSummaryAndPriorities`, adicionar `draggable="true"` aos `<div class="priority-row">` (officer+ apenas).
- Eventos HTML5: `dragstart`, `dragover`, `drop`, `dragend`.
- Indicador visual: cursor `grab/grabbing`, highlight do item arrastado e do slot de destino.
- Ao soltar, reordena `state.lootPriorities[progId]` e chama `saveState()`.
- Decidir se mantém os botões ▲▼ como fallback acessível ou substitui completamente.

**Modelo:** Sonnet.

---

## Fase 7 — Botão Tema + Tema "Warrior of Darkness" ⏳

**Objetivo:** consertar o botão Tema que hoje não tem efeito visível e adicionar um terceiro tema sombrio inspirado no Warrior of Darkness (paleta roxa escura).

**Plano:**
- Auditar `applyTheme()` em `js/app.js` e o handler de `btn-theme-toggle` — confirmar que `document.body.classList.toggle('theme-classic')` está realmente alterando CSS.
- Auditar `css/styles.css` em busca da classe `.theme-classic` — pode estar incompleta ou sobrescrita.
- Definir paleta "Warrior of Darkness": fundo `#0d0420`, painéis `#1a0a35`, borda `#7c3aed`, accent `#a855f7`, texto principal claro com leve violeta, gold-bright trocado por um lavanda saturado.
- Adicionar classe `.theme-darkness` com sobrescrita das CSS variables.
- Mudar o botão Tema para alternar entre 3 estados (cycle): `dark` → `classic` → `darkness` → `dark`. Mostrar o nome do tema atual no botão.
- Persistir a escolha em `state.theme` (já é per-static; aceitar débito por enquanto).

**Modelo:** Sonnet.

---

## Fase 8 — Tipos de Conteúdo Customizáveis ⏳

**Objetivo:** sair da lista hardcoded de raids/ultimates e permitir que admin/officer crie tipos de conteúdo arbitrários com diferentes tamanhos de party.

**Plano:**

### Modelo de dados
Adicionar `state.customContents: []` ao estado da static. Cada item:
```json
{
  "id": "criterion_skydeep",
  "name": "Skydeep Cenote (Criterion)",
  "category": "criterion",       // raid | ultimate | criterion | relic | custom | ...
  "expansion": "Dawntrail",
  "partySize": 4,                // 1..8 ou "dynamic"
  "minPlayers": 1,               // só se partySize === "dynamic"
  "maxPlayers": 8,               // só se partySize === "dynamic"
  "iconUrl": "assets/icons/..."  // opcional
}
```

### Backend (`server/app.py`)
- Validação no `PUT /api/state` para `customContents`: admin/officer pode mexer; member não.
- `_validate_state_diff` ganha entrada para essa chave.

### Frontend (`js/app.js`, `js/data.js`)
- `getProgObj(progId)` busca primeiro nos hardcoded (`FFXIV_RAIDS`, `FFXIV_ULTIMATES`) e depois em `state.customContents`.
- Em `renderActiveProgsPanel`, o dropdown "Selecionar Conteúdo" inclui os customs do mesmo `category` selecionado.
- Limite de Party Principal deixa de ser hardcoded em `8` — vira `getPartySize(progId)` que retorna o limite do conteúdo (8 para raid/ultimate, 4 para light party, dinâmico para custom).
- Onde o número 8 está hardcoded (vários lugares em `renderRosterTables`, `renderDashboardVisualizer`, validação de "party cheia"), substituir por `getPartySize()`.
- O `renderDashboardVisualizer` renderiza N slots em vez de 8 fixos.

### UI nova
- Botão "Configurações da Static" (admin/officer) ou ampliar o modal Membros para incluir uma aba "Conteúdos".
- Formulário para criar tipo: nome, categoria, expansão, tamanho de party (radio: 8 Full / 4 Light / Dinâmico), min/max players (se dinâmico), upload ou URL de ícone.
- Lista de conteúdos customizados com botão remover.

### Compatibilidade
- Conteúdos hardcoded continuam funcionando como Full Party (8).
- Estados antigos sem `customContents` carregam vazio.

**Modelo:** Opus (refator amplo, tocam muitos pontos do frontend).

---

## Fase 9 — Cadastro com Aprovação ⏳

**Objetivo:** evitar que qualquer pessoa com o link entre direto na static — cadastro vira solicitação que officer/admin precisa aprovar. Solicitações expiram em 24h.

### Modelo de dados
Nova tabela:
```sql
CREATE TABLE pending_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    requested_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Backend (`server/app.py`)
- `/api/register` insere em `pending_registrations` em vez de em `users`. Não cria sessão. Retorna status "pendente".
- `/api/login`: checa `pending_registrations` antes — se username está lá, retorna "Sua conta ainda aguarda aprovação."
- `GET /api/pending` (officer+): lista solicitações pendentes (`username`, `requested_at`, idade em horas).
- `POST /api/pending/<id>/approve` (officer+):
  - Move a linha de `pending_registrations` para `users` (mesma password_hash, novo user_id).
  - Anexa à static global como `member`.
- `POST /api/pending/<id>/reject` (officer+): apaga a linha de `pending_registrations`.
- Cleanup: antes de cada `GET /api/pending`, deletar registros com `requested_at < now() - 24 hours` (auto-expiração sem cron job).
- Bootstrap: se a static global está vazia (sem nenhum admin), o primeiro `register` é auto-aprovado (cai direto em `users` como admin). Isso preserva a UX inicial.

### Frontend (`js/app.js`, `index.html`)
- Tela de cadastro: ao submeter, mostra mensagem "Solicitação enviada. Aguarde aprovação de um officer/admin." e volta para a tela de login (não cria sessão).
- Modal Membros (officer+) ganha uma aba ou seção "Solicitações Pendentes" com lista + botões Aprovar/Rejeitar.
- Toast notifica admin/officer quando há solicitação nova (opcional: polling separado ou usar o já existente para também checar pending).

**Modelo:** Opus (auth flow + segurança + cleanup automático).

---

## Fase 3 — Redesign Visual da Lista de Conteúdos ⏳

**Objetivo:** transformar os chips simples em cards animados com identidade visual mais forte.

**Plano:**
- Em `renderActiveProgsPanel`, substituir chips por cards contendo:
  - Ícone/imagem do conteúdo (incluindo customs criados na Fase 8)
  - Nome + tier + expansão
  - Indicador de progresso ou status (placeholder por enquanto)
  - Botão de remover integrado (não flutuante)
- CSS: `@keyframes fadeInUp` na entrada, `transition` no hover (elevação/brilho).
- Seletor "Adicionar conteúdo" vira um botão `+` que expande uma grade visual de cards disponíveis.

**Modelo:** Sonnet. Pode depender da Fase 8 para incluir ícones de customs.

---

## Fase 10 — Responsividade Mobile ⏳

**Objetivo:** o site funcionar bem em telas pequenas (celular) e médias (tablet), mantendo a estética FFXIV.

**Plano:**
- Auditar o CSS atual em busca de larguras fixas e `min-width` que estouram em mobile.
- Adicionar breakpoints: `768px` (tablet) e `480px` (mobile).
- Header: empilhar logo e controles verticalmente em mobile; reduzir padding.
- Tabs principais: virar scroll horizontal ou dropdown em mobile.
- Tabela do roster: alterna para layout em cards (1 jogador por card) em mobile.
- Tabela do calendário: ativar scroll horizontal natural; primeira coluna fixa via `position: sticky`.
- Modais: usar `100vw - 24px` em mobile, com padding reduzido.
- Botões: tamanho mínimo 44×44px para target touch.
- Fontes: escalar para `clamp(0.85rem, 2vw, 1rem)` onde fizer sentido.
- Testar em DevTools nos presets iPhone 12, iPhone SE e Galaxy S20.

**Modelo:** Sonnet (CSS extenso, sem mudança de lógica).

---

## Dependências entre Fases

```
0A, 0B (paralelas) ✅
   │
   ▼
1A ✅ ──→ 1B ✅ ──→ Deploy Railway ✅ ──→ 4 ✅
   │
   ├──→ 5 ⏳ (bugfixes — independente, prioritário)
   ├──→ 6 ⏳ (remover Compartilhar/Dados — quick win)
   ├──→ 7 ⏳ (botão Tema + dark mode)
   ├──→ 2A ⏳ (calendário com clique + notif)
   ├──→ 2B ⏳ (drag & drop loot)
   ├──→ 8 ⏳ ──→ 3 ⏳ (tipos customizáveis ⇒ redesign cards)
   ├──→ 9 ⏳ (cadastro com aprovação — auth)
   └──→ 10 ⏳ (responsividade — por último para cobrir tudo que tem)
```

---

## Sugestão de ordem de execução

1. **Fase 5 (Bugfixes)** — quick wins, melhora UX imediatamente
2. **Fase 6 (Remover Compartilhar/Dados)** — quick win
3. **Fase 7 (Tema escuro)** — autocontido, melhora visual
4. **Fase 2A (Calendário com clique + notif)** — feature mais pedida
5. **Fase 2B (Drag & drop loot)** — feature rápida
6. **Fase 8 (Tipos customizáveis)** — refator grande, abre porta para Fase 3
7. **Fase 9 (Cadastro com aprovação)** — segurança/governança
8. **Fase 3 (Redesign cards)** — polish com benefício da Fase 8
9. **Fase 10 (Responsividade)** — finaliza polindo tudo que existe

Ordem pode ser ajustada a qualquer momento conforme prioridade do usuário.

---

## Estado Atual

- **Branch ativa:** `feature/fase-4-admin-gerenciar-contas` (PR aberto, aguardando merge)
- **Produção:** https://mhigos-raid-planner.up.railway.app no ar com volume persistente
- **Próximo passo recomendado:** mergear o PR da Fase 4 e iniciar a Fase 5 (Bugfixes) — escolha do usuário pode redefinir
