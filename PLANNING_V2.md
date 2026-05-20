# Planejamento de Features V2 — Visual Strategy Planner

> Roadmap V1 (17 fases originais) concluído em 2026-05-18 — consulte `PLANNING_V1.md` para o histórico.

Stack atual: Vanilla JS + Flask + SQLite, persistido em `statics.data_json`. Real-time atual: polling com ETag (5s).

**Produção:** https://mhigos-raid-planner.up.railway.app (Railway, volume persistente em `/data`)

---

## Visão Geral

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

## Tabela Resumo

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
| J | Detalhes do Evento | Campo `description` em `raidEvent` + botão "Detalhes" + permissões | ✅ | Sonnet |
| K | Lista Talvez/Atraso | Listar nicks na mensagem de atenção (status incerto, não confirmados) | ✅ | Sonnet |
| L | Aviso de Quórum 8+ | Sugestão de Full Party para officer/admin quando 8+ disponíveis em dia sem evento | ✅ | Sonnet |
| M | Avisos Adiamento/Cancelamento | Melhora mensagem de adiamento (inclui data antiga) + novo aviso de cancelamento no Telegram | ✅ | Sonnet |

> **Fases A-I**: Strategy Planner (canvas). **Fases J-M**: features adjacentes do app principal (eventos, alertas, Telegram).
> Legenda: ✅ concluído · ⏳ pendente

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

## Fase J — Detalhes do Evento (`description` + botão "Detalhes") ✅

