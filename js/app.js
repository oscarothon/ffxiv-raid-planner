// Lógica da Aplicação - FFXIV Static Raid Planner

// Estado Inicial Padrão (Mock Premium para impressionar no primeiro uso)
const DEFAULT_STATE = {
    staticName: "Static Arcadion Vanguards",
    theme: "dark", // 'dark' ou 'classic'
    sfx: true,
    contentType: "raid",
    selectedEncounter: "arcadion_lh",
    selectedLootTier: "M1S",
    roster: [
        { name: "Tank Principal", job: "WAR", ilvl: 715, bis: true },
        { name: "Off Tank", job: "PLD", ilvl: 710, bis: false },
        { name: "Healer Puro", job: "WHM", ilvl: 712, bis: false },
        { name: "Healer Escudo", job: "SCH", ilvl: 715, bis: true },
        { name: "Melee DPS 1", job: "VPR", ilvl: 720, bis: true },
        { name: "Melee DPS 2", job: "RPR", ilvl: 714, bis: false },
        { name: "Ranged Físico", job: "DNC", ilvl: 711, bis: false },
        { name: "Magical Caster", job: "PCT", ilvl: 718, bis: true }
    ],
    // Agenda Semanal: 0 = Disponível, 1 = Atraso, 2 = Ausente
    schedule: [
        [0, 0, 2, 0, 0, 0, 0], // Player 0 (Seg a Dom)
        [0, 0, 0, 0, 1, 0, 0], // Player 1
        [0, 0, 0, 0, 0, 0, 2], // Player 2
        [0, 0, 0, 0, 0, 0, 0], // Player 3
        [1, 0, 0, 0, 0, 0, 0], // Player 4
        [0, 0, 0, 0, 0, 0, 0], // Player 5
        [0, 0, 0, 2, 0, 0, 0], // Player 6
        [0, 0, 0, 0, 0, 0, 0]  // Player 7
    ],
    // Rastreador de Loot por Tier/Encontro
    loot: {
        "M1S": [
            { acc: true, armor: false, weapon: false, mount: false },
            { acc: false, armor: true, weapon: false, mount: false },
            { acc: true, armor: false, weapon: false, mount: false },
            { acc: false, armor: false, weapon: false, mount: false },
            { acc: true, armor: true, weapon: false, mount: false },
            { acc: false, armor: false, weapon: false, mount: false },
            { acc: false, armor: false, weapon: false, mount: false },
            { acc: true, armor: false, weapon: false, mount: false }
        ]
    },
    macroText: "/p ⚠️ --- Estratégia de Posições (Clock Positions) ---\n/p [T1] Norte  | [T2] Sul\n/p [H1] Oeste  | [H2] Leste\n/p [M1] NO     | [M2] NE\n/p [R1] SO     | [R2] SE\n/p ⚔️ Bom jogo e foco nas mecânicas!",
    strategyNotes: "https://www.youtube.com/@hectorhectorson"
};

// Variável de Estado da Aplicação
let state = {};

// ==========================================================================
// Sistema de Efeitos Sonoros FFXIV (Web Audio API Synthesizer)
// ==========================================================================
let audioCtx = null;

function playSfx(type) {
    if (!state.sfx) return;
    
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Retoma o contexto caso o navegador tenha bloqueado
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === 'click') {
            // Som curto e agudo de clique de menu FFXIV
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.04);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'tab') {
            // Som suave de troca de aba
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(660, now + 0.03);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.09);
        } else if (type === 'success') {
            // Som de confirmação / save
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.06); // E5
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.16);
        }
    } catch (e) {
        // Ignora erros caso o áudio não seja suportado
    }
}

