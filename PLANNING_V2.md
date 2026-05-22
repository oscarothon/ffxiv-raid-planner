# Planejamento de Features V2 — App Principal + Visual Strategy Planner

> Roadmap V1 (17 fases originais) concluído em 2026-05-18 — consulte `PLANNING_V1.md` para o histórico.

Stack atual: Vanilla JS + Flask + SQLite, persistido em `statics.data_json`. Real-time atual: polling com ETag (5s).

**Produção:** https://mhigos-raid-planner.up.railway.app (Railway, volume persistente em `/data`)

---

## Ordem de execução

**Prioridade total nas fases do app principal.** O **Strategy Planner (fases A-I)** fica em backlog — será executado *por último*, depois que N, O, P, Q estiverem em produção.

Ordem prevista:

1. **Fase P** — Validação de Presença por Expansão
2. **Fase Q** — Disponibilidade por Horário (popover do dia + janelas de overlap)
3. **Fase O.2** — Refactor da aba Party (ler identidade do `character_json`) — polimento, pode ser feita depois de P/Q
4. **Fases A-I** — Strategy Planner (canvas SVG colaborativo)

Concluídas: J, K, L, M, N, O (parte 1: aba Personagem).

---

## Tabela Resumo

### Concluídas

| # | Fase | Descrição | Status | Modelo |
|---|------|-----------|:------:|:------:|
| J | Detalhes do Evento | Campo `description` em `raidEvent` + botão "Detalhes" + permissões | ✅ | Sonnet |
| K | Lista Talvez/Atraso | Listar nicks na mensagem de atenção (status incerto, não confirmados) | ✅ | Sonnet |
| L | Aviso de Quórum 8+ | Sugestão de Full Party para officer/admin quando 8+ disponíveis em dia sem evento | ✅ | Sonnet |
| M | Avisos Adiamento/Cancelamento | Melhora mensagem de adiamento (inclui data antiga) + novo aviso de cancelamento no Telegram | ✅ | Sonnet |
| N | Catálogo de Expansões | `state.expansions` com level cap + dropdown na criação de conteúdo + edição admin + retrocompat aprimorada | ✅ | Sonnet |
| O | Aba Personagem (parte 1) | `users.character_json` + endpoints + migração + nova aba "Personagem" (identidade/jobs/progs) + renomeia "Membros"→"Party" + tabs responsivas | ✅ | Opus |

### Pendentes — App Principal (prioridade)

| # | Fase | Descrição | Status | Modelo |
|---|------|-----------|:------:|:------:|
| P | Validação de Presença por Expansão | `avail` só conta se `character.currentExpansion ≥ content.expansion` (front + backend) | ⏳ | Sonnet |
| Q | Disponibilidade por Horário | Popover do dia (avail/maybe/unavail) + grade de horas (12:00→02:00, 30 min) + janelas de overlap + `time`/`durationMin` no evento | ⏳ | Opus |
| O.2 | Refactor aba Party | Slot do roster vinculado a `user_id` passa a ler `name`/`ilvl`/`jobs` do `character_json`; dropdown de `assignedJob` limita às classes do character; visibilidade de ilvl/jobs restrita aos escalados no prog selecionado | ⏳ | Sonnet |

### Backlog — Strategy Planner (executar por último)

| # | Fase | Descrição | Status | Modelo |
|---|------|-----------|:------:|:------:|
| A | Foundation | Backend WebSocket (Flask-SocketIO) + tabela `plans` + permissões | ⏳ | Opus |
| B | Canvas Core | Arena SVG circular + grid + tokens de jogadores draggáveis (real-time) | ⏳ | Opus |
| C | AOEs & Marcas | Toolbar de AoE shapes, waymarks A-D / 1-4, target markers | ⏳ | Opus |
| D | Timeline | Multi-step (frames) com snapshot por frame + navegação | ⏳ | Opus |
| E | Plan Manager | UI de listagem/criação/renomeação/deleção de planos por prog | ⏳ | Sonnet |
| F | Light Party Split | Split visual 8p → LP1 (1-4) + LP2 (5-8) em conteúdos Full Party | ⏳ | Sonnet |
| G | Arenas Adicionais | Quadrado, octógono, upload de background customizado | ⏳ | Sonnet |
| H | Assets & Polimento | Mirror dos ícones FFXIV, criação dos SVGs de AOE próprios, melhorias visuais | ⏳ | Sonnet |
| I | Free Draw | Desenho colaborativo no canvas + color picker RGB + modo seta direcional | ⏳ | Opus |

> Legenda: ✅ concluído · ⏳ pendente

---

# PARTE 1 — Pendentes do App Principal (Prioridade)

## Fase P — Validação de Presença por Expansão

**Objetivo:** disponibilidade ("avail") de um jogador num dia só conta para quórum/escalação se a **expansão atual do personagem** for compatível com a **expansão do conteúdo** daquele evento. Bloqueia o caso de membro Heavensward sendo contado como confirmado num evento de Endwalker.

**Depende de:** Fase N (`state.expansions` com `order`) + Fase O (`character.currentExpansionId`).

### Regra de compatibilidade

1. Helper em [js/app.js](js/app.js):
   ```js
   function isExpansionCompatible(userExpansionId, contentExpansionId) {
     if (!userExpansionId || !contentExpansionId) return true; // fallback permissivo (dados faltando)
     const expById = (state.expansions || []).reduce((a, e) => (a[e.id]=e, a), {});
     const u = expById[userExpansionId];
     const c = expById[contentExpansionId];
     if (!u || !c) return true;
     if (u.isLimited || c.isLimited) return true; // Limited Job: regra própria, ignora ordem
     return c.order <= u.order; // pode fazer conteúdo de expansão igual ou anterior à sua
   }
   ```
2. **Limited Job** é exceção: não entra na ordem das expansões normais. Sempre compatível (Limited tem regra própria via `limitedJobId`).
3. **Fallback permissivo**: se `userExpansionId` ou `contentExpansionId` for `null`, considerar compatível para não bloquear acidentalmente. Com a retrocompat da Fase N, esses `null` devem ser raros.

### Aplicação da regra (frontend)

4. **Cálculo de confirmados em "Próximos dias de raid"** em [js/app.js:2156](js/app.js:2156): no loop que monta `confTitulares`/`confReservas`/etc., só contar um jogador como `avail` se `isExpansionCompatible(user.character.currentExpansionId, event.contentExpansionId)`.
5. **`getAvailCountForDate(dateKey)`** em [js/app.js:1633](js/app.js:1633): aceita opcionalmente um `contentExpansionId` e filtra. Sem esse parâmetro, mantém comportamento atual (compat para quem chama sem contexto de prog).
6. **Quorum opportunities (Fase L)**: também aplica — não sugere full party se os 8 disponíveis incluem gente incompatível. A Fase Q vai refinar isso (considerando overlap + expansão).

### Aplicação da regra (backend, para o Telegram)