**Concluída em** [PR #19](https://github.com/oscarothon/ffxiv-raid-planner/pull/19) · commit `462bb75`

**Objetivo:** permitir que o criador do evento OU um officer/admin anote uma descrição livre para cada evento agendado (objetivos da sessão, observações de composição, regras específicas de loot, links, etc), visível por todos via botão "Detalhes".

### Schema

1. Adicionar campo `description: string` ao objeto `raidEvent` criado em [js/app.js:1644](js/app.js:1644). Default `""`. Sem migração necessária (campos faltantes em eventos antigos são tratados como `""`).
2. Sem limite duro no MVP, mas validação client-side soft em ~2000 chars (com counter).

### Edição (criador + officer/admin)

3. Novo helper de permissão em [js/app.js:177-197](js/app.js:177):
   ```js
   function canEditEventDetails(evt) {
     if (!evt) return false;
     return currentUserId === evt.createdBy || isOfficer();
   }
   ```
4. No `openScheduleModal` ([js/app.js:1683](js/app.js:1683)), adicionar `<textarea>` ao final do modal:
   - Label: "Detalhes do evento (opcional)"
   - Placeholder: "Objetivos da sessão, observações sobre composição, regras de loot…"
   - Counter de chars
   - Só aparece se `canEditEventDetails(evt)` (criador ou officer)
5. Botão "Salvar" do modal persiste `description` junto com `progId`/`quorum`.

### Visualização (qualquer membro da static)

6. **Card no Quick Schedule** ([js/app.js:2180](js/app.js:2180)): adicionar botão pequeno `Detalhes` no header do bloco do evento. Estilo `.ff-btn` em variante mini. **Só aparece se `evt.description.trim() !== ""`**.
7. **Célula do calendário mensal**: adicionar indicador clicável discreto (ex: ícone pequeno tipo "📄" ou um traço gráfico) na célula do dia agendado quando há descrição. Clicar abre o mesmo modal de leitura.
8. **Modal de leitura** (`modal-event-details` em [index.html](index.html)):
   - Header: `<nome do prog> — <data formatada>`
   - Body: descrição renderizada com `white-space: pre-wrap` (preserva quebras de linha) e escape de HTML (evita XSS)
   - Botão "Editar" no rodapé apenas se `canEditEventDetails(evt)` — abre `openScheduleModal` no estado de edição

### Critério de aceite

- Criador consegue editar; officer/admin também; outros membros só leem
- Botão "Detalhes" só aparece quando há texto
- Renderização preserva quebras de linha e escapa HTML
- Indicador de descrição visível no calendário mensal nos dias com evento+descrição
- Persiste no banco (`statics.data_json`)

---

## Fase K — Listagem de "Talvez / Atraso" na Mensagem de Atenção ✅

**Concluída em** [PR #18](https://github.com/oscarothon/ffxiv-raid-planner/pull/18) · commit `03b9628`

**Objetivo:** a mensagem atual em [js/app.js:2218](js/app.js:2218) ("Atenção: há titulares com status 'Talvez / Atraso'") é genérica e ainda dá a impressão de que essas pessoas estão confirmadas. Listar os nicks explicitamente e deixar claro que o status é **incerto**.

1. **Coletar lista separada** no loop de [js/app.js:2156-2169](js/app.js:2156):
   - Substituir `tLate: boolean` por `tLateNames: []` (titulares com `late`)
   - Adicionar `rLateNames: []` (reservas com `late`) — também relevante para o officer saber
   - Quem está em `avail` continua contando para o quórum como hoje
2. **Nova mensagem de atenção** substituindo a linha 2218:
   ```js
   if (tLateNames.length > 0 || rLateNames.length > 0) {
     const all = [...tLateNames, ...rLateNames];
     alertsHtml += `<div style="...">
       Status incerto (Talvez/Atraso) — não confirmados: ${all.join(", ")}
     </div>`;
   }
   ```
3. **Decisão em aberto a confirmar no início da fase:** atualmente o quórum (`if (sVal === "avail" || sVal === "late")` em [js/app.js:2158](js/app.js:2158)) **conta `late` como confirmação**. Isso pode estar inflando o quórum percebido. Validar com o usuário se:
   - **Opção A**: manter como está (late conta, mas avisa) — fase só lista os nomes
   - **Opção B**: parar de contar `late` no quórum, e listar separadamente "Confirmados: X, Incerto: Y"
   - Recomendação: **Opção B** — mais honesto sobre o estado real do dia.

### Critério de aceite

- Listagem clara dos nicks com status `late`
- Copy deixa explícito que esses jogadores **não estão confirmados**
- Mensagem aparece tanto para titulares quanto para reservas com `late`
- Comportamento de quórum: alinhado com a decisão da Opção A ou B (validar)

---

## Fase L — Aviso de Quórum Potencial (Sugestão de Full Party) ✅

**Concluída em** [PR #18](https://github.com/oscarothon/ffxiv-raid-planner/pull/18) · commit `ab9bd0f`

**Objetivo:** quando houver **≥8 jogadores** marcando disponibilidade num dia *sem evento agendado*, alertar admin/officer (no painel principal e via Telegram) que podem agendar uma raid Full Party. O alerta considera **qualquer membro do roster** (titular ou banco/reserva) — o que importa é ter gente o suficiente disponível.

### Backend (Python — em `app.py` + novo helper)

1. Nova função `evaluate_quorum_opportunities(state)` que roda ao fim de cada `save_state`:
   - Itera dias futuros nos próximos N dias (ex: 14)
   - Para cada `dateKey`:
     - **Pular** se já existe `raidEvent` para esse dia (alinhado com a decisão "só em dias sem evento")
     - `count = nº de roster (titular OU reserva) com monthlySchedule[dateKey] === "avail"` (apenas `avail`, **não conta `late`** — incertos não disparam alerta no grupo)
     - Se `count >= 8` E `state.quorumSuggestionsSent[dateKey]` ainda não está marcado:
       - Marca `state.quorumSuggestionsSent[dateKey] = true`
       - Envia `format_quorum_suggestion(date_str, count)` via `send_group_message(chat_id, ...)`
2. **Persistência da flag:**
   - Novo campo `state.quorumSuggestionsSent: { "2026-05-30": true, "2026-06-02": true }`
   - Limpar entradas com data passada na mesma função (housekeeping)
3. **Dedup:** uma vez por data. Se cair de 8→7→8, **não re-envia** — evita spam no grupo.

### Telegram — nova mensagem em [server/telegram.py](server/telegram.py)

4. ```python
   def format_quorum_suggestion(date_str, count):
       pretty = _format_date(date_str)
       return (
           f"<b>Oportunidade de raid</b>\n"
           f"{pretty}: {count} pessoa(s) disponíveis.\n"
           f"Possível agendar uma Full Party (8p).\n\n"
           f"Agende em {SITE_URL}."
       )
   ```

### Painel principal (UI) — apenas para officer/admin

5. Nova seção no topo do `quick-schedule-list` em [js/app.js:2103](js/app.js:2103) (ou bloco próprio acima):
   - Título: "Oportunidades de agendamento"
   - Para cada dia nos próximos 14 dias **sem evento** e com `count >= 8`:
     - Linha: `<data> — N pessoas disponíveis (Full Party possível) — [Agendar]`
     - Botão "Agendar" abre `openScheduleModal(dateKey)`
6. **Visibilidade**: só renderiza para `isOfficer()`. Membros comuns não veem essa seção.
7. **Se não há oportunidades**: seção fica oculta (sem placeholder vazio).

### Critério de aceite

- Dia com 8+ disponíveis (sem evento, contando titular + banco) → aparece para officer/admin na main page
- Dia com 7 ou menos → não aparece
- Telegram envia exatamente 1 mensagem por data ao cruzar 8
- Se cair de 8→7→8, **não** re-envia
- Se já há evento agendado para o dia, nem painel nem Telegram avisam
- Botão "Agendar" abre o modal já preenchido com a data correta

---

## Fase M — Avisos de Adiamento e Cancelamento no Telegram ✅

**Concluída em** [PR #18](https://github.com/oscarothon/ffxiv-raid-planner/pull/18) · commit `d10f1a7`

**Objetivo:** o aviso de adiamento já existe em [server/app.py:790-795](server/app.py:790) mas a mensagem atual omite a data anterior. Além disso, **cancelamento (deleção de evento) hoje não dispara nenhuma notificação**. Esta fase corrige os dois.

### Adiamento — incluir data anterior na mensagem

1. Modificar assinatura de [`format_event_postponed`](server/telegram.py:109) para receber também a data antiga:
   ```python
   def format_event_postponed(prog_name, old_date_str, new_date_str):
       old_pretty = _format_date(old_date_str)
       new_pretty = _format_date(new_date_str)
       return (
           f"<b>Raid adiada</b>\n"
           f"{prog_name} foi adiada de {old_pretty} para {new_pretty}.\n\n"
           f"Confirme sua presença em {SITE_URL}."
       )
   ```
2. Em [server/app.py:794](server/app.py:794), passar a data anterior. O `old_evt` já está disponível no escopo (`old_by_id[evt_id]`):
   ```python
   old_target = old_evt.get("postponedTo") or old_evt.get("date")
   msg = tg.format_event_postponed(prog_name, old_target, evt.get("postponedTo"))
   ```
3. Observação: se o evento foi adiado várias vezes, `old_target` é sempre a data **anterior ao adiamento atual** (não a data original do agendamento). Isso é o comportamento desejado — o grupo precisa saber de onde *está saindo* a raid agora.

### Cancelamento — nova função + detecção em `_notify_new_raid_events`

4. Nova função em [server/telegram.py](server/telegram.py):
   ```python
   def format_event_cancelled(prog_name, date_str):
       pretty = _format_date(date_str)
       return f"<b>Raid cancelada</b>\n{prog_name} — {pretty}."
   ```
5. Modificar [`_notify_new_raid_events`](server/app.py:769) para também detectar **eventos deletados** — ids que estão em `old_events` mas não em `new_events`:
   ```python
   new_ids = {e.get("id") for e in (new_events or []) if isinstance(e, dict)}
   for old_evt in (old_events or []):
       if not isinstance(old_evt, dict):
           continue
       if old_evt.get("id") not in new_ids:
           prog_name = old_evt.get("progName") or old_evt.get("progId") or "Raid"
           target_date = old_evt.get("postponedTo") or old_evt.get("date")
           msg = tg.format_event_cancelled(prog_name, target_date)
           tg.send_group_message(chat_id, msg)
   ```

### Edge case — remoção em massa quando um prog inteiro é deletado

6. Quando um prog é removido da static ([js/app.js:2774](js/app.js:2774)), **todos os seus eventos futuros são apagados de uma vez**. Sem proteção, isso disparaaria múltiplas mensagens de cancelamento no grupo.
7. **Decisão a tomar durante a fase** (validar com usuário):
   - **Opção A — supressão por threshold**: se houver >2 cancelamentos no mesmo `save_state`, suprimir todos e enviar 1 mensagem agregada ("X raids canceladas — prog removido"). Simples e seguro.
   - **Opção B — sem proteção**: cada evento gera 1 mensagem. Pode poluir o grupo se um prog tinha muitos eventos futuros, mas é raro.
   - Recomendação: **Opção A** com threshold de 2.

### Critério de aceite

- Adiar uma raid: Telegram recebe mensagem mencionando **de X para Y**
- Cancelar uma raid: Telegram recebe mensagem de cancelamento com data + prog
- Adiar uma raid já adiada: mensagem mostra "de [data atual antes do novo adiamento] para [nova data]"
- Remover um prog inteiro com N eventos futuros: ou 1 mensagem agregada (Opção A) ou N mensagens (Opção B), conforme decisão

---

## Sobre o bot do Telegram — você precisa fazer algo? (Fases L e M)

**Não.** O bot hoje é send-only ([server/telegram.py](server/telegram.py)) — as fases L e M reutilizam o mesmo fluxo dos lembretes existentes. Você **não** precisa:

- Criar comandos novos no BotFather
- Mexer no webhook ou no secret
- Mudar permissões do bot no grupo do Telegram

**Único pré-requisito** (que provavelmente já está atendido se os lembretes 24h/dia já funcionam): a static precisa estar com `telegram_chat_id` salvo no banco. Se algum dia o bot for removido do grupo, basta re-adicionar e configurar o `chat_id` novamente.

---

## Considerações Arquiteturais

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
| A | 2-3 sessões (Opus) |
| B | 3-4 sessões (Opus) |
| C | 3-4 sessões (Opus) |
| D | 2 sessões (Opus) |
| E | 1 sessão (Sonnet) |
| F | 1 sessão (Sonnet) |
| G | 2 sessões (Sonnet) |
| H | 1-2 sessões (Sonnet) |
| I | 2 sessões (Opus) — desenho + sync + color picker |
| J | ✅ concluída (PR #19) |
| K | ✅ concluída (PR #18) |
| L | ✅ concluída (PR #18) |
| M | ✅ concluída (PR #18) |
| **Total restante** | **~16-21 sessões** |

Cada fase resulta em PR separado para `main`, seguindo o mesmo padrão do roadmap V1.

---

## Inspirações & Referências

- [raidplan.io](https://raidplan.io) — UX de referência (canvas, timeline, painel de propriedades)
- [xivapi.com](https://xivapi.com) — CDN de assets oficiais do FFXIV
- [Flask-SocketIO docs](https://flask-socketio.readthedocs.io/) — guia oficial

---

## Próximo passo

Iniciar **Fase A** quando o usuário confirmar. Branch: `feature/fase-A-realtime-foundation`.