// ==========================================================================
// Gerenciamento de Estado e Persistência
// ==========================================================================
function loadState() {
    const saved = localStorage.getItem("ffxiv_static_planner_state");
    if (saved) {
        try {
            state = JSON.parse(saved);
            // Preenche propriedades ausentes com base no DEFAULT_STATE
            state = { ...DEFAULT_STATE, ...state };
        } catch (e) {
            console.error("Erro ao carregar estado do localStorage", e);
            state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        }
    } else {
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
    
    // Aplica o tema inicial
    applyTheme();
}

function saveState() {
    localStorage.setItem("ffxiv_static_planner_state", JSON.stringify(state));
    updateDashboardStats();
}

function applyTheme() {
    if (state.theme === 'classic') {
        document.body.classList.add('theme-classic');
    } else {
        document.body.classList.remove('theme-classic');
    }
}

// ==========================================================================
// Renderizadores da Interface (Renderers)
// ==========================================================================

// Preenche o Select de Encontros (Raids ou Ultimates)
function renderEncounterOptions() {
    const selectEncounter = document.getElementById("select-encounter");
    selectEncounter.innerHTML = "";

    const isRaid = state.contentType === "raid";
    const list = isRaid ? FFXIV_RAIDS : FFXIV_ULTIMATES;

    list.forEach(item => {
        const opt = document.createElement("option");
        opt.value = item.id;
        opt.textContent = `${item.name} (${item.expansion})`;
        if (item.id === state.selectedEncounter) opt.selected = true;
        selectEncounter.appendChild(opt);
    });

    // Se o selecionado salvo não estiver na lista atual, reseta pro primeiro
    if (!list.some(i => i.id === state.selectedEncounter) && list.length > 0) {
        state.selectedEncounter = list[0].id;
    }

    updateSelectedContentDetails();
    renderLootTierOptions();
}

function updateSelectedContentDetails() {
    const isRaid = state.contentType === "raid";
    const list = isRaid ? FFXIV_RAIDS : FFXIV_ULTIMATES;
    const found = list.find(i => i.id === state.selectedEncounter);

    if (found) {
        document.getElementById("details-title").textContent = found.name;
        document.getElementById("details-expansion").textContent = `Expansão: ${found.expansion}`;
        document.getElementById("current-focus-text").textContent = found.name.split(":")[0].split("(")[0].trim();
    }
}

// Atualiza opções do select de Loot baseadas no encontro selecionado (se for Raid)
function renderLootTierOptions() {
    const selectLootTier = document.getElementById("select-loot-tier");
    selectLootTier.innerHTML = "";

    const isRaid = state.contentType === "raid";
    if (!isRaid) {
        selectLootTier.innerHTML = '<option value="none">Loot Não Aplicável (Ultimates dão Totem único)</option>';
        selectLootTier.disabled = true;
        renderLootTable();
        return;
    }

    selectLootTier.disabled = false;
    const foundRaid = FFXIV_RAIDS.find(i => i.id === state.selectedEncounter);
    const encounters = foundRaid && foundRaid.encounters ? foundRaid.encounters : ["Turno 1", "Turno 2", "Turno 3", "Turno 4"];

    encounters.forEach(enc => {
        const opt = document.createElement("option");
        opt.value = enc;
        opt.textContent = `${enc} - ${foundRaid.name.split("(")[0].trim()}`;
        if (enc === state.selectedLootTier) opt.selected = true;
        selectLootTier.appendChild(opt);
    });

    // Garante inicialização do estado de loot para o tier
    if (!selectLootTier.value) selectLootTier.value = encounters[0];
    state.selectedLootTier = selectLootTier.value;

    if (!state.loot[state.selectedLootTier]) {
        state.loot[state.selectedLootTier] = Array(8).fill(null).map(() => ({
            acc: false, armor: false, weapon: false, mount: false
        }));
    }

    renderLootTable();
}

// Renderiza a Tabela do Roster (Membros)
function renderRosterTable() {
    const tbody = document.getElementById("roster-tbody");
    tbody.innerHTML = "";

    state.roster.forEach((player, index) => {
        const tr = document.createElement("tr");

        // Identifica os dados do Job selecionado
        const jobData = FFXIV_JOBS.find(j => j.id === player.job) || FFXIV_JOBS[0];
        const roleData = FFXIV_ROLES[jobData.role] || FFXIV_ROLES.tank;

        tr.innerHTML = `
            <td style="font-weight: bold; color: var(--gold-muted);">#${index + 1}</td>
            <td>
                <input type="text" class="ff-input" value="${player.name}" data-index="${index}" data-field="name" placeholder="Jogador ${index + 1}">
            </td>
            <td>
                <span class="badge" style="background-color: ${roleData.color}33; color: ${roleData.color}; border: 1px solid ${roleData.color};">
                    ${roleData.icon} ${roleData.name}
                </span>
            </td>
            <td>
                <select class="ff-select job-select" data-index="${index}">
                    ${FFXIV_JOBS.map(j => `<option value="${j.id}" ${j.id === player.job ? 'selected' : ''}>${j.id} - ${j.name}</option>`).join('')}
                </select>
            </td>
            <td>
                <input type="number" class="ff-input" value="${player.ilvl}" min="1" max="999" data-index="${index}" data-field="ilvl" style="width: 80px;">
            </td>
            <td>
                <input type="checkbox" class="ff-checkbox bis-checkbox" data-index="${index}" ${player.bis ? 'checked' : ''} title="Marcar como Best in Slot">
            </td>
        `;

        tbody.appendChild(tr);
    });

    // Adiciona Event Listeners para os inputs gerados
    tbody.querySelectorAll("input[data-field='name']").forEach(inp => {
        inp.addEventListener("input", (e) => {
            const idx = parseInt(e.target.dataset.index);
            state.roster[idx].name = e.target.value;
            saveState();
            renderDashboardVisualizer();
            renderScheduleTable();
            renderLootTable();
        });
    });

    tbody.querySelectorAll("input[data-field='ilvl']").forEach(inp => {
        inp.addEventListener("input", (e) => {
            const idx = parseInt(e.target.dataset.index);
            state.roster[idx].ilvl = parseInt(e.target.value) || 0;
            saveState();
        });
    });

    tbody.querySelectorAll(".job-select").forEach(sel => {
        sel.addEventListener("change", (e) => {
            playSfx('click');
            const idx = parseInt(e.target.dataset.index);
            state.roster[idx].job = e.target.value;
            saveState();
            renderRosterTable(); // Re-renderiza para atualizar a badge da função (Role)
            renderDashboardVisualizer();
        });
    });

    tbody.querySelectorAll(".bis-checkbox").forEach(chk => {
        chk.addEventListener("change", (e) => {
            playSfx('click');
            const idx = parseInt(e.target.dataset.index);
            state.roster[idx].bis = e.target.checked;
            saveState();
        });
    });

    renderDashboardVisualizer();
}

// Renderiza a Agenda Semanal (Schedule)
const DAYS_OF_WEEK = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const SCHEDULE_STATUS = [
    { class: "status-avail", text: "✔️" },
    { class: "status-late", text: "⚠️" },
    { class: "status-unavail", text: "❌" }
];

function renderScheduleTable() {
    const tbody = document.getElementById("schedule-tbody");
    tbody.innerHTML = "";

    state.roster.forEach((player, pIndex) => {
        const tr = document.createElement("tr");
        
        // Coluna do Nome do Jogador
        const tdName = document.createElement("td");
        tdName.style.fontWeight = "600";
        tdName.textContent = player.name || `Jogador ${pIndex + 1}`;
        tr.appendChild(tdName);

        // Colunas dos Dias da Semana
        for (let dIndex = 0; dIndex < 7; dIndex++) {
            const statusVal = state.schedule[pIndex][dIndex] || 0;
            const statusObj = SCHEDULE_STATUS[statusVal];

            const tdDay = document.createElement("td");
            tdDay.className = `schedule-cell ${statusObj.class}`;
            tdDay.textContent = statusObj.text;
            tdDay.title = "Clique para alternar: Disponível -> Atraso -> Ausente";
            
            tdDay.addEventListener("click", () => {
                playSfx('click');
                // Alterna ciclicamente entre 0, 1 e 2
                state.schedule[pIndex][dIndex] = (statusVal + 1) % 3;
                saveState();
                renderScheduleTable();
                renderQuickSchedule();
            });

            tr.appendChild(tdDay);
        }

        tbody.appendChild(tr);
    });

    renderQuickSchedule();
}

// Renderiza os Próximos Dias de Raid no Dashboard
function renderQuickSchedule() {
    const container = document.getElementById("quick-schedule-list");
    container.innerHTML = "";

    // Para o resumo rápido, verificamos quantos membros estão disponíveis em cada dia
    DAYS_OF_WEEK.forEach((dayName, dIndex) => {
        let availCount = 0;
        let lateCount = 0;
        let unavailCount = 0;

        state.schedule.forEach(playerSched => {
            const s = playerSched[dIndex];
            if (s === 0) availCount++;
            else if (s === 1) lateCount++;
            else unavailCount++;
        });

        const isFullParty = availCount + lateCount === 8;
        const row = document.createElement("div");
        row.className = `schedule-day-row ${isFullParty ? 'active-raid' : ''}`;

        let statusHtml = "";
        if (isFullParty) {
            statusHtml = `<span class="day-status" style="background: var(--color-avail); color: #fff;">Raid Confirmada</span>`;
        } else if (availCount + lateCount >= 5) {
            statusHtml = `<span class="day-status" style="background: var(--color-late); color: #000;">Party Desfalcada (${availCount}/8)</span>`;
        } else {
            statusHtml = `<span class="day-status" style="background: rgba(255,255,255,0.1); color: var(--text-muted);">Sem Raid</span>`;
        }

        row.innerHTML = `
            <span class="day-name">${dayName}</span>
            ${statusHtml}
        `;
        container.appendChild(row);
    });
}

// Renderiza a Tabela de Loot
function renderLootTable() {
    const tbody = document.getElementById("loot-tbody");
    tbody.innerHTML = "";

    const isRaid = state.contentType === "raid";
    if (!isRaid) {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td colspan="5" class="text-center" style="color: var(--text-muted); padding: 20px;">O rastreamento de Loot Individual de Baús se aplica primariamente a Raids (Savage).</td>`;
        tbody.appendChild(tr);
        return;
    }

    const tier = state.selectedLootTier;
    const tierLoot = state.loot[tier] || [];

    state.roster.forEach((player, pIndex) => {
        const pLoot = tierLoot[pIndex] || { acc: false, armor: false, weapon: false, mount: false };
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td style="font-weight: 600;">${player.name || `Jogador ${pIndex + 1}`}</td>
            <td><input type="checkbox" class="ff-checkbox loot-chk" data-player="${pIndex}" data-item="acc" ${pLoot.acc ? 'checked' : ''}></td>
            <td><input type="checkbox" class="ff-checkbox loot-chk" data-player="${pIndex}" data-item="armor" ${pLoot.armor ? 'checked' : ''}></td>
            <td><input type="checkbox" class="ff-checkbox loot-chk" data-player="${pIndex}" data-item="weapon" ${pLoot.weapon ? 'checked' : ''}></td>
            <td><input type="checkbox" class="ff-checkbox loot-chk" data-player="${pIndex}" data-item="mount" ${pLoot.mount ? 'checked' : ''}></td>
        `;

        tbody.appendChild(tr);
    });

    tbody.querySelectorAll(".loot-chk").forEach(chk => {
        chk.addEventListener("change", (e) => {
            playSfx('click');
            const pIdx = parseInt(e.target.dataset.player);
            const itemType = e.target.dataset.item;
            state.loot[tier][pIdx][itemType] = e.target.checked;
            saveState();
        });
    });
}