7. Mesma lógica em `_count_confirmed_for_date` em [server/app.py:782](server/app.py:782):
   - Buscar `currentExpansionId` do `character_json` do user vinculado a cada slot
   - Buscar `expansionId` do `content` (de `customContents` ou catálogo built-in espelhado em backend)
   - Aplicar `is_expansion_compatible` (helper Python espelhado)
8. Sem isso, os números reportados pelo Telegram (Confirmados X/Y) divergem do site. **Crítico para consistência.**

### Feedback visual

9. Na tabela mensal de schedule ([js/app.js:2160](js/app.js:2160)): célula com `avail` de jogador incompatível para o prog do evento daquele dia:
   - Mantém o ✔️ (jogador marcou disponibilidade — é informação válida)
   - **Adiciona** indicador discreto sobreposto (cadeado pequeno no canto + tooltip "Não conta — expansão atual: Heavensward, evento: Endwalker")
   - Cor da célula muda para acinzentada/desaturada para deixar claro que não conta
10. Em "Próximos dias de raid": jogadores incompatíveis **não** aparecem na lista de confirmados. Aparecem numa lista separada "Disponíveis mas fora da expansão: X" (officer/admin only, para o officer saber quem está marcando mas não pode contar).

### Critério de aceite

- Membro Heavensward marca `avail` num dia de evento Endwalker → não conta para quórum, não aparece na lista de confirmados, célula com indicador + tooltip
- Membro Heavensward marca `avail` num dia de evento Heavensward ou ARR → conta normalmente
- Conteúdo Limited (Blue Mage): regra de expansão não se aplica, segue a lógica existente do `limitedJobId`
- Quórum opportunity (Fase L) só sugere full party quando há 8 compatíveis para pelo menos um prog ativo
- Telegram reporta os mesmos números do site (`Confirmados: X/Y` consistente front ↔ back)
- Fallback permissivo: char sem expansão OU conteúdo sem expansão = sempre conta (não bloqueia indevidamente)

---

## Fase Q — Disponibilidade por Horário (popover do dia + janelas de overlap)

**Objetivo:** substituir a marcação binária de disponibilidade (`avail/late/none`) por um modelo baseado em **ranges de horário**. Cada jogador marca seu status do dia (Disponível/Talvez/Indisponível) e os horários específicos em que pode jogar. Eventos passam a ser agendados **dentro das janelas de overlap viáveis** da composição — invertendo o paradigma atual de "agenda primeiro, vê quem pode depois".

**Depende de:** Fases N, O, P (a regra de expansão da P combina com a de overlap; o character.json da O guarda configs futuras como horários típicos).

### Mudança de paradigma

- **Antes:** officer escolhe data+horário arbitrário → pessoal confirma se pode
- **Depois:** pessoal marca quando pode → sistema computa janelas viáveis → officer agenda dentro de uma janela
- **Confirmação de presença vira derivada**, não declarada. A pessoa não diz "confirmo o evento das 20:30" — ela diz "posso 19:00–23:00", e o sistema calcula que ela cobre o evento.

### Schema

1. `monthlySchedule[dateKey]` deixa de ser string e vira objeto:
   ```js
   {
     status: "avail" | "maybe" | "unavail",
     ranges: [{ start: "HH:MM", end: "HH:MM" }, ...]  // vazio quando unavail
   }
   ```
   - `avail` com `ranges: []` = atalho "Dia inteiro"
   - `maybe` com `ranges: []` = "talvez o dia inteiro"
2. `raidEvent` ganha:
   - `time: "HH:MM" | null` — `null` significa "horário a definir"
   - `durationMin: number | null` — duração escolhida pelo officer no agendamento
3. **Migração de `monthlySchedule`:**
   - `"avail"` → `{status: "avail", ranges: []}`
   - `"late"` → `{status: "maybe", ranges: []}` (conceito "late" removido)
   - `"unavail"` ou ausência → `{status: "unavail", ranges: []}`
4. **Migração de `raidEvent`:** eventos antigos sem `time` ficam com `time: null, durationMin: null` e exibem badge **"Horário a definir"** em todos os pontos de UI (calendário mensal, próximos dias, card do evento). Não conta como confirmado pra ninguém até officer editar.

### UI — popover do dia (substitui marcação binária)

5. Click numa célula do calendário (próprio usuário) abre **popover** (não modal — sobrepõe a célula, fecha com ESC ou clique fora):
   - 3 botões grandes no topo: **Disponível** / **Talvez** / **Indisponível**
   - Se **Disponível** ou **Talvez** selecionado ⇒ aparece a grade de horas abaixo
   - Se **Indisponível** ⇒ grade desaparece, ranges são esvaziados
6. **Grade de horas** (12:00 → 02:00 do dia seguinte, slots de 30 min = 28 slots):
   - Layout: faixa horizontal compacta, label a cada hora cheia
   - Click num slot toggla seleção
   - Click + drag pinta múltiplos slots (estilo When2meet/Doodle)
   - Atalho "Dia inteiro" pinta todos os 28 slots de uma vez
   - Cross-midnight tratado nativamente: slot `01:00-01:30` significa "do dia clicado para o seguinte"
7. **Botão "Confirmar"** salva o status + ranges normalizados (slots contíguos viram um único range). Cor da célula atualiza com a cor existente para cada status:
   - Disponível → verde
   - Talvez → amarelo
   - Indisponível → vermelho (atual)
8. Mobile: mesma grade em layout vertical compacto, toque equivalente a click.

### UI — calendário mensal (officer/admin)

9. Modo padrão: cor por status agregado (igual hoje).
10. **Toggle "Overlap"** no header do calendário (visível só para officer/admin):
    - Quando ativo, pinta cada dia conforme a **maior janela viável de 8 pessoas do roster** (qualquer 8 — titular ou reserva — alinhado com a decisão da Fase L)
    - Heatmap dourado: quanto mais brilhante, maior a janela em duração
    - Hover mostra tooltip com janela e contagem (ex: "20:30–22:30 · 8 disponíveis")
    - Dias sem janela viável ficam acinzentados

### UI — modal de agendamento (`openScheduleModal`)

11. Reformulação grande do modal:
    - Officer abre num dia → input de **duração esperada** (default sugerido por categoria do prog: Ultimate=180min, Savage=120min, Custom=120min — todos editáveis)
    - Lista de **janelas viáveis** computadas dinamicamente conforme a duração:
      ```
      ┌────────────────────────────────────────────────┐
      │ 20:30 – 23:00  │ 8 confirmados      [Agendar] │
      │ 19:00 – 22:00  │ 6 confirm + 2 talvez [Agendar] │
      │ 14:00 – 17:00  │ 4 confirm + 3 talvez [Agendar] │
      └────────────────────────────────────────────────┘
      ```
    - Janela com 8 só de `avail` = "garantida" (badge verde)
    - Janela que precisa somar `maybe` pra atingir 8 = "potencial" (badge amarelo, mostra quantos são talvez)
    - Se nenhuma janela atinge 8: mostra as maiores parciais com aviso "Faltam N — considere agendar mesmo assim ou esperar mais marcações"
