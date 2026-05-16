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
| 2B | Feature  | Drag & drop na prioridade de loot | ✅ | Sonnet |
| 7  | Tema     | Consertar botão "Tema" + adicionar tema "Warrior of Darkness" (roxo escuro) | ✅ | Sonnet |
| 8  | Conteúdo | Tipos de conteúdo customizáveis (party sizes 8/4/dinâmico + tipos novos) | ✅ | Opus |
| 9  | Auth     | Cadastro com aprovação por officer/admin (timeout 24h) | ✅ | Sonnet |
| 11 | Feature  | Raid Events — data formal de raid, quorum e adiamento por officer/admin | ✅ | Opus |
| 12 | Feature  | Integração Telegram — bot de notificações individual e de grupo | ⏳ | Opus |
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

## Fase 8 — Tipos de Conteúdo Customizáveis ✅

**Branch:** `feature/fase-8-conteudos-customizaveis`

### Modelo de dados
- Nova chave `state.customContents: []` no estado da static. Cada item: `{ id, name, partyMode: "full"|"light"|"dynamic", expansion?, iconUrl? }`.
- `partyMode` derivado em 3 presets fixos em vez de número livre:
  - **Full Party** — 8 jogadores, com titulares + banco + quorum (idêntico ao Savage/Ultimate)
  - **Light Party** — 4 jogadores, com titulares + banco + quorum
  - **Dynamic Party** — até 8 jogadores, evento aberto, sem quorum/banco-substituir/avisos
- Hardcoded (`FFXIV_RAIDS`, `FFXIV_ULTIMATES`) sempre são `full`.

### Backend (`server/app.py`)
- `_validate_state_diff` aceita `customContents` no mesmo loop officer+ (`activeProgs`, `scheduledProgs`, `raidEvents`, `customContents`). Member não pode mexer.

### Frontend (`js/app.js`, `js/data.js`)
- `DEFAULT_STATE.customContents = []` + migração em `hydrateState`.
- `CONTENT_TYPES` ganha entrada `custom` que lê dinamicamente de `state.customContents`.
- `getProgObj(progId)` busca em `[...FFXIV_RAIDS, ...FFXIV_ULTIMATES, ...state.customContents]`.
- Novos helpers: `getCustomContent`, `getPartyMode`, `getPartySize`, `isDynamicProg`, `isCustomProg`.
- Cap dinâmico em `renderRosterTables` (`X / partySize`), `renderDashboardVisualizer` (N slots), `btn-move-active` (toast com label correto), cadastro de jogador, modal de agendamento (`max` do input de quorum).
- Modo `dynamic` no `renderQuickSchedule`: oculta quorum badge, "Faltam X confirmações", "Banco disponível", "titulares com Talvez/Atraso". Mostra apenas `X confirmado(s)` + lista flat de confirmados.
- Modo `dynamic` no calendário (`renderScheduleTable`): sem separador "Substitutos (Banco de Reservas)", sem tag "(Reserva)" no nome do jogador, sem classe `day-quorum-met` no TH.
- Chip de prog em `renderActiveProgsPanel`: customs mostram pill colorido (Full / Light / Dynamic / Custom) em vez de só Savage/Ultimate.

### UI nova
- Botão `Conteúdos` no header (officer+) → modal `modal-content-manager`.
- Formulário: nome (obrigatório), expansão (opcional), modo de party (3 cards de radio).
- Lista de conteúdos cadastrados com pill colorido por modo, marca "Em uso" se está em `activeProgs`, botão remover com `showConfirm`.
- Remover faz cascata: limpa de `activeProgs`, `raidEvents` e `pendingNotifications` do prog.

### Decisões de design
- Removido o conceito de "partySize numérico livre" do plano original — 3 presets cobrem todos os formatos reais (Savage 8, Light/Criterion 4, evento aberto).
- Dynamic Party é semanticamente um "evento aberto": notifica data, players confirmam, sem quorum nem promoção titular/banco.
- Sem `iconUrl` ou `category` no schema por ora — adicionável depois sem migração.

**Modelo:** Opus.

---

## Fase 9 — Cadastro com Aprovação ✅

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

## Fase 11 — Raid Events ✅

**Objetivo:** evoluir o agendamento simples (Fase 2A) para um modelo de "evento formal de raid" — com data definida pelo criador do conteúdo, quorum configurável e possibilidade de adiamento.

### Modelo de dados
Substituir `state.scheduledProgs: {}` por `state.raidEvents: []`. Cada evento:
```json
{
  "id": "evt_arcadion_20260522",
  "progId": "arcadion_lh",
  "date": "2026-05-22",
  "quorum": 6,
  "createdBy": "user_id",
  "createdAt": "2026-05-15T20:00:00Z",
  "postponedTo": null,
  "postponedBy": null,
  "postponedAt": null
}
```
- Um prog pode ter no máximo um evento futuro ativo.
- Adiamento não apaga o evento — atualiza `postponedTo` + `postponedBy` + `postponedAt` e envia nova notificação.

### Backend (`server/app.py`)
- Validar `raidEvents` no `PUT /api/state`: officer+ cria/edita/adia; member só lê.
- `_validate_state_diff` ganha entrada para `raidEvents`.