// Renderiza os Cards de Membros no Dashboard
function renderDashboardVisualizer() {
    const container = document.getElementById("comp-visualizer");
    container.innerHTML = "";

    state.roster.forEach((player) => {
        const jobData = FFXIV_JOBS.find(j => j.id === player.job) || FFXIV_JOBS[0];
        
        const card = document.createElement("div");
        card.className = `member-mini-card role-${jobData.role}`;
        
        card.innerHTML = `
            <div class="job-badge">${player.job}</div>
            <div class="member-info">
                <div class="member-name" title="${player.name}">${player.name || 'Sem Nome'}</div>
                <div class="member-ilvl">iLvl: ${player.ilvl} ${player.bis ? '⭐ BiS' : ''}</div>
            </div>
        `;
        container.appendChild(card);
    });
}

// Atualiza Contadores Gerais do Dashboard
function updateDashboardStats() {
    // Contagem Roster
    const validCount = state.roster.filter(p => p.name && p.name.trim() !== "").length;
    document.getElementById("count-roster").textContent = `${validCount} / 8`;

    // Média iLvl
    const totalIlvl = state.roster.reduce((sum, p) => sum + (p.ilvl || 0), 0);
    const avg = Math.round(totalIlvl / 8);
    document.getElementById("avg-ilvl").textContent = avg || 0;
}