12. Clicar em **Agendar** numa janela salva o `raidEvent` com `time = janela.start` e `durationMin = duração escolhida`.
13. Officer pode também escolher horário/duração arbitrário (escape hatch) via toggle "Modo manual" no modal — caso queira sobrepor a sugestão.

### Lógica de overlap

14. Helper novo em [js/app.js](js/app.js):
    ```js
    function computeViableWindows(dateKey, durationMin, requiredCount = 8) {
      // 1. Coletar ranges efetivos de todos do roster pra dateKey
      //    (considerar status: "avail" sem ranges = dia inteiro 12:00-02:00; "unavail" = nada)
      // 2. Discretizar em slots de 30 min (mesmo grid da UI)
      // 3. Para cada slot, contar:
      //    - countAvail: quantos têm status "avail" cobrindo o slot
      //    - countMaybe: idem para "maybe"
      // 4. Aplicar filtro de expansão (Fase P): só conta jogador se compatível com o prog/evento (ou ignorar se chamado sem prog)
      // 5. Detectar janelas contínuas onde:
      //    - (countAvail) >= requiredCount E largura >= durationMin → janela "garantida"
      //    - (countAvail + countMaybe) >= requiredCount E largura >= durationMin → janela "potencial"
      // 6. Retornar lista ordenada por: garantidas primeiro, depois por maior largura, depois mais cedo
    }
    ```
15. Helper Python espelhado em [server/app.py](server/app.py) para uso nas mensagens do Telegram e validações de backend.

### Confirmação de presença (derivada)

16. Helper novo `getConfirmationStatusForEvent(user, event)`:
    - Se `event.time === null` (horário a definir): sempre retorna `"pending"`
    - Verifica `expansionCompatible` (Fase P) → se não, retorna `"incompatible"`
    - Pega `monthlySchedule[event.date]` do user
    - Se `status === "unavail"` → `"unavail"`
    - Se `status === "avail"`:
      - Range cobre `[event.time, event.time + event.durationMin]` integralmente → `"confirmed"`
      - Range cobre parcialmente → `"partial"`
      - Sem ranges (dia inteiro) → `"confirmed"`
    - Se `status === "maybe"`:
      - Qualquer overlap com a janela do evento → `"maybe"`
      - Nenhum overlap → `"unavail"`
17. UI da confirmação no card do evento e em "Próximos dias":
    - Confirmados (`confirmed`) — verde, contam para quórum
    - Talvez (`maybe`/`partial`) — amarelo, listados separadamente
    - Indisponíveis (`unavail`) — vermelho ou ocultos
    - Incompatíveis (`incompatible`) — cinza, só officer/admin vê
    - Pendentes (`pending`, evento sem time) — neutro

### Impacto em features existentes

18. **Fase K (já concluída) — revisão**: a mensagem "Status incerto (Talvez/Atraso): X" passa a usar só "Talvez". O conceito "late" some — sua semântica de "atraso" agora é expressa por um range que começa depois do `event.time`.
19. **Fase L (já concluída) — revisão grande**: a sugestão "8+ disponíveis num dia" vira "janela de overlap com 8+ pessoas e ≥ X minutos de duração mínima" (definir X — sugiro **90 min** como threshold padrão pra sugerir, configurável depois). Mensagem do Telegram passa a incluir a janela sugerida: `"Oportunidade: sexta 20:30–22:30, 8 disponíveis (2h)."`
20. **Fase M (já concluída) — adaptação**: mensagens de adiamento/cancelamento passam a incluir `time` quando presente. Format: `"Raid adiada\nDSR foi adiada de sexta 20:30 para sábado 21:00."`
21. **Telegram — todos os lembretes** ([server/telegram.py](server/telegram.py)): templates que mostram data passam a mostrar `data + hora` quando `event.time` existe; senão mostram "(horário a definir)".
22. **Botão "Agendar" do quórum opportunity**: passa o horário sugerido pré-preenchido no modal.

### Critério de aceite

- Click numa célula do calendário abre popover com 3 botões (Disponível/Talvez/Indisponível); grade de horas aparece para Disponível ou Talvez; click+drag funciona; ESC e clique fora cancelam
- Grade respeita 12:00 → 02:00 do dia seguinte, slots de 30 min, cross-midnight nativo
- Officer abre modal de agendamento e vê lista de janelas viáveis (garantidas + potenciais) — agenda com 1 clique
- Eventos antigos sem `time` ficam com badge "Horário a definir" em todos os pontos de UI até officer editar
- Confirmação de presença é derivada do range, não declarada — card do evento explica "Você está confirmado porque marcou 19:00–23:00"
- Toggle "Overlap" no calendário pinta heatmap para officer/admin
- Mensagens da Fase L atualizadas: sugerem janela horária específica, não só dia
- Mensagens da Fase M atualizadas: incluem hora quando presente
- Migração não perde dados: strings antigas → objeto; `"late"` → `"maybe"`; eventos sem `time` ficam com badge correto
- Telegram reporta mesma confirmação que o site (helpers Python e JS espelhados)

### Esforço estimado

3-4 sessões (Opus). Feature larga: novo widget de seleção de horas, algoritmo de overlap, refactor profundo do modal de agendamento, migração de schema (`monthlySchedule` + `raidEvent`), revisão de K/L/M em produção, helpers espelhados front+back.

> **Observação:** se a fase ficar grande demais em PR único, pode ser dividida em **Q1 — Schema + popover de horários + grade** e **Q2 — Modal de agendamento com janelas + impacto em K/L/M**. Decidir no início da fase.

---

## Fase O.2 — Refactor da aba Party (ler character_json)

**Objetivo:** completar a transição iniciada na Fase O — slots do roster vinculados a um `user_id` passam a ler identidade (nome, ilvl, classes) do `character_json` do user, não do próprio slot. Slots órfãos (`user_id === null`) continuam funcionando como hoje.

**Depende de:** Fase O (entregue — `users.character_json` + endpoints).

### Mudanças

1. **Leitura unificada** via novo helper `getSlotIdentity(player)` que retorna `{name, ilvl, jobs}`:
   - Se `player.user_id` existe e o backend retorna `character_json` daquele user → usa `{character.name, character.ilvl, character.jobs.map(j => j.id)}`.
   - Senão (slot órfão) → usa `{player.name, player.ilvl, player.jobsPool}` (comportamento atual).
2. **Distribuição do `character_json` no estado do front:**
   - Opção A: GET `/api/state` passa a incluir `characters: {<user_id>: {...}}` para todos os users com slot vinculado (server enriquece a resposta).
   - Opção B: front busca cada character individualmente no carregamento. Mais requests, menos invasivo no backend.
   - **Recomendação:** Opção A (1 query a mais por GET state).