### Frontend (`js/app.js`, `index.html`)
- Modal de agendamento (Fase 2A) ganha campo de quorum (número mínimo de players confirmados).
- Calendário: dias com evento mostram chip com nome do prog + indicador de quorum (`4/6`).
- Ao atingir quorum (N jogadores com "avail" naquela data), exibe badge verde na célula.
- Officers+ podem adiar: abre modal com campo de nova data. Gera nova notificação `pendingNotifications`.
- `renderQuickSchedule` usa `raidEvents` em vez de `scheduledProgs`.
- Migração suave: carregar `scheduledProgs` antigo e converter para `raidEvents` em `hydrateState`.

**Modelo:** Opus (mudança de modelo de dados + lógica de quorum).

---

## Fase 12 — Integração Telegram ⏳

**Objetivo:** notificar jogadores via bot do Telegram em três cenários: quorum atingido para um raid event, lembrete de evento próximo (X horas antes) e lembrete individual para jogadores que ainda não marcaram disponibilidade.

### Configuração
- Env var: `TELEGRAM_BOT_TOKEN` (Railway secret).
- Env var: `TELEGRAM_NOTIFY_HOURS_BEFORE=24` (padrão 24h).
- Env var: `TELEGRAM_QUORUM_NOTIFY=true`.

### Vinculação de conta
- Nova coluna `telegram_chat_id TEXT` em `users`.
- Fluxo: user clica "Conectar Telegram" no perfil → backend gera código temporário (6 dígitos, TTL 10 min) → user manda `/start XXXXXX` ao bot → bot confirma e salva `chat_id`.
- Desvinculação: botão "Desconectar" apaga `telegram_chat_id`.

### Backend (`server/`)
- `server/telegram.py` — helper com `send_message(chat_id, text)` via `requests` (HTTP simples, sem biblioteca pesada).
- `GET /api/telegram/link-code` — gera e retorna código temporário para o usuário logado.
- `POST /api/telegram/webhook` — recebe updates do Telegram; processa `/start <code>` vinculando a conta.
- Webhook registrado em produção via `POST https://api.telegram.org/bot<TOKEN>/setWebhook`.
- **Notificações disparadas por eventos**, não por cron:
  - **Quorum atingido**: `PUT /api/state` já checa se o novo `avail` completou o quorum → dispara imediatamente.
  - **Lembrete de evento próximo**: checado a cada `GET /api/state` de qualquer usuário; se há evento em ≤ `TELEGRAM_NOTIFY_HOURS_BEFORE` horas e o lembrete ainda não foi enviado, dispara e marca `reminderSent: true` no evento.
  - **Lembrete individual**: mesma lógica — se usuário com `telegram_chat_id` não tem marcação para um evento próximo, notifica na próxima requisição autenticada desse usuário.

### Frontend (`js/app.js`, `index.html`)
- Seção "Telegram" no modal de perfil/conta do usuário.
- Estado: "Não conectado / Conectar" → mostra código e instrução → "Conectado ✓ / Desconectar".
- Toast de confirmação ao vincular com sucesso.

### Decisões de design
- Sem APScheduler — notificações são piggyback em requisições existentes (sem background thread).
- Sem OAuth — fluxo de código simples é suficiente para grupo pequeno.
- Mensagens em português, tom informal.

**Modelo:** Opus (backend multi-arquivo + segurança do webhook).

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
   ├──→ 5 ✅  6 ✅  7 ✅  2A ✅  2B ✅ (concluídos)
   │
   ├──→ 2A ✅ ──→ 11 ⏳ (Raid Events — evolui scheduledProgs)
   │              └──→ 12 ⏳ (Telegram — depende de raid events)
   │
   ├──→ 8 ✅ ──→ 3 ⏳ (tipos customizáveis ⇒ redesign cards)
   ├──→ 9 ⏳ (cadastro com aprovação — auth)
   └──→ 10 ⏳ (responsividade — por último para cobrir tudo que tem)
```

---

## Sugestão de ordem de execução

1. ~~Fases 5, 6, 7, 2A, 2B~~ ✅ concluídas
2. **Fase 11 (Raid Events)** — evolui o agendamento, base para Telegram
3. **Fase 9 (Cadastro com aprovação)** — segurança antes de crescer o grupo
4. **Fase 12 (Telegram)** — depende da Fase 11 estar estável em prod
5. **Fase 8 (Tipos customizáveis)** — refator grande, abre porta para Fase 3
6. **Fase 3 (Redesign cards)** — polish com benefício da Fase 8
7. **Fase 10 (Responsividade)** — finaliza polindo tudo que existe

Ordem pode ser ajustada a qualquer momento conforme prioridade do usuário.

---

## Estado Atual

- **Branch ativa:** `feature/fase-8-conteudos-customizaveis` (pronta para PR/merge)
- **Produção:** https://mhigos-raid-planner.up.railway.app no ar com volume persistente
- **Próximo passo recomendado:** Fase 3 (Redesign visual da lista de conteúdos) — depende da Fase 8 para incluir customs nos cards
