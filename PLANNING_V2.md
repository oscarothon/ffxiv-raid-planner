# Planejamento de Features V2 — Visual Strategy Planner

> Roadmap V1 (17 fases originais) concluído em 2026-05-18 — consulte `PLANNING_V1.md` para o histórico.

Stack atual: Vanilla JS + Flask + SQLite, persistido em `statics.data_json`. Real-time atual: polling com ETag (5s).

**Produção:** https://mhigos-raid-planner.up.railway.app (Railway, volume persistente em `/data`)

---

## Visão Geral

Adicionar uma nova aba **"Estratégias"** com um editor visual de canvas (estilo [raidplan.io](https://raidplan.io)) para planejar mecânicas das lutas. Recursos principais:

- Canvas SVG com arena circular + grid configurável
- Tokens de jogadores arrastáveis (usando os ícones de job da party ativa do prog vinculado)
- Marcação de AOEs (circles, donuts, cones, stacks) e waymarks (A-D, 1-4)
- **Colaboração em tempo real** — múltiplos membros da party editam simultaneamente com visualização instantânea via WebSocket
- Timeline multi-step (frames) para sequenciar mecânicas
- Light Party split visual em conteúdos Full Party (8p)
- Múltiplas arenas (círculo, quadrado, octógono…) ao longo das fases

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

| # | Fase | Descrição | Modelo sugerido |
|---|------|-----------|:---:|
| A | Foundation | Backend WebSocket (Flask-SocketIO) + tabela `plans` + permissões | Opus |
| B | Canvas Core | Arena SVG circular + grid + tokens de jogadores draggáveis (real-time) | Opus |
| C | AOEs & Marcas | Toolbar de AoE shapes, waymarks A-D / 1-4, target markers | Opus |
| D | Timeline | Multi-step (frames) com snapshot por frame + navegação | Opus |
| E | Plan Manager | UI de listagem/criação/renomeação/deleção de planos por prog | Sonnet |
| F | Light Party Split | Split visual 8p → LP1 (1-4) + LP2 (5-8) em conteúdos Full Party | Sonnet |
| G | Arenas Adicionais | Quadrado, octógono, upload de background customizado | Sonnet |
| H | Assets & Polimento | Mirror dos ícones FFXIV, criação dos SVGs de AOE próprios, melhorias visuais | Sonnet |

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
4. **Tokens de jogador**:
   - Renderizar 1 token por slot da party ativa do prog (`getPlayerStatusForProg === "active"`)
   - Cada token = círculo + ícone do job principal atribuído + nome abaixo
   - Posição inicial: distribuição circular dentro da arena
   - Drag-and-drop (mouse + touch) com snap-to-grid opcional
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

## Fase D — Timeline Multi-step (Frames)

**Objetivo:** sequenciar mecânicas. Cada "frame" é um momento da luta com posições e AoEs específicas.

1. **Barra de timeline** abaixo do canvas:
   - Lista horizontal de chips: `[1] [2] [3] [+]`
   - Cada chip tem um nome editável (ex: "Spread", "Stack", "Resolve")
   - Chip ativo destacado
2. **Ações por frame**:
   - **Adicionar**: cria frame novo, opção "duplicar do anterior" ou "vazio"
   - **Deletar**: remove frame (não pode deletar o último)
   - **Reordenar**: drag-and-drop entre chips
   - **Renomear**: double-click → input inline
3. **Navegação**:
   - Setas ◀ ▶ no canvas ou teclado
   - Cada frame guarda **snapshot completo** de `tokens`, `aoes`, `marks`
4. **Botão "Duplicar como próximo"**: clona o frame atual e abre o duplicado para edição
5. **Sincronização**:
   - `op: add_frame`, `op: delete_frame`, `op: rename_frame`, `op: set_current_frame`
   - Mudança de frame ativo é por usuário (não broadcast) — cada um navega independentemente
   - Edições no frame são broadcast pra sala

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
| **Total** | **~15-20 sessões** |

Cada fase resulta em PR separado para `main`, seguindo o mesmo padrão do roadmap V1.

---

## Inspirações & Referências

- [raidplan.io](https://raidplan.io) — UX de referência (canvas, timeline, painel de propriedades)
- [xivapi.com](https://xivapi.com) — CDN de assets oficiais do FFXIV
- [Flask-SocketIO docs](https://flask-socketio.readthedocs.io/) — guia oficial

---

## Próximo passo

Iniciar **Fase A** quando o usuário confirmar. Branch: `feature/fase-A-realtime-foundation`.