3. **Dropdown de `assignedJob` por prog** (`renderRosterTables`): limita às classes do `character.jobs` do user vinculado (interseção com pool de jobs válidos pro conteúdo, ex: Limited só vê BLU).
4. **Visibilidade** (PLANNING decision já fechada): membro comum vê ilvl/jobs **só dos escalados no prog selecionado**. Officer/admin vê todos. Lógica em `renderRosterTables` + `comp-visualizer`.
5. **Formulário "Cadastrar Novo Jogador"** (aba Party): continua funcionando para criar slots órfãos. Slots vinculados a user via `user_id` só são editáveis nesses campos pelo próprio user (via aba Personagem) ou officer/admin.

### Critério de aceite

- Slot com `user_id` vinculado: nome/ilvl/jobs vêm do `character_json`, refletindo mudanças feitas na aba Personagem (após reload ou próximo polling).
- Slot sem `user_id`: comportamento idêntico ao atual.
- Dropdown de `assignedJob` por prog limita-se às classes que o user marcou na aba Personagem (quando vinculado).
- Membro comum em static com vários progs: vê próprio personagem completo + dos escalados nos progs onde está ativo; oculta dos demais.

### Esforço estimado

1-2 sessões (Sonnet). Não há schema novo nem endpoints novos — só leitura distribuída e atualização de renderers.

---

# PARTE 2 — Backlog: Strategy Planner (Fases A-I)

> **Estas fases ficam para o final.** Só iniciar depois que N, O, P, Q estiverem em produção.

## Visão Geral do Strategy Planner