// ==========================================================================
// Inicialização e Controladores de Eventos (Event Listeners)
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    // 1. Carrega Estado
    loadState();

    // 2. Mapeia Inputs Básicos do Dashboard e Estratégias
    const staticNameInput = document.getElementById("static-name-input");
    staticNameInput.value = state.staticName;
    staticNameInput.addEventListener("input", (e) => {
        state.staticName = e.target.value;
        saveState();
    });

    const selectContentType = document.getElementById("select-content-type");
    selectContentType.value = state.contentType;
    selectContentType.addEventListener("change", (e) => {
        playSfx('click');
        state.contentType = e.target.value;
        renderEncounterOptions();
        saveState();
    });

    const selectEncounter = document.getElementById("select-encounter");
    selectEncounter.addEventListener("change", (e) => {
        playSfx('click');
        state.selectedEncounter = e.target.value;
        updateSelectedContentDetails();
        renderLootTierOptions();
        saveState();
    });

    const selectLootTier = document.getElementById("select-loot-tier");
    selectLootTier.addEventListener("change", (e) => {
        playSfx('click');
        state.selectedLootTier = e.target.value;
        renderLootTable();
        saveState();
    });

    const macroTextarea = document.getElementById("macro-textarea");
    macroTextarea.value = state.macroText;
    macroTextarea.addEventListener("input", (e) => {
        state.macroText = e.target.value;
        saveState();
    });

    const strategyNotesInput = document.getElementById("strategy-notes");
    strategyNotesInput.value = state.strategyNotes;
    strategyNotesInput.addEventListener("input", (e) => {
        state.strategyNotes = e.target.value;
        saveState();
    });

    // Botão Copiar Macro
    document.getElementById("btn-copy-macro").addEventListener("click", () => {
        navigator.clipboard.writeText(state.macroText).then(() => {
            playSfx('success');
            const btn = document.getElementById("btn-copy-macro");
            const originalText = btn.textContent;
            btn.textContent = "✔️ Copiado!";
            setTimeout(() => btn.textContent = originalText, 2000);
        });
    });

    // 3. Controles do Cabeçalho (Tema e Som)
    const btnThemeToggle = document.getElementById("btn-theme-toggle");
    btnThemeToggle.addEventListener("click", () => {
        playSfx('click');
        state.theme = state.theme === 'dark' ? 'classic' : 'dark';
        applyTheme();
        saveState();
    });

    const btnSoundToggle = document.getElementById("btn-sound-toggle");
    if (!state.sfx) btnSoundToggle.classList.remove("active");
    btnSoundToggle.addEventListener("click", () => {
        state.sfx = !state.sfx;
        btnSoundToggle.classList.toggle("active", state.sfx);
        playSfx('click');
        saveState();
    });

    // 4. Sistema de Navegação por Abas (Tabs)
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabPanes = document.querySelectorAll(".tab-pane");

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            playSfx('tab');
            const targetTab = btn.dataset.tab;

            tabButtons.forEach(b => {
                b.classList.remove("active");
                b.setAttribute("aria-selected", "false");
            });
            tabPanes.forEach(p => p.hidden = true);

            btn.classList.add("active");
            btn.setAttribute("aria-selected", "true");
            
            const targetPane = document.getElementById(`${targetTab}-tab`);
            if (targetPane) {
                targetPane.hidden = false;
            }
        });
    });

    // Botão de Reset do Roster
    document.getElementById("btn-reset-roster").addEventListener("click", () => {
        if (confirm("Tem certeza que deseja restaurar a Party original padrão? Seus dados de jogadores serão apagados.")) {
            state.roster = JSON.parse(JSON.stringify(DEFAULT_STATE.roster));
            state.schedule = JSON.parse(JSON.stringify(DEFAULT_STATE.schedule));
            saveState();
            renderRosterTable();
            renderScheduleTable();
            playSfx('success');
        }
    });

    // 5. Sistema de Modais (Exportar / Importar)
    const modalShare = document.getElementById("modal-share");
    const btnExportImport = document.getElementById("btn-export-import");
    const btnCloseModal = document.querySelector(".btn-close-modal");
    
    const btnShowExport = document.getElementById("btn-show-export");
    const btnShowImport = document.getElementById("btn-show-import");
    const exportArea = document.getElementById("export-area");
    const importArea = document.getElementById("import-area");
    
    const exportTextarea = document.getElementById("export-textarea");
    const importTextarea = document.getElementById("import-textarea");
    const importError = document.getElementById("import-error");

    btnExportImport.addEventListener("click", () => {
        playSfx('click');
        modalShare.hidden = false;
        // Preenche o JSON exportado atual
        exportTextarea.value = JSON.stringify(state, null, 2);
    });

    btnCloseModal.addEventListener("click", () => {
        playSfx('click');
        modalShare.hidden = true;
        importError.hidden = true;
    });

    // Fecha modal clicando fora
    modalShare.addEventListener("click", (e) => {
        if (e.target === modalShare) {
            modalShare.hidden = true;
            importError.hidden = true;
        }
    });

    btnShowExport.addEventListener("click", () => {
        playSfx('click');
        btnShowExport.classList.add("active");
        btnShowImport.classList.remove("active");
        exportArea.hidden = false;
        importArea.hidden = true;
        exportTextarea.value = JSON.stringify(state, null, 2);
    });

    btnShowImport.addEventListener("click", () => {
        playSfx('click');
        btnShowImport.classList.add("active");
        btnShowExport.classList.remove("active");
        importArea.hidden = false;
        exportArea.hidden = true;
        importError.hidden = true;
        importTextarea.value = "";
    });

    // Botão Copiar JSON Exportado
    document.getElementById("btn-copy-export").addEventListener("click", () => {
        exportTextarea.select();
        navigator.clipboard.writeText(exportTextarea.value).then(() => {
            playSfx('success');
            const btn = document.getElementById("btn-copy-export");
            const orig = btn.textContent;
            btn.textContent = "✔️ Código Copiado com Sucesso!";
            setTimeout(() => btn.textContent = orig, 2000);
        });
    });

    // Botão Salvar Importação
    document.getElementById("btn-save-import").addEventListener("click", () => {
        try {
            const importedData = JSON.parse(importTextarea.value);
            if (importedData && importedData.roster && Array.isArray(importedData.roster)) {
                state = { ...DEFAULT_STATE, ...importedData };
                saveState();
                
                // Re-renderiza toda a interface
                staticNameInput.value = state.staticName;
                selectContentType.value = state.contentType;
                renderEncounterOptions();
                renderRosterTable();
                renderScheduleTable();
                applyTheme();
                
                playSfx('success');
                modalShare.hidden = true;
                importError.hidden = true;
                alert("Dados da Estática importados com sucesso!");
            } else {
                throw new Error("Formato JSON inválido para o Roster da Static.");
            }
        } catch (err) {
            importError.textContent = "Erro ao importar: Código JSON corrompido ou inválido.";
            importError.hidden = false;
        }
    });

    // 6. Renderização Inicial Completa
    renderEncounterOptions();
    renderRosterTable();
    renderScheduleTable();
    updateDashboardStats();
});