Adicionar uma nova aba **"Estratégias"** dentro do app (5ª tab no `.ff-tabs`), com um editor visual de canvas (estilo [raidplan.io](https://raidplan.io)) para planejar mecânicas das lutas. Recursos principais:

- Canvas SVG com arena circular + grid configurável
- Tokens de jogadores arrastáveis com **ícone do job principal atribuído àquele jogador para aquele prog específico** (via `getAssignedJobForProg`). Em conteúdos Limited (ex: Blue Mage), todos os tokens ficam travados no job da limited.
- Marcação de AOEs (circles, donuts, cones, stacks) e waymarks (A-D, 1-4)
- **Colaboração em tempo real** — múltiplos membros da party editam simultaneamente com visualização instantânea via WebSocket
- **Timeline progressível** (frames) — cada frame representa um momento da luta; navegar = avançar/voltar no tempo da mecânica
- Light Party split visual em conteúdos Full Party (8p)
- Múltiplas arenas (círculo, quadrado, octógono…) ao longo das fases

### Layout e Design

- **Quebra de largura permitida**: o resto do app respeita `max-width: 1400px` no `.app-container`, mas esta aba expande para ~95vw (ou `100vw - margin`) para dar espaço ao canvas. Quando o usuário entra na aba "Estratégias", o `app-container` recebe uma classe (`is-canvas-mode`) que remove o cap de largura.
- **Design system 100% preservado**:
  - Fonte `Cinzel` em todos os textos
  - Paleta existente: `--clear-blue`, `--gold-bright`, `--bg-panel`, etc.
  - **Todos os 3 temas funcionam**: Clear Blue Crystal (padrão), Classic Dark, Warrior of Darkness. O canvas SVG usa CSS variables para cores, então troca de tema repinta tudo automaticamente.
  - Botões, painéis, modais seguem o vocabulário visual existente (`.ff-btn`, `.ff-panel`, `.ff-modal`)
  - Bordas do canvas e da arena: gradient azul-cristal + ouro como nas headers de painel

### Decisões já tomadas com o usuário

| Decisão | Escolha |
|---|---|
| Quem pode editar um plano | **Apenas membros ativos da party do prog vinculado** (`getPlayerStatusForProg === "active"`) |
| Vínculo plano ↔ conteúdo | Plano pertence a um **prog/content** (não a um evento de data). Cada prog *pode* ter um ou mais planos. |
| Compartilhamento externo | **100% interno** — sem URLs públicas, sem visualização por anônimos |
| Real-time | **Flask-SocketIO** (WebSocket) — visualização instantânea de movimentos de outros usuários |
| AOEs no MVP | **Sim** — disponíveis desde a Fase B (não deferir) |
| Arenas adicionais | Começa com círculo + grid; outras arenas em fase própria |
| Ícones FFXIV (waymarks, marks) | Mirror local de `cdn.raidplan.io/game/ffxiv/mark/` ou alternativa via xivapi.com |
| Ícones de AOE (SVGs abstratos) | **Recriar do zero** — formas geométricas simples, sem risco de copyright |

---

## Fase A — Foundation: WebSocket + Permissões + Schema

**Objetivo:** preparar a infraestrutura para colaboração em tempo real e o schema de planos no banco. Sem UI ainda.

### Backend

1. Adicionar **Flask-SocketIO** (`flask-socketio==5.x`) + `gevent` ou `eventlet` ao `requirements.txt`
2. Configurar Railway: `Procfile` ou comando de inicialização compatível com WSGI → ASGI
3. Nova tabela `plans`:
   ```sql
   CREATE TABLE plans (
     id TEXT PRIMARY KEY,           -- uuid
     static_id TEXT NOT NULL,
     prog_id TEXT NOT NULL,          -- conteúdo/prog vinculado
     name TEXT NOT NULL,
     created_by INTEGER NOT NULL,    -- user.id
     created_at TIMESTAMP,
     updated_at TIMESTAMP,
     state_json TEXT NOT NULL,       -- canvas state completo (frames, tokens, AOEs)
     FOREIGN KEY (static_id) REFERENCES statics(id)
   );
   CREATE INDEX idx_plans_prog ON plans(static_id, prog_id);
   ```
4. Endpoints REST (auth required):
   - `GET  /api/plans?prog_id=...` — lista planos do prog
   - `POST /api/plans` — cria plano (body: `{prog_id, name}`)
   - `GET  /api/plans/<id>` — busca estado completo
   - `PUT  /api/plans/<id>` — atualiza nome
   - `DELETE /api/plans/<id>` — deleta plano

### WebSocket (Socket.IO)

5. Namespace `/plan`:
   - `join` — cliente entra em sala `plan:<id>` após validar permissão
   - `op` — operação atômica (ex: `move_token`, `add_aoe`, `delete_element`, `set_frame_index`) — server valida + reenvia pra sala
   - `state_snapshot` — server envia estado completo periodicamente (ou sob demanda) como fallback
   - `presence` — broadcast de quem está online editando aquele plano

### Permissões

6. Helper `can_edit_plan(user, plan)`:
   - Carregar `plan.prog_id` e estado da static
   - Verificar `getPlayerStatusForProg(user_slot, prog_id) === "active"` (lógica espelhada do front)
   - Retornar `False` se usuário não tem slot OU slot não está active naquele prog

### Critério de aceite

- Migração roda sem quebrar dados existentes
- WebSocket conecta em produção (Railway) com TLS
- Permissão bloqueia membros não-ativos do prog
- Smoke test: 2 clientes conectados na mesma sala recebem broadcasts um do outro

---

## Fase B — Canvas Core: Arena Circular + Tokens + Real-time Drag

**Objetivo:** primeira versão visual funcional. Arena circular com grid, tokens de jogadores arrastáveis, sincronização ao vivo.

1. Nova aba **"Estratégias"** em `index.html` (5ª tab)
2. Layout 3-colunas:
   - **Esquerda**: lista de planos do prog ativo + botão "Novo Plano"
   - **Centro**: canvas SVG (arena + grid + tokens + AOEs)
   - **Direita**: painel de propriedades (Arena, Grid size, etc) — mockado nesta fase
3. **Canvas SVG**:
   - Arena círculo (`<circle>` 800×800, fundo escuro com borda azul-cristal)
   - Grid configurável (default 8×8) — `<line>` ou `<pattern>`
   - Marcadores cardinais (N/S/L/O) visíveis
4. **Tokens de jogador** (vindo da party real do prog):
   - Renderizar 1 token por slot da party ativa do prog (`getPlayerStatusForProg === "active"`)
   - Cada token = círculo colorido (cor do role) + **ícone do job principal atribuído** (`getAssignedJobForProg(player, prog_id)`) + nome do jogador abaixo
   - Se o conteúdo for Limited (ex: Blue Mage): todos os 8 tokens forçados ao ícone do `limitedJobId` (mesma lógica do roster)
   - Posição inicial: distribuição circular dentro da arena (8 jogadores = 8 posições cardinais/intercardinais)
   - Drag-and-drop (mouse + touch) com snap-to-grid opcional (toggle)
   - Tokens **não podem ser deletados** (são sempre os jogadores da party); só posicionados
5. **Real-time sync (Socket.IO)**:
   - Ao começar drag → emit `op: token_drag_start`
   - Durante drag → emit `op: token_move` a cada 50ms (throttle)
   - Ao soltar → emit `op: token_drop` + salvar no banco
   - Outros clientes na sala renderizam movimentação suave
6. **Estado do canvas** (JSON em `plans.state_json`):
   ```json
   {
     "version": 1,
     "arena": { "shape": "circle", "grid": {"rows": 8, "cols": 8} },
     "frames": [
       {
         "id": "f1",
         "name": "Início",
         "tokens": { "<player_id>": {"x": 400, "y": 400} },
         "aoes": [],
         "marks": []
       }
     ],
     "currentFrame": "f1"
   }
   ```

### Critério de aceite

- 2 usuários ativos no mesmo prog veem mutuamente o drag em tempo real
- Refresh da página recupera o estado salvo
- Membro não-ativo no prog NÃO consegue mover tokens (permissão validada no server)

---

## Fase C — AOEs e Marcas (Marks/Waymarks)

**Objetivo:** marcar ataques da luta visualmente. AoEs nas formas comuns do FFXIV + waymarks oficiais.

1. **Toolbar à esquerda do canvas** com seções:
   - **Tokens** (já existentes, geração automática)
   - **Waymarks**: A, B, C, D, 1, 2, 3, 4 (botões com preview do ícone)
   - **Marcas de target**: chain1-4, stop, shape (attack/bind/ignore/square)
   - **AOEs**: circle, donut, ring, quarter, half, pie, cone (wedge), line stack, knockback, spread, stack-marker
2. **Comportamento de adicionar**:
   - Clicar na ferramenta → cursor muda para "modo placement"
   - Clicar na arena → adiciona o elemento na posição clicada
   - ESC ou clique fora → cancela
3. **Comportamento de editar**:
   - Clicar num elemento → selecionado (highlight)
   - Drag move
   - Handle de rotação para AoEs direcionais (cone, line)
   - Handle de resize para AoEs de raio variável
   - DEL ou botão de delete → remove
4. **Propriedades editáveis** (painel direito quando algo está selecionado):
   - Cor (paleta de 8 cores)
   - Opacidade
   - Raio / largura (numérico)
   - Rotação (numérico em graus)
5. **Sincronização real-time**:
   - `op: add_element`, `op: update_element`, `op: delete_element` via WebSocket
   - Element IDs gerados client-side (uuid v4) para evitar conflito

### Critério de aceite

- 10+ tipos de AoE disponíveis e funcionais
- Waymarks e marks com ícones autênticos do FFXIV
- Resize/rotação de AoE funcionam suavemente
- Multi-usuário: 2 pessoas adicionando AoEs ao mesmo tempo sem conflito

---

## Fase D — Timeline Progressível Multi-step (Frames)

**Objetivo:** sequenciar mecânicas como linha do tempo da luta. Cada "frame" representa um momento da luta com posições, AoEs e marcas específicas. Avançar pelos frames = avançar no tempo da mecânica.

1. **Barra de timeline** abaixo do canvas:
   - Lista horizontal de chips: `[1] [2] [3] [+]`
   - Cada chip tem um nome editável (ex: "Pré-mecânica", "Spread", "Stack", "Resolve", "Pós")
   - Chip ativo destacado em dourado
   - Opcional: cada frame pode ter um "timestamp" textual (ex: "0:30", "1:15") para referência ao log da luta
2. **Ações por frame**:
   - **Adicionar**: cria frame novo, opção "duplicar do anterior" (padrão) ou "vazio"
   - **Deletar**: remove frame (não pode deletar o último)
   - **Reordenar**: drag-and-drop entre chips
   - **Renomear**: double-click → input inline
3. **Navegação progressível**:
   - Setas ◀ ▶ no canvas ou teclas direcionais do teclado
   - Botão **"Play"** opcional (Fase D ou H): anima automaticamente a transição entre frames (interpolação linear das posições dos tokens em ~500ms cada)
   - Cada frame guarda **snapshot completo** de `tokens`, `aoes`, `marks`
   - Indicador visual: "Frame 2 de 5 — Spread"
4. **Botão "Duplicar como próximo"**: clona o frame atual e abre o duplicado para edição (caso comum: editar pequena diferença entre dois momentos consecutivos)
5. **Sincronização**:
   - `op: add_frame`, `op: delete_frame`, `op: rename_frame`, `op: reorder_frames`
   - Mudança de frame ativo é **por usuário** (não broadcast) — cada um navega independentemente
   - Edições dentro de um frame são broadcast para todos que estão visualizando aquele mesmo frame

### Critério de aceite

- Criar/deletar/renomear/reordenar frames funciona
- Navegar entre frames atualiza canvas instantaneamente
- Multi-usuário: cada um pode estar visualizando frame diferente; edições aparecem em quem está no mesmo frame

---

## Fase E — Plan Manager (Múltiplos Planos por Prog)

**Objetivo:** UI para criar, listar, renomear, deletar planos. Cada prog pode ter múltiplos (ex: "Estratégia principal", "Plano B").

1. **Coluna esquerda da aba Estratégias**:
   - Lista de planos do prog ativo
   - Cada item mostra: nome, criador, data de atualização, indicador "Default"
   - Botão `+ Novo Plano` (qualquer membro ativo no prog pode criar)
2. **Ações por plano**:
   - Clicar → abre no canvas central
   - Botão ⋮ → menu: Renomear, Deletar, Definir como Default
   - Apenas o criador OU admin/officer podem deletar
3. **Default plan**: quando o prog é aberto pela primeira vez, abre o plano marcado como default; se não há, abre o primeiro
4. **Estado vazio**: se o prog não tem nenhum plano, mostra placeholder "Nenhum plano para este conteúdo ainda. Crie o primeiro."

### Critério de aceite

- Múltiplos planos podem coexistir no mesmo prog
- Permissões de delete corretas
- Default funciona corretamente entre sessões

---

## Fase F — Light Party Split (Full Party / 8p)

**Objetivo:** em conteúdos Full Party (8 jogadores), permitir separar visualmente em LP1 e LP2 para mecânicas que dividem o grupo.

1. **Toggle no painel direito**: `[ ] Split Light Party`
2. Quando ativo:
   - Tokens 1-4 ganham borda azul (`Light Party 1`)
   - Tokens 5-8 ganham borda vermelha (`Light Party 2`)
   - Botão "Auto-split" preenche LP1 com tank principal + healer1 + DPS1 + DPS2 e LP2 com o resto (configurável)
3. **Atribuição manual**: drag token para área "LP1" ou "LP2" no painel direito; salva como `lightParty: 1|2` no token
4. **Visualizador**: legenda no canto da arena mostrando "LP1" e "LP2" com a composição
5. **Disponível apenas em**: progs cujo `partyMode === "full"` (8 jogadores). Em Light Party (4p), Dynamic ou Limited, toggle não aparece.

### Critério de aceite

- Toggle aparece só em Full Party
- Cores e bordas visualmente claras
- Atribuição persiste entre frames? **Não**, é uma propriedade global do plano (não muda por frame)

---

## Fase G — Arenas Adicionais

**Objetivo:** outras formas de arena, além do círculo. Necessário para fights com layouts específicos.

1. **Dropdown "Arena"** no painel direito:
   - Círculo (padrão, já feito)
   - Quadrado
   - Octógono
   - **Background customizado**: upload de imagem (PNG/JPG ≤ 1MB) que vira o fundo do canvas
2. **Cada forma tem**:
   - SVG path correspondente
   - Limites de drag (tokens não saem da área)
   - Grid adequado (círculo: radial+spokes; quadrado: rows×cols; octógono: rows×cols com bordas chanfradas)
3. **Background upload**:
   - Endpoint `POST /api/plans/<id>/background` (multipart, max 1MB, valida mime)
   - Salva em `/data/plan-backgrounds/<plan_id>.<ext>`
   - Reset para forma padrão também disponível
4. **Presets futuros**: hardcoded por luta? (ex: TOP octogon, FRU square). Avaliar no fim da fase se vale a pena.

### Critério de aceite

- 3 formas básicas + upload funcional
- Tokens respeitam o boundary
- Background customizado renderiza no SVG

---

## Fase H — Assets, Mirror de Ícones e Polimento

**Objetivo:** hospedar os ícones FFXIV no nosso CDN/repo, criar os SVGs próprios de AOE, ajustes visuais finais.

1. **Mirror dos ícones FFXIV**:
   - **Fonte primária**: [xivapi.com](https://xivapi.com) (CDN público de assets do jogo)
   - Alternativa: copiar de `cdn.raidplan.io/game/ffxiv/mark/` (verificar legalidade)
   - Pasta no repo: `assets/raid-planner/marks/` (waymarks A-D, 1-4, target chains, stops, shapes — total ~20 PNGs)
2. **SVGs próprios de AOE** (criar do zero, formas geométricas):
   - `aoe-circle.svg` (círculo cheio)
   - `aoe-donut.svg` (anel)
   - `aoe-ring.svg` (anel fino)
   - `aoe-quarter.svg` (1/4 de círculo)
   - `aoe-half.svg` (semicírculo)
   - `aoe-pie.svg` (fatia 1/8)
   - `aoe-wedge.svg` (cone)
   - `aoe-line-stack.svg` (linha reta + círculos)
   - `aoe-knockback.svg` (seta de empurrão)
   - `aoe-spread.svg` (marcador de spread amarelo)
   - `aoe-stack.svg` (marcador de stack roxo)
   - `aoe-prox.svg` (proximity marker)
3. **Pasta no repo**: `assets/raid-planner/aoe/`
4. **Polimento**:
   - Animações suaves nos drags (CSS transitions)
   - Tooltips em todas as ferramentas
   - Atalhos de teclado: DEL, Ctrl+Z (undo - opcional), setas para navegar frames
   - Indicador visual de "outros usuários online" no plano

### Critério de aceite

- Nenhum asset crítico depende de CDN externo
- Todos os SVGs de AOE são criação nossa
- Tooltips e atalhos funcionam

---

## Fase I — Free Draw: Desenho Colaborativo + Color Picker RGB + Modo Seta

**Objetivo:** permitir desenho livre sobre o canvas para marcar caminhos, áreas customizadas e direções de movimentação, com sincronização quase simultânea entre os editores da party. Cada desenho pertence ao frame atual (some/aparece junto com tokens e AoEs ao navegar pelos frames).

1. **Toolbar — nova seção "Desenho"** ao lado das AoEs e marcas:
   - Ferramenta **Pen (livre)**: cursor desenha polyline ao arrastar
   - Ferramenta **Arrow (seta)**: idêntico ao pen, mas ao soltar o traço é simplificado e ganha ponta de seta no último ponto — usado para indicar direção de movimentação
   - Ferramenta **Eraser**: clicar sobre um desenho remove (alternativa ao DEL para mobile)
2. **Color picker RGB:**
   - Botão circular no toolbar mostrando a cor atual
   - Ao clicar, abre popover com seletor RGB. Implementação preferida:
     - **MVP**: `<input type="color">` (nativo HTML5) embrulhado em wrapper estilizado para combinar com o design system
     - **Polimento (opcional)**: substituir por um círculo HSL custom em SVG (mais aderente ao design FFXIV)
   - Última cor escolhida persistida por usuário em `localStorage` (`drawColor`)
   - Espessura do traço configurável (slider 1-8px, ou 3 presets: fino/médio/grosso)
3. **Conversão Pen → Arrow:**
   - Ao soltar o traço em modo Arrow: aplicar simplificação Ramer-Douglas-Peucker (tolerância ~3px) para reduzir pontos
   - Calcular vetor dos últimos 2-3 pontos para orientar a ponta
   - Renderizar como `<polyline>` + `<polygon>` (ponta triangular) ou `<path>` com `marker-end`
4. **Estado no frame:**
   ```json
   "drawings": [
     {
       "id": "uuid",
       "type": "stroke" | "arrow",
       "color": "#rrggbb",
       "thickness": 3,
       "points": [{"x": ..., "y": ...}, ...],
       "createdBy": <user_id>,
       "createdAt": "iso"
     }
   ]
   ```
   Adicionar `drawings: []` ao schema de frame na Fase B.
5. **Sincronização real-time (Socket.IO):**
   - Durante o desenho: emit `op: stroke_progress` a cada ~50ms (throttle) com os últimos pontos coletados → outros clientes renderizam um stroke "fantasma" progressivamente
   - Ao soltar: emit `op: stroke_commit` (ou `arrow_commit`) com o objeto final, substituindo o fantasma
   - Outros usuários do mesmo frame veem o desenho aparecer com latência < 200ms
   - Edição/remoção: `op: delete_drawing`, `op: clear_frame_drawings`
6. **Edição local:**
   - Clicar sobre um desenho → selecionado (highlight)
   - DEL ou Eraser → remove
   - Botão "Limpar desenhos deste frame" (com confirmação) no painel direito
7. **Permissões:** mesma regra das outras operações de canvas — só membros ativos no prog (`can_edit_plan`)

### Critério de aceite

- 2 usuários editando ao mesmo tempo veem o traço um do outro aparecendo progressivamente
- Modo Arrow gera uma seta limpa (não a polyline crua) — ponta visualmente clara
- Color picker funciona nos 3 temas (Clear Blue Crystal / Classic Dark / Warrior of Darkness)
- Desenhos pertencem ao frame: ao navegar pelos frames, desenhos somem/aparecem corretamente
- DEL + Eraser removem desenhos selecionados; "Limpar" remove todos do frame com confirmação

---

# PARTE 3 — Fases Concluídas (histórico)

## Fase J — Detalhes do Evento (`description` + botão "Detalhes") ✅

**Concluída em** [PR #19](https://github.com/oscarothon/ffxiv-raid-planner/pull/19) · commit `462bb75`

**Objetivo:** permitir que o criador do evento OU um officer/admin anote uma descrição livre para cada evento agendado (objetivos da sessão, observações de composição, regras específicas de loot, links, etc), visível por todos via botão "Detalhes".

### Schema

1. Campo `description: string` em `raidEvent`, default `""`.
2. Validação client-side soft em ~2000 chars (com counter).

### Edição (criador + officer/admin)

3. Helper `canEditEventDetails(evt)`: criador OU officer.
4. `<textarea>` no modal de agendamento (só visível para quem tem permissão).
5. Botão "Salvar" persiste `description`.

### Visualização (qualquer membro da static)

6. Botão "Detalhes" no card do Quick Schedule, só se há descrição.
7. Indicador clicável discreto na célula do calendário mensal.
8. Modal de leitura com `white-space: pre-wrap` e escape de HTML.

---

## Fase K — Listagem de "Talvez / Atraso" na Mensagem de Atenção ✅

**Concluída em** [PR #18](https://github.com/oscarothon/ffxiv-raid-planner/pull/18) · commit `03b9628`

**Objetivo:** listar nicks dos titulares/reservas com status `late` explicitamente, deixando claro que o status é incerto.

1. Coleta `tLateNames` e `rLateNames` separadamente.
2. Nova mensagem: `Status incerto (Talvez/Atraso) — não confirmados: <lista>`.
3. Quórum continua contando `late` como confirmação parcial (Opção A escolhida).

> **Revisão prevista na Fase Q:** o conceito de "late" será removido. A mensagem passa a usar só "Talvez". Atraso passa a ser expresso por um range que começa depois do `event.time`.

---

## Fase L — Aviso de Quórum Potencial (Sugestão de Full Party) ✅

**Concluída em** [PR #18](https://github.com/oscarothon/ffxiv-raid-planner/pull/18) · commit `ab9bd0f`

**Objetivo:** quando 8+ jogadores marcam disponibilidade num dia *sem evento agendado*, alertar admin/officer no painel principal e via Telegram.

1. Função `evaluate_quorum_opportunities(state)` em `app.py`.
2. Persistência da flag em `state.quorumSuggestionsSent` (dedup por data).
3. Telegram envia `format_quorum_suggestion(date_str, count)`.
4. Painel principal mostra seção "Oportunidades de agendamento" para officer/admin.

> **Revisão prevista na Fase Q:** a lógica "8+ disponíveis num dia" vira "janela de overlap de ≥ X minutos com 8+ pessoas". Mensagem do Telegram passa a sugerir janela horária específica: `"Oportunidade: sexta 20:30–22:30, 8 disponíveis (2h)."` Botão "Agendar" passa o horário sugerido pré-preenchido no modal.

---

## Fase M — Avisos de Adiamento e Cancelamento no Telegram ✅

**Concluída em** [PR #18](https://github.com/oscarothon/ffxiv-raid-planner/pull/18) · commit `d10f1a7`

**Objetivo:** mensagem de adiamento agora inclui a data anterior; deleção de evento dispara mensagem de cancelamento.

1. `format_event_postponed(prog_name, old_date_str, new_date_str)` — inclui "de X para Y".
2. `format_event_cancelled(prog_name, date_str)` — nova função.
3. `_notify_new_raid_events` detecta eventos deletados (ids ausentes em `new_events`).
4. Edge case: remoção em massa quando prog inteiro é deletado — Opção A (supressão por threshold) implementada.

> **Revisão prevista na Fase Q:** templates de adiamento/cancelamento passam a incluir hora (`event.time`) quando presente. Format: `"DSR foi adiada de sexta 20:30 para sábado 21:00."` Quando `time === null`, mantém o formato atual sem horário.

---

## Fase N — Catálogo de Expansões (dropdown + level cap editável) ✅

**Concluída em** [PR #21](https://github.com/oscarothon/ffxiv-raid-planner/pull/21) · commit `ad60326`

**Objetivo:** transformar `expansion` (texto livre em conteúdos) em entidade do estado com level cap próprio. Permite dropdown na criação, edição admin do level cap e abre caminho para a Fase P (validação por expansão).

### Schema

1. Novo `state.expansions`: array de `{ id, name, levelCap, order, isLimited?: boolean }`. Seed inicial em `hydrateState` com ARR (50) → DT (100) + Limited Job.
2. Built-ins (`FFXIV_RAIDS`/`FFXIV_ULTIMATES`/`FFXIV_LIMITED_CONTENTS`) migrados de `expansion` (string) → `expansionId` (referência ao catálogo).

### Retrocompat — converter conteúdos existentes (estratégia em camadas)

3. Customs com `expansion` (string) são convertidos para `expansionId` no `hydrateState` via `resolveContentExpansionId`. Camadas: (a) match exato → (b) aliases (ARR/HW/SB/ShB/EW/DT + variações como "Shadow Bringers", "Dawn Trail") → (c) heurística por nome do conteúdo (Pandæmonium → ew, Arcadion → dt, DSR/TOP → ew, FRU → dt, Eden → shb, Omega → sb, Alexander → hw, UCOB → hw, UWU → sb, TEA → shb) → (d) fallback permissivo para expansão mais recente.
4. Nenhum conteúdo fica "Sem expansão definida".
5. Estratégia exposta em `EXPANSION_ALIASES` + `CONTENT_NAME_EXPANSION_HINTS` em `data.js` — reaproveitável pela Fase O para `character.currentExpansion`.

### UI

6. `<input id="inp-cc-expansion">` substituído por `<select id="sel-cc-expansion">` populado de `state.expansions` ordenado por `order`. Última opção: `+ Nova expansão` → form inline (nome + level cap).
7. `handleCreateCustomContent` salva `expansionId` no custom.
8. Helper `getExpansionDisplayName(content)` usado nos pontos de leitura (card do prog ativo, picker, content manager).
9. Modal "Gerenciamento de Conteúdos" ganha seção **Expansões cadastradas**: edição inline de level cap + contador de conteúdos vinculados + remoção (bloqueada para Limited Job e para expansões com vinculados).
10. Nova expansão criada via dropdown entra logo após a última normal; Limited Job é reposicionada para ficar sempre no fim.

---

## Fase O — Aba Personagem (parte 1) ✅

**Concluída em** [PR #23](https://github.com/oscarothon/ffxiv-raid-planner/pull/23) · commit `cdc47f0`

**Objetivo:** introduzir o conceito de "personagem" 1:1 com o usuário (`users.character_json`), independente da static — abre caminho para alts/multi-static e para a Fase P (validação por expansão). O refactor da aba Party para passar a ler identidade do `character_json` ficou para a **Fase O.2**.

### Backend

1. `ALTER TABLE users ADD COLUMN character_json TEXT` (migração idempotente em `server/db.py`).
2. Migração automática no startup: para cada user sem `character_json`, deriva do primeiro slot encontrado no roster de qualquer static onde participa (`name`, `ilvl`, `jobs` a partir de `jobsPool`, `subscribedProgs` a partir de `statusByProg`). `currentExpansionId` fica `null` — usuário define depois.
3. Endpoints `GET /api/character` e `PUT /api/character` (auth required, validação de tamanho e tipos básicos).

### Frontend

4. Aba "Membros (Roster)" renomeada para **Party** (`data-tab="party"`, `id="party-tab"`).
5. Nova aba **Personagem** entre Party e Equipamentos, com 3 seções modulares (`.ff-panel` cada):
   - **Identidade** — nome + expansão atual (dropdown de `state.expansions`) + ilvl
   - **Classes** — grid das 21 jobs + BLU. Click toggla seleção; input opcional de level por classe (visível só nas selecionadas)
   - **Progs ativos** — checkboxes dos progs ativos da static (subscrição)
6. Salvamento via `PUT /api/character` debounced (400ms) + indicador "Salvo" com fade-out.
7. Hook no tab switcher para re-renderizar a aba ao entrar (reflete novos progs ativos).

### Polimento: tabs responsivas

8. `.tab-btn` ganhou `flex: 1`, `clamp()` para `padding`/`font-size`/`letter-spacing`, e `overflow-wrap: anywhere` para que as 5 abas (Visão Geral, Party, Personagem, Equipamentos, Agenda Semanal) fiquem legíveis em mobile (375px) sem cortar texto, e cresçam suavemente até desktop.

---

## Sobre o bot do Telegram — você precisa fazer algo? (Fases L e M)

**Não.** O bot hoje é send-only ([server/telegram.py](server/telegram.py)) — as fases L e M reutilizam o mesmo fluxo dos lembretes existentes. Você **não** precisa:

- Criar comandos novos no BotFather
- Mexer no webhook ou no secret
- Mudar permissões do bot no grupo do Telegram

**Único pré-requisito** (que provavelmente já está atendido se os lembretes 24h/dia já funcionam): a static precisa estar com `telegram_chat_id` salvo no banco. Se algum dia o bot for removido do grupo, basta re-adicionar e configurar o `chat_id` novamente.

---

# Apêndices

## Considerações Arquiteturais (Strategy Planner)

### Por que Flask-SocketIO?

- **Latência**: < 100ms entre clientes (vs. ~5s do polling atual)
- **Bi-direcional**: pub/sub natural para múltiplos editores
- **Maduro no ecossistema Python**: ~10 anos, bem testado em produção
- **Railway compatível**: roda em workers `eventlet` ou `gevent`

### Conflitos & Last-Write-Wins

- Toda operação tem `clientId` + `opId` (uuid)
- Server processa em ordem de chegada e broadcastiha pra sala
- Sem CRDT por enquanto (overkill pra escopo de party de 8 pessoas)
- Em caso de conflito (ex: 2 usuários movem o mesmo token): última operação vence

### Performance

- Throttle de `token_move` no client (50ms)
- Estado completo persistido a cada N segundos OU ao fim do drag
- Snapshot via REST como fallback se WS reconectar perdido

### Mobile

- MVP é desktop-first (drag complexo em mobile é problemático)
- Visualização mobile (read-only) considerada em fase futura, fora deste plano

---

## Estimativa Total

| Fase | Esforço estimado |
|---|---|
| P | 1-2 sessões (Sonnet) — lógica em múltiplos lugares (front + back) |
| Q | 3-4 sessões (Opus) — widget de horas + overlap + modal + revisão K/L/M |
| O.2 | 1-2 sessões (Sonnet) — refactor leitura na Party para usar `character_json` |
| **Subtotal app principal** | **~5-8 sessões** |
| A | 2-3 sessões (Opus) |
| B | 3-4 sessões (Opus) |
| C | 3-4 sessões (Opus) |
| D | 2 sessões (Opus) |
| E | 1 sessão (Sonnet) |
| F | 1 sessão (Sonnet) |
| G | 2 sessões (Sonnet) |
| H | 1-2 sessões (Sonnet) |
| I | 2 sessões (Opus) |
| **Subtotal Strategy Planner** | **~17-21 sessões** |
| J, K, L, M, N, O | ✅ concluídas |
| **Total restante** | **~22-29 sessões** |

Cada fase resulta em PR separado para `main`, seguindo o mesmo padrão do roadmap V1.

---

## Inspirações & Referências

- [raidplan.io](https://raidplan.io) — UX de referência (canvas, timeline, painel de propriedades) — para o Strategy Planner
- [When2meet](https://when2meet.com) / [Doodle](https://doodle.com) — UX de referência (grade click+drag de horas) — para a Fase Q
- [xivapi.com](https://xivapi.com) — CDN de assets oficiais do FFXIV
- [Flask-SocketIO docs](https://flask-socketio.readthedocs.io/) — guia oficial

---

## Próximo passo

Iniciar **Fase P** quando o usuário confirmar. Branch: `feature/fase-P-validacao-expansao`.
