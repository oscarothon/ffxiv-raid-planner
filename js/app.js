// Lógica da Aplicação - FFXIV Static Raid Planner Premium
// Suporta: Independência de Elenco por Raid, Seleção de Classes Inline Animada & Agenda Preditiva Avançada

// Ícones nativos do FFXIV: Emperor's New Attire (set translúcido/invisível) via FFXIV Console Games Wiki
const WIKI_ICON_BASE = "https://ffxiv.consolegameswiki.com/mediawiki/images/thumb";
const GEAR_SLOTS = [
    { id: "weapon",    name: "Arma",       itemName: "The Emperor's New Fists",     icon: "⚔️", group: "armor",     iconUrl: `${WIKI_ICON_BASE}/6/6b/The_emperors_new_fists_icon1.png/80px-The_emperors_new_fists_icon1.png` },
    { id: "head",      name: "Cabeça",     itemName: "The Emperor's New Hat",       icon: "🪖", group: "armor",     iconUrl: `${WIKI_ICON_BASE}/1/1a/The_emperors_new_hat_icon1.png/80px-The_emperors_new_hat_icon1.png` },
    { id: "body",      name: "Peito",      itemName: "The Emperor's New Robe",      icon: "🥋", group: "armor",     iconUrl: `${WIKI_ICON_BASE}/d/d1/The_emperors_new_robe_icon1.png/80px-The_emperors_new_robe_icon1.png` },
    { id: "hands",     name: "Mãos",       itemName: "The Emperor's New Gloves",    icon: "🧤", group: "armor",     iconUrl: `${WIKI_ICON_BASE}/7/74/The_emperors_new_gloves_icon1.png/80px-The_emperors_new_gloves_icon1.png` },
    { id: "legs",      name: "Pernas",     itemName: "The Emperor's New Breeches",  icon: "👖", group: "armor",     iconUrl: `${WIKI_ICON_BASE}/a/ae/The_emperors_new_breeches_icon1.png/80px-The_emperors_new_breeches_icon1.png` },
    { id: "feet",      name: "Pés",        itemName: "The Emperor's New Boots",     icon: "🥾", group: "armor",     iconUrl: `${WIKI_ICON_BASE}/7/70/The_emperors_new_boots_icon1.png/80px-The_emperors_new_boots_icon1.png` },
    { id: "earrings",  name: "Brincos",    itemName: "The Emperor's New Earrings",  icon: "✨", group: "accessory", iconUrl: `${WIKI_ICON_BASE}/7/72/The_emperors_new_earrings_icon1.png/80px-The_emperors_new_earrings_icon1.png` },
    { id: "necklace",  name: "Colar",      itemName: "The Emperor's New Necklace",  icon: "📿", group: "accessory", iconUrl: `${WIKI_ICON_BASE}/0/0b/The_emperors_new_necklace_icon1.png/80px-The_emperors_new_necklace_icon1.png` },
    { id: "bracelets", name: "Braceletes", itemName: "The Emperor's New Bracelet",  icon: "⭕", group: "accessory", iconUrl: `${WIKI_ICON_BASE}/1/1d/The_emperors_new_bracelet_icon1.png/80px-The_emperors_new_bracelet_icon1.png` },
    { id: "ring1",     name: "Anel 1",     itemName: "The Emperor's New Ring",      icon: "💍", group: "accessory", iconUrl: `${WIKI_ICON_BASE}/f/f4/The_emperors_new_ring_icon1.png/80px-The_emperors_new_ring_icon1.png` },
    { id: "ring2",     name: "Anel 2",     itemName: "The Emperor's New Ring",      icon: "💍", group: "accessory", iconUrl: `${WIKI_ICON_BASE}/f/f4/The_emperors_new_ring_icon1.png/80px-The_emperors_new_ring_icon1.png` }
];

// Dicionário oficial de slugs do The Balance (Dawntrail)
const BALANCE_JOB_SLUGS = {
    PLD: { category: "tanks",   slug: "paladin" },
    WAR: { category: "tanks",   slug: "warrior" },
    DRK: { category: "tanks",   slug: "dark-knight" },
    GNB: { category: "tanks",   slug: "gunbreaker" },
    WHM: { category: "healers", slug: "white-mage" },
    SCH: { category: "healers", slug: "scholar" },
    AST: { category: "healers", slug: "astrologian" },
    SGE: { category: "healers", slug: "sage" },
    MNK: { category: "melee",   slug: "monk" },
    DRG: { category: "melee",   slug: "dragoon" },
    NIN: { category: "melee",   slug: "ninja" },
    SAM: { category: "melee",   slug: "samurai" },
    RPR: { category: "melee",   slug: "reaper" },
    VPR: { category: "melee",   slug: "viper" },
    BRD: { category: "ranged",  slug: "bard" },
    MCH: { category: "ranged",  slug: "machinist" },
    DNC: { category: "ranged",  slug: "dancer" },
    BLM: { category: "casters", slug: "black-mage" },
    SMN: { category: "casters", slug: "summoner" },
    RDM: { category: "casters", slug: "red-mage" },
    PCT: { category: "casters", slug: "pictomancer" }
};

let selectedEquipmentMemberId = null;

function getLootPref(player, progId, slotId) {
    if (!player) return "pass";
    if (!player.lootPreferences) player.lootPreferences = {};
    const targetProg = progId || state.inspectedProgId || "geral";
    if (!player.lootPreferences[targetProg]) player.lootPreferences[targetProg] = {};
    return player.lootPreferences[targetProg][slotId] || "pass";
}

function setLootPref(player, progId, slotId, pref) {
    if (!player) return;
    if (!player.lootPreferences) player.lootPreferences = {};
    const targetProg = progId || state.inspectedProgId || "geral";
    if (!player.lootPreferences[targetProg]) player.lootPreferences[targetProg] = {};
    player.lootPreferences[targetProg][slotId] = pref;
}

function getBisUrlForJob(jobId) {
    if (!jobId) return "https://www.thebalanceffxiv.com/";
    const mapping = BALANCE_JOB_SLUGS[jobId];
    if (!mapping) return "https://www.thebalanceffxiv.com/";
    return `https://www.thebalanceffxiv.com/jobs/${mapping.category}/${mapping.slug}/`;
}

const DEFAULT_STATE = {
    staticName: "Little Ala Mhigos",
    theme: "dark",
    sfx: true,
    contentType: "raid",
    selectedEncounter: "arcadion_lh",
    activeProgs: ["arcadion_lh"],
    inspectedProgId: "arcadion_lh",
    currentMonth: new Date().toISOString().slice(0, 7),
    scheduledProgs: {}, // Mapeia "YYYY-MM-DD" -> "progId" alvo daquele dia
    lootPriorities: {}, // Mapeia "progId" -> [memberId em ordem de prioridade]
    roster: [],
    macroText: "/p ⚠️ --- Estratégia de Posições (Clock Positions) ---\n/p [T1] Norte  | [T2] Sul\n/p [H1] Oeste  | [H2] Leste\n/p [M1] NO     | [M2] NE\n/p [R1] SO     | [R2] SE\n/p ⚔️ Bom jogo e foco nas mecânicas!",
    strategyNotes: "https://www.youtube.com/@hectorhectorson"
};

const FLEX_POOLS = {
    melee: ["MNK", "DRG", "NIN", "SAM", "RPR", "VPR"],
    tank: ["PLD", "WAR", "DRK", "GNB"],
    healer: ["WHM", "SCH", "AST", "SGE"],
    ranged: ["BRD", "MCH", "DNC"],
    caster: ["BLM", "SMN", "RDM", "PCT"],
    all: ["PLD", "WAR", "DRK", "GNB", "WHM", "SCH", "AST", "SGE", "MNK", "DRG", "NIN", "SAM", "RPR", "VPR", "BRD", "MCH", "DNC", "BLM", "SMN", "RDM", "PCT"]
};

let state = {};
let customSelectedJobs = new Set();

// ==========================================================================
// Sistema de Efeitos Sonoros FFXIV
// ==========================================================================
let audioCtx = null;

function playSfx(type) {
    if (!state.sfx) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;

        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.04);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.04);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'tab') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(660, now + 0.03);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.09);
        } else if (type === 'success') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now);
            osc.frequency.setValueAtTime(659.25, now + 0.06);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.16);
        }
    } catch (e) {}
}

// ==========================================================================
// Gerenciamento de Estado e Persistência Independente por Raid
// ==========================================================================
function loadState() {
    const saved = localStorage.getItem("ffxiv_static_planner_state");
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state = { ...DEFAULT_STATE, ...parsed };
            if (!Array.isArray(state.roster)) state.roster = [];
            delete state.loot;
            
            if (!state.activeProgs || state.activeProgs.length === 0) {
                state.activeProgs = ["arcadion_lh"];
            }
            if (!state.inspectedProgId) {
                state.inspectedProgId = state.activeProgs[0];
            }
            if (!state.currentMonth) {
                state.currentMonth = new Date().toISOString().slice(0, 7);
            }
            if (!state.scheduledProgs) {
                state.scheduledProgs = {};
            }
            if (!state.lootPriorities || typeof state.lootPriorities !== "object") {
                state.lootPriorities = {};
            }
            
            state.roster = state.roster.map(player => {
                const id = player.id || "mem_" + Math.random().toString(36).substr(2, 9);
                const flexType = player.flexType || "custom";
                let jobsPool = player.jobsPool || [];
                if (jobsPool.length === 0 && player.job) jobsPool = [player.job];
                if (jobsPool.length === 0) jobsPool = ["WAR"];
                
                const assignedJob = player.assignedJob || player.job || jobsPool[0];
                const assignedJobsByProg = player.assignedJobsByProg || {};
                const monthlySchedule = player.monthlySchedule || {};
                
                // Migração/Suporte ao statusByProg (Independência de Escalada por Raid)
                const statusByProg = player.statusByProg || {};
                const baseStatus = player.status === "bench" ? "bench" : "active";
                
                // Se o primeiro prog não estiver definido em statusByProg, inicializa
                if (state.activeProgs && state.activeProgs.length > 0) {
                    state.activeProgs.forEach(pId => {
                        if (!statusByProg[pId]) {
                            statusByProg[pId] = baseStatus;
                        }
                    });
                }
                
                return {
                    id,
                    name: player.name || "",
                    flexType,
                    jobsPool,
                    assignedJob,
                    assignedJobsByProg,
                    monthlySchedule,
                    statusByProg,
                    ilvl: parseInt(player.ilvl) || 710,
                    bis: !!player.bis,
                    status: baseStatus
                };
            });
        } catch (e) {
            state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        }
    } else {
        state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
    applyTheme();
}

function saveState() {
    delete state.loot;
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
// Acessores de Propriedades por Raid (Independência de Status e Classe)
// ==========================================================================
function getAssignedJobForProg(player, progId) {
    if (!player) return "WAR";
    const targetProg = progId || state.inspectedProgId || "geral";
    if (targetProg !== "geral" && player.assignedJobsByProg && player.assignedJobsByProg[targetProg]) {
        return player.assignedJobsByProg[targetProg];
    }
    return player.assignedJob || player.jobsPool[0] || "WAR";
}

function setAssignedJobForProg(player, progId, jobId) {
    if (!player) return;
    const targetProg = progId || state.inspectedProgId || "geral";
    if (!player.assignedJobsByProg) player.assignedJobsByProg = {};
    if (targetProg !== "geral") {
        player.assignedJobsByProg[targetProg] = jobId;
    }
    player.assignedJob = jobId;
}

function getPlayerStatusForProg(player, progId) {
    if (!player) return "bench";
    const targetProg = progId || state.inspectedProgId || "geral";
    if (player.statusByProg && player.statusByProg[targetProg]) {
        return player.statusByProg[targetProg];
    }
    return player.status === "bench" ? "bench" : "active";
}

function setPlayerStatusForProg(player, progId, statusVal) {
    if (!player) return;
    const targetProg = progId || state.inspectedProgId || "geral";
    if (!player.statusByProg) player.statusByProg = {};
    player.statusByProg[targetProg] = statusVal;
    
    // Mantém a compatibilidade com o status base
    if (targetProg === "geral" || targetProg === (state.activeProgs && state.activeProgs[0])) {
        player.status = statusVal;
    }
}

function getProgObj(progId) {
    if (progId === "geral") return { id: "geral", name: "Geral Padrão", expansion: "Todas" };
    const allTargets = [...FFXIV_RAIDS, ...FFXIV_ULTIMATES];
    return allTargets.find(t => t.id === progId) || { id: progId, name: progId, expansion: "" };
}

// ==========================================================================
// Seletor Customizado de Classes
// ==========================================================================
function initCustomJobsGrid() {
    const grid = document.getElementById("custom-jobs-grid");
    if (!grid) return;
    grid.innerHTML = "";
    customSelectedJobs.clear();

    FFXIV_JOBS.forEach(job => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "custom-job-btn";
        btn.dataset.job = job.id;
        
        const roleData = FFXIV_ROLES[job.role];
        btn.style.borderBottom = `2px solid ${roleData ? roleData.color : '#fff'}`;
        const imgHtml = job.iconUrl ? `<img class="job-img-icon" src="${job.iconUrl}" alt="${job.id}" onerror="this.style.display='none'">` : job.icon;
        btn.innerHTML = `${imgHtml} ${job.id}`;
        btn.title = job.name;

        btn.addEventListener("click", () => {
            playSfx('click');
            if (customSelectedJobs.has(job.id)) {
                customSelectedJobs.delete(job.id);
                btn.classList.remove("selected");
            } else {
                customSelectedJobs.add(job.id);
                btn.classList.add("selected");
            }
        });
        grid.appendChild(btn);
    });
}

// ==========================================================================
// Renderizadores da Interface
// ==========================================================================
function renderEncounterOptions() {
    const selectEncounter = document.getElementById("select-encounter");
    if (!selectEncounter) return;
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

    if (!list.some(i => i.id === state.selectedEncounter) && list.length > 0) {
        state.selectedEncounter = list[0].id;
    }
    updateSelectedContentDetails();
}

function updateSelectedContentDetails() {
    const isRaid = state.contentType === "raid";
    const list = isRaid ? FFXIV_RAIDS : FFXIV_ULTIMATES;
    const found = list.find(i => i.id === state.selectedEncounter);

    if (found) {
        const titleEl = document.getElementById("details-title");
        const expEl = document.getElementById("details-expansion");
        if (titleEl) titleEl.textContent = found.name;
        if (expEl) expEl.textContent = `Expansão: ${found.expansion}`;
    }
}

// Consolidação de Flex Roles para a Tabela do Roster
function generateJobsPoolBadgesHtml(player) {
    if (!player || !player.flexType || player.flexType === "custom") {
        const pool = player ? player.jobsPool : [];
        return pool.map(jobId => {
            const jobObj = FFXIV_JOBS.find(j => j.id === jobId);
            const roleData = jobObj ? FFXIV_ROLES[jobObj.role] : null;
            const color = roleData ? roleData.color : '#475569';
            const imgHtml = jobObj && jobObj.iconUrl ? `<img class="job-img-icon" src="${jobObj.iconUrl}" alt="${jobId}" onerror="this.style.display='none'">` : (jobObj ? jobObj.icon : '');
            return `<span class="job-mini-badge" style="background-color: ${color};" title="${jobObj ? jobObj.name : jobId}">${imgHtml} ${jobId}</span>`;
        }).join(' ');
    }

    const flexTokens = player.flexType.split("+");
    let badgesHtml = [];
    
    const firstJobMap = {
        tank: { id: "PLD", color: "var(--tank-color)" },
        healer: { id: "WHM", color: "var(--healer-color)" },
        melee: { id: "MNK", color: "var(--melee-color)" },
        ranged: { id: "BRD", color: "var(--ranged-color)" },
        caster: { id: "BLM", color: "var(--caster-color)" },
        all: { id: "PLD", color: "var(--tank-color)" }
    };

    flexTokens.forEach(token => {
        if (firstJobMap[token]) {
            const mapData = firstJobMap[token];
            const jobObj = FFXIV_JOBS.find(j => j.id === mapData.id);
            const imgHtml = jobObj && jobObj.iconUrl ? `<img class="job-img-icon" src="${jobObj.iconUrl}" alt="${mapData.id}" onerror="this.style.display='none'">` : (jobObj ? jobObj.icon : '');
            
            badgesHtml.push(`<span class="job-mini-badge consolidated-flex" style="background-color: ${mapData.color}; font-size: 0.8rem; padding: 3px 8px;" title="Flex ${token.toUpperCase()}">${imgHtml} All</span>`);
        } else if (token === "custom") {
            let coveredJobs = new Set();
            flexTokens.forEach(t => {
                if (FLEX_POOLS[t]) FLEX_POOLS[t].forEach(j => coveredJobs.add(j));
            });
            player.jobsPool.forEach(jobId => {
                if (!coveredJobs.has(jobId)) {
                    const jobObj = FFXIV_JOBS.find(j => j.id === jobId);
                    const roleData = jobObj ? FFXIV_ROLES[jobObj.role] : null;
                    const color = roleData ? roleData.color : '#475569';
                    const imgHtml = jobObj && jobObj.iconUrl ? `<img class="job-img-icon" src="${jobObj.iconUrl}" alt="${jobId}" onerror="this.style.display='none'">` : (jobObj ? jobObj.icon : '');
                    badgesHtml.push(`<span class="job-mini-badge" style="background-color: ${color};" title="${jobObj ? jobObj.name : jobId}">${imgHtml} ${jobId}</span>`);
                }
            });
        }
    });

    return badgesHtml.join(' ');
}

const ROLE_WEIGHTS = { tank: 1, healer: 2, melee: 3, ranged: 4, caster: 5 };

function renderActiveProgsPanel() {
    const container = document.getElementById("active-progs-list");
    const selSavage = document.getElementById("select-add-savage");
    const selUlt = document.getElementById("select-add-ultimate");
    
    if (container) {
        container.innerHTML = "";
        if (!state.activeProgs || state.activeProgs.length === 0) {
            container.innerHTML = `<span style="color: var(--text-muted); font-style: italic; font-size: 0.85rem;">Nenhum conteúdo em progresso cadastrado. Utilize os seletores abaixo.</span>`;
        } else {
            state.activeProgs.forEach(progId => {
                const progObj = getProgObj(progId);
                const isUlt = FFXIV_ULTIMATES.some(u => u.id === progId);
                
                const chip = document.createElement("div");
                chip.className = "prog-chip";
                chip.innerHTML = `
                    <span class="prog-chip-type" style="color: ${isUlt ? '#e17a47' : 'var(--gold-bright)'}">${isUlt ? 'Ultimate' : 'Savage'}</span>
                    <span style="font-weight: 600;">${progObj.name.split(" (")[0].split(":")[0]}</span>
                    <button class="prog-chip-close" data-id="${progId}" title="Remover Progresso">&times;</button>
                `;
                container.appendChild(chip);
            });
            
            container.querySelectorAll(".prog-chip-close").forEach(btn => {
                btn.addEventListener("click", (e) => {
                    playSfx('click');
                    const idToRemove = e.currentTarget.dataset.id;
                    state.activeProgs = state.activeProgs.filter(id => id !== idToRemove);
                    if (state.inspectedProgId === idToRemove) {
                        state.inspectedProgId = state.activeProgs.length > 0 ? state.activeProgs[0] : "geral";
                    }
                    saveState();
                    renderActiveProgsPanel();
                    renderProgTabsBar();
                    renderRosterTables();
                });
            });
        }
    }
    
    if (selSavage && selSavage.children.length <= 1) {
        FFXIV_RAIDS.forEach(r => {
            const opt = document.createElement("option");
            opt.value = r.id;
            opt.textContent = `${r.name} (${r.expansion})`;
            selSavage.appendChild(opt);
        });
    }
    if (selUlt && selUlt.children.length <= 1) {
        FFXIV_ULTIMATES.forEach(u => {
            const opt = document.createElement("option");
            opt.value = u.id;
            opt.textContent = `${u.name} (${u.expansion})`;
            selUlt.appendChild(opt);
        });
    }
}

function renderProgTabsBar() {
    const badge = document.getElementById("roster-prog-badge");
    const focusEl = document.getElementById("current-focus-text");
    
    if (!state.activeProgs || state.activeProgs.length === 0) {
        state.inspectedProgId = "geral";
    } else if (!state.activeProgs.includes(state.inspectedProgId)) {
        state.inspectedProgId = state.activeProgs[0];
    }
    
    const currentObj = getProgObj(state.inspectedProgId);
    const shortTitle = currentObj.name.split(" (")[0].split(":")[0];
    
    if (badge) badge.textContent = shortTitle;
    if (focusEl) focusEl.textContent = shortTitle;
    
    const containers = [
        document.getElementById("prog-tabs-container"),
        document.getElementById("roster-prog-tabs-container"),
        document.getElementById("equip-prog-tabs-container")
    ];
    
    const equipProgLabel = document.getElementById("equip-current-prog-label");
    if (equipProgLabel) equipProgLabel.textContent = currentObj.name.split(" (")[0];
    
    const listToRender = (state.activeProgs && state.activeProgs.length > 0) ? state.activeProgs : ["geral"];
    
    containers.forEach(cont => {
        if (!cont) return;
        cont.innerHTML = "";
        listToRender.forEach(progId => {
            const pObj = getProgObj(progId);
            const btn = document.createElement("button");
            btn.className = `prog-tab-chip ${progId === state.inspectedProgId ? 'active' : ''}`;
            btn.textContent = pObj.name.split(" (")[0].split(":")[0];
            btn.title = pObj.name;
            
            btn.addEventListener("click", () => {
                playSfx('tab');
                state.inspectedProgId = progId;
                saveState();
                renderProgTabsBar();
                renderRosterTables();
                renderEquipmentPanel();
            });
            cont.appendChild(btn);
        });
    });
}

// Renderiza Tabela de Membros discriminando o Elenco Ativo e Banco específicos para a Raid selecionada
function renderRosterTables() {
    const activeTbody = document.getElementById("roster-active-tbody");
    const benchTbody = document.getElementById("roster-bench-tbody");
    const activeCountText = document.getElementById("active-count-text");

    if (!activeTbody || !benchTbody) return;

    activeTbody.innerHTML = "";
    benchTbody.innerHTML = "";

    const activeProgId = state.inspectedProgId || "geral";

    // Separação por Conteúdo: Avalia o statusByProg da Raid ativa
    const activeMembers = state.roster
        .filter(p => getPlayerStatusForProg(p, activeProgId) === "active")
        .sort((a, b) => {
            const assignedA = getAssignedJobForProg(a, activeProgId);
            const assignedB = getAssignedJobForProg(b, activeProgId);
            const jobA = FFXIV_JOBS.find(j => j.id === assignedA) || { role: "tank" };
            const jobB = FFXIV_JOBS.find(j => j.id === assignedB) || { role: "tank" };
            const weightA = ROLE_WEIGHTS[jobA.role] || 99;
            const weightB = ROLE_WEIGHTS[jobB.role] || 99;
            return weightA - weightB;
        });

    const benchMembers = state.roster.filter(p => getPlayerStatusForProg(p, activeProgId) !== "active");

    if (activeCountText) {
        activeCountText.textContent = `${activeMembers.length} / 8`;
        activeCountText.style.color = activeMembers.length === 8 ? "var(--color-avail)" : "var(--gold-bright)";
    }

    if (activeMembers.length === 0) {
        activeTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum jogador na Party Principal desta Raid. Utilize os botões 👆 do banco abaixo para alocar titulares.</td></tr>`;
    } else {
        activeMembers.forEach((player, idx) => {
            const tr = document.createElement("tr");
            const currentAssignedJob = getAssignedJobForProg(player, activeProgId);
            const mainJobObj = FFXIV_JOBS.find(j => j.id === currentAssignedJob) || { id: currentAssignedJob, role: "tank" };
            const mainImgHtml = mainJobObj.iconUrl ? `<img class="job-img-icon" src="${mainJobObj.iconUrl}" style="width:22px;height:22px;object-fit:contain;" alt="${currentAssignedJob}">` : '';

            const assignedJobHtml = `
                <div class="active-assigned-job-container" title="Classe principal ativa para este conteúdo">
                    <div class="job-badge" style="background-color: ${(FFXIV_ROLES[mainJobObj.role] || {}).color || '#000'}">${mainImgHtml || currentAssignedJob}</div>
                    <span class="job-name-sigla">${currentAssignedJob}</span>
                </div>
            `;

            const poolBadgesHtml = player.jobsPool.map(jId => {
                const jObj = FFXIV_JOBS.find(j => j.id === jId);
                const roleData = jObj ? FFXIV_ROLES[jObj.role] : null;
                const color = roleData ? roleData.color : '#475569';
                const imgH = jObj && jObj.iconUrl ? `<img class="job-img-icon" src="${jObj.iconUrl}" alt="${jId}">` : (jObj ? jObj.icon : '');
                const isAssigned = jId === currentAssignedJob;
                return `<button type="button" class="job-badge direct-pool-job-btn" style="background-color: ${color}; ${isAssigned ? 'opacity:0.4; transform:none; cursor:default;' : ''}" data-id="${player.id}" data-job="${jId}" title="Clique para definir ${jId} como principal neste conteúdo">${imgH || jId}</button>`;
            }).join(' ');

            tr.innerHTML = `
                <td style="font-weight: bold; color: var(--gold-muted);">#${idx + 1}</td>
                <td>
                    <input type="text" class="ff-input inp-roster-name" value="${player.name}" data-id="${player.id}" placeholder="Nome / Nick">
                </td>
                <td>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
                        ${poolBadgesHtml}
                    </div>
                </td>
                <td>
                    ${assignedJobHtml}
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <input type="number" class="ff-input inp-roster-ilvl" value="${player.ilvl}" min="1" max="999" data-id="${player.id}" style="width: 65px; padding: 6px;">
                        <label title="BiS (Best in Slot)"><input type="checkbox" class="ff-checkbox chk-roster-bis" data-id="${player.id}" ${player.bis ? 'checked' : ''}></label>
                    </div>
                </td>
                <td>
                    <div style="display: flex; gap: 4px;">
                        <button class="btn-table-action btn-move-bench" data-id="${player.id}" title="Mover para o Banco de Reservas desta Raid">👇</button>
                        <button class="btn-table-action btn-delete-member" data-id="${player.id}" title="Excluir Jogador">❌</button>
                    </div>
                </td>
            `;
            activeTbody.appendChild(tr);
        });
    }

    if (benchMembers.length === 0) {
        benchTbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Banco de reservas vazio para esta Raid.</td></tr>`;
    } else {
        benchMembers.forEach(player => {
            const tr = document.createElement("tr");
            const currentAssignedJob = getAssignedJobForProg(player, activeProgId);
            const poolBadgesHtml = player.jobsPool.map(jId => {
                const jObj = FFXIV_JOBS.find(j => j.id === jId);
                const roleData = jObj ? FFXIV_ROLES[jObj.role] : null;
                const color = roleData ? roleData.color : '#475569';
                const imgH = jObj && jObj.iconUrl ? `<img class="job-img-icon" src="${jObj.iconUrl}" alt="${jId}">` : (jObj ? jObj.icon : '');
                const isAssigned = jId === currentAssignedJob;
                return `<button type="button" class="job-badge direct-pool-job-btn" style="background-color: ${color}; ${isAssigned ? 'opacity:0.4; transform:none; cursor:default;' : ''}" data-id="${player.id}" data-job="${jId}" title="Clique para definir ${jId} como principal neste conteúdo">${imgH || jId}</button>`;
            }).join(' ');

            tr.innerHTML = `
                <td>
                    <input type="text" class="ff-input inp-roster-name" value="${player.name}" data-id="${player.id}" placeholder="Nome / Nick">
                </td>
                <td>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
                        ${poolBadgesHtml}
                    </div>
                </td>
                <td>
                    <input type="number" class="ff-input inp-roster-ilvl" value="${player.ilvl}" min="1" max="999" data-id="${player.id}" style="width: 70px; padding: 6px;">
                </td>
                <td>
                    <div style="display: flex; gap: 4px;">
                        <button class="btn-table-action btn-move-active" data-id="${player.id}" title="Alocar como Titular na Party Principal desta Raid">👆</button>
                        <button class="btn-table-action btn-delete-member" data-id="${player.id}" title="Excluir Jogador">❌</button>
                    </div>
                </td>
            `;
            benchTbody.appendChild(tr);
        });
    }

    bindRosterTableEvents();
    renderDashboardVisualizer();
    renderScheduleTable();
    updateDashboardStats();
    renderEquipmentPanel();
}

function bindRosterTableEvents() {
    const container = document.getElementById("roster-tab");
    if (!container) return;

    container.querySelectorAll(".direct-pool-job-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const pId = btn.dataset.id;
            const targetJob = btn.dataset.job;
            const targetPlayer = state.roster.find(p => p.id === pId);
            const currentAssigned = getAssignedJobForProg(targetPlayer, state.inspectedProgId || "geral");
            if (targetPlayer && targetJob !== currentAssigned) {
                playSfx('success');
                setAssignedJobForProg(targetPlayer, state.inspectedProgId || "geral", targetJob);
                saveState();
                renderRosterTables();
                renderEquipmentPanel();
            }
        });
    });

    container.querySelectorAll(".inp-roster-name").forEach(inp => {
        inp.addEventListener("input", (e) => {
            const id = e.target.dataset.id;
            const target = state.roster.find(p => p.id === id);
            if (target) {
                target.name = e.target.value;
                saveState();
                renderDashboardVisualizer();
                renderScheduleTable();
            }
        });
    });

    container.querySelectorAll(".inp-roster-ilvl").forEach(inp => {
        inp.addEventListener("input", (e) => {
            const id = e.target.dataset.id;
            const target = state.roster.find(p => p.id === id);
            if (target) {
                target.ilvl = parseInt(e.target.value) || 0;
                saveState();
                renderDashboardVisualizer();
            }
        });
    });

    container.querySelectorAll(".chk-roster-bis").forEach(chk => {
        chk.addEventListener("change", (e) => {
            playSfx('click');
            const id = e.target.dataset.id;
            const target = state.roster.find(p => p.id === id);
            if (target) {
                target.bis = e.target.checked;
                saveState();
                renderDashboardVisualizer();
            }
        });
    });

    container.querySelectorAll(".btn-move-bench").forEach(btn => {
        btn.addEventListener("click", (e) => {
            playSfx('tab');
            const id = e.currentTarget.dataset.id;
            const target = state.roster.find(p => p.id === id);
            if (target) {
                setPlayerStatusForProg(target, state.inspectedProgId || "geral", "bench");
                saveState();
                renderRosterTables();
            }
        });
    });

    container.querySelectorAll(".btn-move-active").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const activeProgId = state.inspectedProgId || "geral";
            const activeCount = state.roster.filter(p => getPlayerStatusForProg(p, activeProgId) === "active").length;
            if (activeCount >= 8) {
                alert("A Party Principal desta Raid já atingiu o limite máximo de 8 jogadores! Mova alguém para o banco primeiro.");
                return;
            }
            playSfx('success');
            const id = e.currentTarget.dataset.id;
            const target = state.roster.find(p => p.id === id);
            if (target) {
                setPlayerStatusForProg(target, activeProgId, "active");
                saveState();
                renderRosterTables();
            }
        });
    });

    container.querySelectorAll(".btn-delete-member").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = e.currentTarget.dataset.id;
            const target = state.roster.find(p => p.id === id);
            if (target && confirm(`Deseja realmente excluir o jogador "${target.name || 'Sem Nome'}" do elenco geral?`)) {
                playSfx('click');
                state.roster = state.roster.filter(p => p.id !== id);
                saveState();
                renderRosterTables();
            }
        });
    });
}

// Fechar modais/seletores ao clicar fora
document.addEventListener("click", () => {
    document.querySelectorAll(".inline-pool-container.expanded").forEach(c => c.classList.remove("expanded"));
});

// Visualização Vertical estilo Party List in-game com Sigla embaixo do Ícone
function renderDashboardVisualizer() {
    const container = document.getElementById("comp-visualizer");
    if (!container) return;
    container.innerHTML = "";

    const activeProgId = state.inspectedProgId || "geral";

    const activeMembers = state.roster
        .filter(p => getPlayerStatusForProg(p, activeProgId) === "active")
        .sort((a, b) => {
            const assignedA = getAssignedJobForProg(a, activeProgId);
            const assignedB = getAssignedJobForProg(b, activeProgId);
            const jobA = FFXIV_JOBS.find(j => j.id === assignedA) || { role: "tank" };
            const jobB = FFXIV_JOBS.find(j => j.id === assignedB) || { role: "tank" };
            const weightA = ROLE_WEIGHTS[jobA.role] || 99;
            const weightB = ROLE_WEIGHTS[jobB.role] || 99;
            return weightA - weightB;
        });

    for (let i = 0; i < 8; i++) {
        const player = activeMembers[i];

        if (player) {
            const assignedJobId = getAssignedJobForProg(player, activeProgId);
            const jobData = FFXIV_JOBS.find(j => j.id === assignedJobId) || { id: assignedJobId, name: assignedJobId, role: "tank" };
            const imgHtml = jobData.iconUrl ? `<img class="job-img-icon" src="${jobData.iconUrl}" alt="${jobData.id}" onerror="this.style.display='none'">` : jobData.icon;
            
            const card = document.createElement("div");
            card.className = `member-mini-card role-${jobData.role}`;
            card.innerHTML = `
                <div class="job-badge-container">
                    <div class="job-badge" title="${assignedJobId} - ${jobData.name}">${imgHtml}</div>
                    <div class="job-sigla">${assignedJobId}</div>
                </div>
                <div class="member-info">
                    <div class="member-name" title="${player.name}">${player.name || '<span style="color:#94a3b8;font-style:italic;">Sem Nick</span>'}</div>
                    <div class="member-ilvl">iLvl: ${player.ilvl} ${player.bis ? '⭐ BiS' : ''}</div>
                </div>
            `;
            container.appendChild(card);
        } else {
            const emptyCard = document.createElement("div");
            emptyCard.className = "member-mini-card empty-slot";
            emptyCard.innerHTML = `<div class="empty-slot-txt">➕ Vaga Livre ${i + 1}</div>`;
            emptyCard.style.cursor = "pointer";
            emptyCard.addEventListener("click", () => {
                const rosterTabBtn = document.querySelector(".tab-btn[data-tab='roster']");
                if (rosterTabBtn) rosterTabBtn.click();
            });
            container.appendChild(emptyCard);
        }
    }
}

// Renderiza o Calendário Mensal com Seletor de Raid alvo por Dia
function renderScheduleTable() {
    const theadRow = document.getElementById("calendar-thead-row");
    const tbody = document.getElementById("calendar-tbody");
    const label = document.getElementById("calendar-month-label");
    
    if (!theadRow || !tbody) return;
    
    if (!state.currentMonth) {
        state.currentMonth = new Date().toISOString().slice(0, 7);
    }
    const [yearStr, monthStr] = state.currentMonth.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr) - 1;
    
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const shortWkNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    
    if (label) {
        label.textContent = `${monthNames[month]} ${year}`;
    }
    
    const numDays = new Date(year, month + 1, 0).getDate();
    const scheduledProgs = state.scheduledProgs || {};
    
    theadRow.innerHTML = `<th class="col-fixed">Jogador</th>`;
    for (let d = 1; d <= numDays; d++) {
        const currDate = new Date(year, month, d);
        const wkDay = shortWkNames[currDate.getDay()];
        const isWeekend = currDate.getDay() === 0 || currDate.getDay() === 6;
        const dateKey = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
        
        const th = document.createElement("th");
        if (isWeekend) th.style.background = "rgba(239, 68, 68, 0.1)";
        
        const selectedProg = scheduledProgs[dateKey] || (state.activeProgs && state.activeProgs[0]) || "geral";
        const progOptions = (state.activeProgs || []).map(pId => {
            const pObj = getProgObj(pId);
            const shortName = pObj.name.split(" (")[0].split(":")[0];
            return `<option value="${pId}" ${pId === selectedProg ? 'selected' : ''}>${shortName}</option>`;
        }).join('');

        th.innerHTML = `
            <div class="cell-day-num">${d}</div>
            <div class="cell-day-wk">${wkDay}</div>
            <select class="ff-select sel-day-target-prog" data-date="${dateKey}" title="Raid Alvo do Dia" style="font-size:0.65rem; padding:1px 2px; width:100%; margin-top:4px; background:rgba(0,0,0,0.6); border:1px solid #475569; color:var(--gold-muted);">
                ${progOptions}
            </select>
        `;
        theadRow.appendChild(th);
    }
    
    tbody.innerHTML = "";
    
    if (state.roster.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${numDays + 1}" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum jogador cadastrado no elenco.</td></tr>`;
        renderQuickSchedule();
        return;
    }
    
    const activeProgId = state.inspectedProgId || "geral";
    const sortedRoster = [...state.roster].sort((a, b) => {
        const sA = getPlayerStatusForProg(a, activeProgId);
        const sB = getPlayerStatusForProg(b, activeProgId);
        if (sA === "active" && sB !== "active") return -1;
        if (sA !== "active" && sB === "active") return 1;
        return 0;
    });

    let renderedBenchHeader = false;

    sortedRoster.forEach(player => {
        const playerStatusInProg = getPlayerStatusForProg(player, activeProgId);
        if (playerStatusInProg === "bench" && !renderedBenchHeader) {
            renderedBenchHeader = true;
            const sep = document.createElement("tr");
            sep.innerHTML = `<td colspan="${numDays + 1}" style="background: rgba(165, 53, 53, 0.15); color: #fca5a5; font-weight: bold; font-size: 0.85rem; padding: 6px 16px; text-align: left;">🛡️ Substitutos (Banco de Reservas desta Raid)</td>`;
            tbody.appendChild(sep);
        }

        if (!player.monthlySchedule) player.monthlySchedule = {};

        const tr = document.createElement("tr");
        const tdName = document.createElement("td");
        tdName.className = "col-fixed";
        tdName.style.fontWeight = "600";
        const statusTag = playerStatusInProg === "bench" ? `<span style="font-size:0.7rem;color:#fca5a5;">(Reserva)</span>` : '';
        tdName.innerHTML = `${player.name || '<span style="font-style:italic;color:#94a3b8;">Sem Nick</span>'} ${statusTag}`;
        tr.appendChild(tdName);

        for (let d = 1; d <= numDays; d++) {
            const dateKey = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
            const statusVal = player.monthlySchedule[dateKey] || "";
            
            let statusText = "";
            let statusClass = "";
            if (statusVal === "avail") { statusText = "✔️"; statusClass = "avail"; }
            else if (statusVal === "late") { statusText = "⚠️"; statusClass = "late"; }
            else if (statusVal === "unavail") { statusText = "❌"; statusClass = "unavail"; }

            const tdDay = document.createElement("td");
            tdDay.className = `cell-status ${statusClass}`;
            tdDay.textContent = statusText;
            tdDay.title = `Dia ${d}: Clique para alternar`;
            
            tdDay.addEventListener("click", () => {
                playSfx('click');
                if (statusVal === "") player.monthlySchedule[dateKey] = "avail";
                else if (statusVal === "avail") player.monthlySchedule[dateKey] = "late";
                else if (statusVal === "late") player.monthlySchedule[dateKey] = "unavail";
                else delete player.monthlySchedule[dateKey];
                
                saveState();
                renderScheduleTable();
            });
            tr.appendChild(tdDay);
        }
        tbody.appendChild(tr);
    });

    theadRow.querySelectorAll(".sel-day-target-prog").forEach(sel => {
        sel.addEventListener("change", (e) => {
            playSfx('click');
            if (!state.scheduledProgs) state.scheduledProgs = {};
            state.scheduledProgs[e.target.dataset.date] = e.target.value;
            saveState();
            renderQuickSchedule();
        });
    });

    renderQuickSchedule();
}

// Agendamento Preditivo Avançado: Analisa presença parcial, uso do banco e lista nicks confirmados
function renderQuickSchedule() {
    const container = document.getElementById("quick-schedule-list");
    if (!container) return;
    container.innerHTML = "";

    if (!state.activeProgs || state.activeProgs.length === 0) {
        container.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum conteúdo ativo para agendamento.</span>`;
        return;
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    const shortWkNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const scheduledProgs = state.scheduledProgs || {};

    state.activeProgs.forEach(progId => {
        const progObj = getProgObj(progId);
        const progTitulares = state.roster.filter(p => getPlayerStatusForProg(p, progId) === "active");
        const progReservas = state.roster.filter(p => getPlayerStatusForProg(p, progId) !== "active");
        
        let foundDateKey = null;
        let foundDateObj = null;
        let confTitulares = [];
        let confReservas = [];
        let hasTitularLate = false;

        // Procura a próxima data agendada com >= 8 jogadores confirmados no total
        for (let i = 0; i < 45; i++) {
            const dObj = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
            const yStr = dObj.getFullYear();
            const mStr = String(dObj.getMonth() + 1).padStart(2, '0');
            const dayStr = String(dObj.getDate()).padStart(2, '0');
            const dateKey = `${yStr}-${mStr}-${dayStr}`;

            const targetProgForDate = scheduledProgs[dateKey] || state.activeProgs[0];

            if (targetProgForDate === progId) {
                let tConf = [];
                let rConf = [];
                let tLate = false;

                progTitulares.forEach(p => {
                    const sVal = p.monthlySchedule ? p.monthlySchedule[dateKey] : "";
                    if (sVal === "avail" || sVal === "late") {
                        tConf.push(p.name || "Sem Nick");
                        if (sVal === "late") tLate = true;
                    }
                });

                progReservas.forEach(p => {
                    const sVal = p.monthlySchedule ? p.monthlySchedule[dateKey] : "";
                    if (sVal === "avail" || sVal === "late") {
                        rConf.push(p.name || "Sem Nick");
                    }
                });

                // Notifica existência de banco disponível independente de ele ser suficiente
                // E encontra a data principal quando a soma total dá quórum mínimo de 8
                if (tConf.length + rConf.length >= 8 || rConf.length > 0) {
                    // Prioriza a data que atinja >= 8 para exibição do próximo dia de raid real
                    if (tConf.length + rConf.length >= 8 || !foundDateKey) {
                        foundDateKey = dateKey;
                        foundDateObj = dObj;
                        confTitulares = tConf;
                        confReservas = rConf;
                        hasTitularLate = tLate;
                        if (tConf.length + rConf.length >= 8) break;
                    }
                }
            }
        }

        const raidBlock = document.createElement("div");
        raidBlock.className = "next-raid-prog-block";
        raidBlock.style.background = "rgba(0,0,0,0.3)";
        raidBlock.style.border = "1px solid rgba(255,255,255,0.05)";
        raidBlock.style.borderRadius = "var(--radius-sm)";
        raidBlock.style.padding = "12px";
        raidBlock.style.marginBottom = "10px";

        const headerHtml = `<div style="font-weight: 700; color: var(--gold-bright); font-size: 0.95rem; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">🎯 ${progObj.name.split(" (")[0]}</div>`;

        if (foundDateKey) {
            const dayNumStr = String(foundDateObj.getDate()).padStart(2, '0');
            const monthNumStr = String(foundDateObj.getMonth() + 1).padStart(2, '0');
            const wkDayStr = shortWkNames[foundDateObj.getDay()];
            const dateFormatted = `${wkDayStr}, ${dayNumStr}/${monthNumStr}`;

            const totalConfCount = confTitulares.length + confReservas.length;
            let rowBg = totalConfCount >= 8 ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)";
            let borderCol = totalConfCount >= 8 ? "var(--color-avail)" : "var(--color-late)";

            let alertsHtml = "";
            
            // Avisos e Sinalizações Detalhadas
            if (confTitulares.length >= 8 && !hasTitularLate) {
                alertsHtml += `<div style="background: var(--color-avail); color: #fff; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: bold; display: inline-block;">✔️ Escalação Titular Completa</div>`;
            } else {
                if (confTitulares.length < 8) {
                    const ausentes = progTitulares.length - confTitulares.length;
                    alertsHtml += `<div style="background: var(--color-late); color: #000; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: bold; margin-bottom: 4px;">⚠️ Desfalques Titulares (${ausentes} Ausentes)</div>`;
                }
                if (hasTitularLate) {
                    alertsHtml += `<div style="background: rgba(234, 179, 8, 0.2); border: 1px solid var(--color-late); color: var(--gold-bright); font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: bold; margin-bottom: 4px;">⏳ Atenção: Titulares com status Talvez / Atraso</div>`;
                }
            }

            // Existência de Banco Disponível
            if (confReservas.length > 0) {
                alertsHtml += `<div style="background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; color: #93c5fd; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: bold; margin-top: 4px;">🛡️ Banco Disponível: ${confReservas.join(", ")}</div>`;
            }

            // Listagem de Nicks Confirmados
            const nicksListHtml = `
                <div style="font-size: 0.8rem; color: var(--text-main); margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px;">
                    <span style="color: var(--text-muted);">Confirmados:</span> 
                    <span style="color: var(--color-avail); font-weight: 600;">${confTitulares.join(", ") || "Nenhum Titular"}</span>
                    ${confReservas.length > 0 ? ` | <span style="color: #fca5a5; font-weight: 600;">Reservas: ${confReservas.join(", ")}</span>` : ''}
                </div>
            `;

            raidBlock.innerHTML = `
                ${headerHtml}
                <div style="display: flex; flex-direction: column; gap: 4px; border-left: 3px solid ${borderCol}; padding-left: 10px; background: ${rowBg}; padding: 8px; border-radius: 0 var(--radius-sm) var(--radius-sm) 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600; font-size: 0.9rem;">📅 Próxima Sessão: ${dateFormatted}</span>
                        <span style="font-size: 0.8rem; color: var(--text-muted);">(${totalConfCount} Confirmados no Dia)</span>
                    </div>
                    <div style="margin-top: 2px;">${alertsHtml}</div>
                    ${nicksListHtml}
                </div>
            `;
        } else {
            raidBlock.innerHTML = `
                ${headerHtml}
                <div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">
                    Nenhuma data confirmada ou reservas agendados encontrados na agenda para esta Raid.
                </div>
            `;
        }

        container.appendChild(raidBlock);
    });
}

function renderEquipmentPanel() {
    const membersListCont = document.getElementById("equip-members-list");
    const slotsGridCont = document.getElementById("equip-slots-grid");
    const selectedNameEl = document.getElementById("equip-selected-member-name");
    const selectedJobEl = document.getElementById("equip-selected-member-job");
    const bisAnchorEl = document.getElementById("bis-link-anchor");
    
    if (!membersListCont || !slotsGridCont) return;
    
    const activeProgId = state.inspectedProgId || "geral";
    
    const sortedRoster = [...state.roster].sort((a, b) => {
        const sA = getPlayerStatusForProg(a, activeProgId);
        const sB = getPlayerStatusForProg(b, activeProgId);
        if (sA === "active" && sB !== "active") return -1;
        if (sA !== "active" && sB === "active") return 1;
        return (a.name || "").localeCompare(b.name || "");
    });
    
    membersListCont.innerHTML = "";
    
    if (sortedRoster.length === 0) {
        membersListCont.innerHTML = `<span style="color:var(--text-muted); font-size:0.85rem; padding:10px;">Nenhum membro cadastrado.</span>`;
        slotsGridCont.innerHTML = `<div style="grid-column:1/-1; color:var(--text-muted); text-align:center; padding:30px;">Cadastre membros na aba Roster para definir seus equipamentos.</div>`;
        if (selectedNameEl) selectedNameEl.textContent = "Sem Membros";
        if (selectedJobEl) selectedJobEl.textContent = "";
        renderFightSummaryAndPriorities();
        return;
    }
    
    let targetMember = sortedRoster.find(p => p.id === selectedEquipmentMemberId);
    if (!targetMember && sortedRoster.length > 0) {
        targetMember = sortedRoster[0];
        selectedEquipmentMemberId = targetMember.id;
    }
    
    sortedRoster.forEach(player => {
        const sProg = getPlayerStatusForProg(player, activeProgId);
        const currJob = getAssignedJobForProg(player, activeProgId);
        const jObj = FFXIV_JOBS.find(j => j.id === currJob);
        const roleData = jObj ? FFXIV_ROLES[jObj.role] : null;
        
        const btn = document.createElement("button");
        btn.className = `member-select-btn ${player.id === selectedEquipmentMemberId ? 'active' : ''}`;
        
        const statusDot = sProg === "active" ? `<span style="color:var(--color-avail);" title="Titular">●</span>` : `<span style="color:var(--color-late);" title="Reserva">○</span>`;
        
        btn.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                ${statusDot}
                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${player.name || 'Sem Nick'}</span>
            </div>
            <span class="job-sigla" style="color:${roleData ? roleData.color : '#fff'}; margin-top:0;">${currJob}</span>
        `;
        
        btn.addEventListener("click", () => {
            playSfx('click');
            selectedEquipmentMemberId = player.id;
            renderEquipmentPanel();
        });
        
        membersListCont.appendChild(btn);
    });
    
    if (targetMember) {
        const currJob = getAssignedJobForProg(targetMember, activeProgId);
        if (selectedNameEl) selectedNameEl.textContent = targetMember.name || "Sem Nick";
        if (selectedJobEl) {
            const jObj = FFXIV_JOBS.find(j => j.id === currJob);
            selectedJobEl.textContent = `${currJob} ${jObj ? '- ' + jObj.name : ''}`;
            selectedJobEl.style.color = jObj && FFXIV_ROLES[jObj.role] ? FFXIV_ROLES[jObj.role].color : "var(--gold-bright)";
        }
        
        if (bisAnchorEl) {
            bisAnchorEl.href = getBisUrlForJob(currJob);
        }
        
        // Layout estilo Wiki: Armaduras | Classe (centro) | Acessórios
        const armorSlots = GEAR_SLOTS.filter(s => s.group === "armor");
        const accessorySlots = GEAR_SLOTS.filter(s => s.group === "accessory");
        const centerJobObj = FFXIV_JOBS.find(j => j.id === currJob);
        const centerRole = centerJobObj ? FFXIV_ROLES[centerJobObj.role] : null;
        const centerJobImg = centerJobObj && centerJobObj.iconUrl
            ? `<img class="job-portrait-img" src="${centerJobObj.iconUrl}" alt="${currJob}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><div class="job-portrait-fallback" style="display:none;">${centerJobObj.icon || '⚔️'}</div>`
            : `<div class="job-portrait-fallback" style="display:flex;">${centerJobObj ? centerJobObj.icon : '⚔️'}</div>`;

        const buildSlotRowHtml = (slot) => {
            const currPref = getLootPref(targetMember, activeProgId, slot.id);
            const iconHtml = slot.iconUrl
                ? `<img class="gear-row-icon-img" src="${slot.iconUrl}" alt="${slot.itemName || slot.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span class="gear-row-icon-fallback" style="display:none;">${slot.icon}</span>`
                : `<span class="gear-row-icon-fallback" style="display:flex;">${slot.icon}</span>`;
            return `
                <div class="gear-slot-row" data-slot="${slot.id}">
                    <div class="gear-row-icon-wrap">${iconHtml}</div>
                    <div class="gear-row-body">
                        <span class="gear-row-slotname" title="${slot.itemName || slot.name}">${slot.name}</span>
                        <div class="loot-pref-controls">
                            <button type="button" class="btn-loot-pref need ${currPref === 'need' ? 'active' : ''}" title="Need (Necessidade)" data-pref="need" data-slot="${slot.id}">🎲</button>
                            <button type="button" class="btn-loot-pref greed ${currPref === 'greed' ? 'active' : ''}" title="Greed (Cobiça)" data-pref="greed" data-slot="${slot.id}">🪙</button>
                            <button type="button" class="btn-loot-pref pass ${currPref === 'pass' ? 'active' : ''}" title="Pass (Passar)" data-pref="pass" data-slot="${slot.id}">❌</button>
                        </div>
                    </div>
                </div>
            `;
        };

        const armorHtml = armorSlots.map(buildSlotRowHtml).join("");
        const accessoryHtml = accessorySlots.map(buildSlotRowHtml).join("");

        slotsGridCont.innerHTML = `
            <div class="gear-wiki-layout">
                <div class="gear-wiki-column gear-armor-column">
                    <div class="gear-wiki-col-header">Armor</div>
                    ${armorHtml}
                </div>
                <div class="gear-wiki-column gear-character-column">
                    <div class="gear-wiki-col-header">Class</div>
                    <div class="job-portrait-frame" style="--role-color: ${centerRole ? centerRole.color : '#33b5e5'};">
                        ${centerJobImg}
                    </div>
                    <div class="job-portrait-name" title="${targetMember.name || ''}">${targetMember.name || '<em>Sem Nick</em>'}</div>
                    <div class="job-portrait-job" style="color: ${centerRole ? centerRole.color : 'var(--gold-bright)'};">
                        ${currJob}${centerJobObj ? ' • ' + centerJobObj.name : ''}
                    </div>
                </div>
                <div class="gear-wiki-column gear-accessory-column">
                    <div class="gear-wiki-col-header">Accessories</div>
                    ${accessoryHtml}
                </div>
            </div>
        `;

        slotsGridCont.querySelectorAll(".btn-loot-pref").forEach(btn => {
            btn.addEventListener("click", (e) => {
                playSfx('click');
                const clickedPref = e.currentTarget.dataset.pref;
                const slotId = e.currentTarget.dataset.slot;
                setLootPref(targetMember, activeProgId, slotId, clickedPref);
                saveState();
                const row = e.currentTarget.closest(".gear-slot-row");
                if (row) {
                    row.querySelectorAll(".btn-loot-pref").forEach(b => b.classList.remove("active"));
                }
                e.currentTarget.classList.add("active");
                renderFightSummaryAndPriorities();
            });
        });
    }

    renderFightSummaryAndPriorities();
}

// ==========================================================================
// Painel Resumo & Prioridade de Loot por Luta
// ==========================================================================
function getLootPriorityForProg(progId) {
    if (!state.lootPriorities) state.lootPriorities = {};
    if (!Array.isArray(state.lootPriorities[progId])) {
        state.lootPriorities[progId] = [];
    }
    return state.lootPriorities[progId];
}

function syncLootPriorityWithActiveRoster(progId) {
    const currentList = getLootPriorityForProg(progId);
    const activeMemberIds = state.roster
        .filter(p => getPlayerStatusForProg(p, progId) === "active")
        .map(p => p.id);

    // Remove ids que não estão mais ativos
    const filtered = currentList.filter(id => activeMemberIds.includes(id));

    // Adiciona ao final da fila quem entrou novo no roster ativo
    activeMemberIds.forEach(id => {
        if (!filtered.includes(id)) filtered.push(id);
    });

    state.lootPriorities[progId] = filtered;
    return filtered;
}

function moveLootPriority(progId, memberId, direction) {
    const list = getLootPriorityForProg(progId);
    const idx = list.indexOf(memberId);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    state.lootPriorities[progId] = list;
    saveState();
    renderFightSummaryAndPriorities();
}

function renderFightSummaryAndPriorities() {
    const needsCont = document.getElementById("fight-needs-list");
    const priorityCont = document.getElementById("fight-priority-list");
    if (!needsCont || !priorityCont) return;

    const activeProgId = state.inspectedProgId || "geral";
    const activeMembers = state.roster.filter(p => getPlayerStatusForProg(p, activeProgId) === "active");

    // ---------- Necessidades & Conflitos ----------
    needsCont.innerHTML = "";
    let anyNeeds = false;

    GEAR_SLOTS.forEach(slot => {
        const needers = activeMembers.filter(p => getLootPref(p, activeProgId, slot.id) === "need");
        if (needers.length === 0) return;
        anyNeeds = true;

        const isConflict = needers.length >= 2;
        const row = document.createElement("div");
        row.className = `need-row ${isConflict ? 'conflict' : ''}`;
        row.title = isConflict
            ? `Conflito: ${needers.length} jogadores precisam de ${slot.name}`
            : `${needers.length} jogador precisa de ${slot.name}`;
        row.innerHTML = `
            <span class="need-slot-label">${slot.name}</span>
            <span class="need-players">${needers.map(p => p.name || "Sem Nick").join(", ")}</span>
        `;
        needsCont.appendChild(row);
    });

    if (!anyNeeds) {
        needsCont.innerHTML = `<div class="need-row empty-state">Nenhum titular declarou Need nesta luta ainda.</div>`;
    }

    // ---------- Fila de Prioridade ----------
    priorityCont.innerHTML = "";
    const priorityOrder = syncLootPriorityWithActiveRoster(activeProgId);

    if (priorityOrder.length === 0) {
        priorityCont.innerHTML = `<div class="priority-empty-state">Aloque titulares na Party Principal para montar a fila de prioridade.</div>`;
        return;
    }

    priorityOrder.forEach((memberId, idx) => {
        const player = state.roster.find(p => p.id === memberId);
        if (!player) return;

        const assignedJob = getAssignedJobForProg(player, activeProgId);
        const row = document.createElement("div");
        row.className = `priority-row rank-${idx + 1}`;
        row.innerHTML = `
            <span class="priority-rank">${idx + 1}</span>
            <span class="priority-name" title="${player.name || 'Sem Nick'}">${player.name || '<em>Sem Nick</em>'}</span>
            <span class="priority-job-sigla">${assignedJob}</span>
            <div class="priority-controls">
                <button type="button" class="btn-priority-move btn-priority-up" data-id="${player.id}" title="Subir na fila" ${idx === 0 ? 'disabled' : ''}>▲</button>
                <button type="button" class="btn-priority-move btn-priority-down" data-id="${player.id}" title="Descer na fila" ${idx === priorityOrder.length - 1 ? 'disabled' : ''}>▼</button>
            </div>
        `;
        priorityCont.appendChild(row);
    });

    priorityCont.querySelectorAll(".btn-priority-up").forEach(btn => {
        btn.addEventListener("click", () => {
            playSfx('click');
            moveLootPriority(activeProgId, btn.dataset.id, -1);
        });
    });
    priorityCont.querySelectorAll(".btn-priority-down").forEach(btn => {
        btn.addEventListener("click", () => {
            playSfx('click');
            moveLootPriority(activeProgId, btn.dataset.id, +1);
        });
    });
}

function updateDashboardStats() {
    const activeProgId = state.inspectedProgId || "geral";
    const titulares = state.roster.filter(p => getPlayerStatusForProg(p, activeProgId) === "active");
    const reservas = state.roster.filter(p => getPlayerStatusForProg(p, activeProgId) !== "active");
    
    const elTitulares = document.querySelector(".roster-count-item.titulares");
    const elReservas = document.querySelector(".roster-count-item.reservas");
    const elTotal = document.querySelector(".roster-count-item.total");
    
    if (elTitulares) elTitulares.textContent = `T: ${titulares.length}`;
    if (elReservas) elReservas.textContent = `R: ${reservas.length}`;
    if (elTotal) elTotal.textContent = `Tot: ${state.roster.length}`;

    const avgEl = document.getElementById("avg-ilvl");
    if (avgEl) {
        if (titulares.length === 0) {
            avgEl.textContent = "0";
        } else {
            const total = titulares.reduce((sum, p) => sum + (p.ilvl || 0), 0);
            avgEl.textContent = Math.round(total / titulares.length);
        }
    }
}

// ==========================================================================
// Controladores de Eventos Iniciais
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
    loadState();
    initCustomJobsGrid();

    const customJobsSelector = document.getElementById("custom-jobs-selector");
    const chkFlexCustom = document.getElementById("chk-flex-custom");

    if (chkFlexCustom && customJobsSelector) {
        chkFlexCustom.addEventListener("change", (e) => {
            playSfx('click');
            customJobsSelector.hidden = !e.target.checked;
        });
    }

    const btnAddMember = document.getElementById("btn-add-member");
    if (btnAddMember) {
        btnAddMember.addEventListener("click", () => {
            const nameInp = document.getElementById("input-member-name");
            const statusSel = document.getElementById("select-member-status");

            const name = nameInp ? nameInp.value.trim() : "";
            const statusVal = statusSel ? statusSel.value : "active";

            if (!name) {
                alert("Por favor, informe o Nome ou Nick in-game do jogador.");
                if (nameInp) nameInp.focus();
                return;
            }

            const checkedProfiles = Array.from(document.querySelectorAll(".chk-flex-profile:checked")).map(chk => chk.value);

            if (checkedProfiles.length === 0) {
                alert("Selecione pelo menos um Perfil Flex ou o modo Específico.");
                return;
            }

            const activeProgId = state.inspectedProgId || "geral";
            let finalStatusForProg = statusVal;

            if (statusVal === "active") {
                const activeCount = state.roster.filter(p => getPlayerStatusForProg(p, activeProgId) === "active").length;
                if (activeCount >= 8) {
                    alert("A Party Principal desta Raid já está completa com 8 jogadores! O novo jogador será adicionado automaticamente como Reserva neste conteúdo.");
                    finalStatusForProg = "bench";
                }
            }

            let mergedPool = [];
            checkedProfiles.forEach(pVal => {
                if (pVal === "custom") {
                    mergedPool.push(...Array.from(customSelectedJobs));
                } else if (FLEX_POOLS[pVal]) {
                    mergedPool.push(...FLEX_POOLS[pVal]);
                }
            });

            let jobsPool = Array.from(new Set(mergedPool));

            if (jobsPool.length === 0) {
                alert("Nenhuma classe resultante na Pool. Selecione pelo menos uma classe avulsa ou perfil predefinido.");
                return;
            }

            const assignedJob = jobsPool[0];
            const flexType = checkedProfiles.join("+");
            const assignedJobsByProg = {};
            const statusByProg = {};

            if (state.activeProgs && state.activeProgs.length > 0) {
                state.activeProgs.forEach(pId => {
                    assignedJobsByProg[pId] = assignedJob;
                    statusByProg[pId] = pId === activeProgId ? finalStatusForProg : "bench";
                });
            } else {
                assignedJobsByProg["geral"] = assignedJob;
                statusByProg["geral"] = finalStatusForProg;
            }

            state.roster.push({
                id: "mem_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
                name,
                flexType,
                jobsPool,
                assignedJob,
                assignedJobsByProg,
                monthlySchedule: {},
                statusByProg,
                ilvl: 710,
                bis: false,
                status: finalStatusForProg
            });

            playSfx('success');
            saveState();
            renderRosterTables();

            if (nameInp) nameInp.value = "";
            document.querySelectorAll(".chk-flex-profile").forEach(chk => chk.checked = false);
            if (customJobsSelector) customJobsSelector.hidden = true;
            initCustomJobsGrid();
        });
    }

    const btnAddProg = document.getElementById("btn-add-prog");
    if (btnAddProg) {
        btnAddProg.addEventListener("click", () => {
            const selSav = document.getElementById("select-add-savage");
            const selUlt = document.getElementById("select-add-ultimate");
            const targetId = (selSav ? selSav.value : "") || (selUlt ? selUlt.value : "");
            
            if (!targetId) {
                alert("Selecione uma Raid Savage ou uma Ultimate para adicionar aos seus progressos.");
                return;
            }
            
            if (!state.activeProgs) state.activeProgs = [];
            if (state.activeProgs.includes(targetId)) {
                alert("Este conteúdo já está na lista de progressos ativos.");
                return;
            }
            
            state.activeProgs.push(targetId);
            state.inspectedProgId = targetId;
            
            // Inicializa statusByProg de todo o elenco para o novo progresso
            state.roster.forEach(p => {
                if (!p.statusByProg) p.statusByProg = {};
                p.statusByProg[targetId] = p.status === "bench" ? "bench" : "bench"; // Inicia reservas para montar a party customizada
            });

            saveState();
            playSfx('success');
            
            if (selSav) selSav.value = "";
            if (selUlt) selUlt.value = "";
            
            renderActiveProgsPanel();
            renderProgTabsBar();
            renderRosterTables();
        });
    }

    const btnPrevMonth = document.getElementById("btn-prev-month");
    const btnNextMonth = document.getElementById("btn-next-month");
    if (btnPrevMonth) {
        btnPrevMonth.addEventListener("click", () => {
            playSfx('click');
            if (!state.currentMonth) state.currentMonth = new Date().toISOString().slice(0, 7);
            const [y, m] = state.currentMonth.split("-").map(Number);
            const prevDate = new Date(y, m - 2, 1);
            state.currentMonth = prevDate.toISOString().slice(0, 7);
            saveState();
            renderScheduleTable();
        });
    }
    if (btnNextMonth) {
        btnNextMonth.addEventListener("click", () => {
            playSfx('click');
            if (!state.currentMonth) state.currentMonth = new Date().toISOString().slice(0, 7);
            const [y, m] = state.currentMonth.split("-").map(Number);
            const nextDate = new Date(y, m, 1);
            state.currentMonth = nextDate.toISOString().slice(0, 7);
            saveState();
            renderScheduleTable();
        });
    }

    const staticNameInput = document.getElementById("static-name-input");
    if (staticNameInput) {
        staticNameInput.value = state.staticName;
        staticNameInput.addEventListener("input", (e) => {
            state.staticName = e.target.value;
            saveState();
        });
    }

    const selectContentType = document.getElementById("select-content-type");
    if (selectContentType) {
        selectContentType.value = state.contentType;
        selectContentType.addEventListener("change", (e) => {
            playSfx('click');
            state.contentType = e.target.value;
            renderEncounterOptions();
            saveState();
        });
    }

    const selectEncounter = document.getElementById("select-encounter");
    if (selectEncounter) {
        selectEncounter.addEventListener("change", (e) => {
            playSfx('click');
            state.selectedEncounter = e.target.value;
            updateSelectedContentDetails();
            saveState();
        });
    }

    const macroTextarea = document.getElementById("macro-textarea");
    if (macroTextarea) {
        macroTextarea.value = state.macroText;
        macroTextarea.addEventListener("input", (e) => {
            state.macroText = e.target.value;
            saveState();
        });
    }

    const strategyNotesInput = document.getElementById("strategy-notes");
    if (strategyNotesInput) {
        strategyNotesInput.value = state.strategyNotes;
        strategyNotesInput.addEventListener("input", (e) => {
            state.strategyNotes = e.target.value;
            saveState();
        });
    }

    const btnCopyMacro = document.getElementById("btn-copy-macro");
    if (btnCopyMacro) {
        btnCopyMacro.addEventListener("click", () => {
            navigator.clipboard.writeText(state.macroText).then(() => {
                playSfx('success');
                const originalText = btnCopyMacro.textContent;
                btnCopyMacro.textContent = "✔️ Copiado!";
                setTimeout(() => btnCopyMacro.textContent = originalText, 2000);
            });
        });
    }

    const btnThemeToggle = document.getElementById("btn-theme-toggle");
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener("click", () => {
            playSfx('click');
            state.theme = state.theme === 'dark' ? 'classic' : 'dark';
            applyTheme();
            saveState();
        });
    }

    const btnSoundToggle = document.getElementById("btn-sound-toggle");
    if (btnSoundToggle) {
        if (!state.sfx) btnSoundToggle.classList.remove("active");
        btnSoundToggle.addEventListener("click", () => {
            state.sfx = !state.sfx;
            btnSoundToggle.classList.toggle("active", state.sfx);
            playSfx('click');
            saveState();
        });
    }

    // CORREÇÃO CRÍTICA DO SELETOR DE ABAS PRINCIPAIS
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabPanes = document.querySelectorAll(".main-content > .tab-pane");

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

    const btnResetRoster = document.getElementById("btn-reset-roster");
    if (btnResetRoster) {
        btnResetRoster.addEventListener("click", () => {
            if (confirm("Tem certeza que deseja apagar todos os jogadores cadastrados no elenco geral?")) {
                state.roster = [];
                saveState();
                renderRosterTables();
                playSfx('success');
            }
        });
    }

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

    if (btnExportImport && modalShare) {
        btnExportImport.addEventListener("click", () => {
            playSfx('click');
            modalShare.hidden = false;
            if (exportTextarea) exportTextarea.value = JSON.stringify(state, null, 2);
        });
    }

    if (btnCloseModal && modalShare) {
        btnCloseModal.addEventListener("click", () => {
            playSfx('click');
            modalShare.hidden = true;
            if (importError) importError.hidden = true;
        });
    }

    if (modalShare) {
        modalShare.addEventListener("click", (e) => {
            if (e.target === modalShare) {
                modalShare.hidden = true;
                if (importError) importError.hidden = true;
            }
        });
    }

    if (btnShowExport && exportArea && importArea) {
        btnShowExport.addEventListener("click", () => {
            playSfx('click');
            btnShowExport.classList.add("active");
            if (btnShowImport) btnShowImport.classList.remove("active");
            exportArea.hidden = false;
            importArea.hidden = true;
            if (exportTextarea) exportTextarea.value = JSON.stringify(state, null, 2);
        });
    }

    if (btnShowImport && exportArea && importArea) {
        btnShowImport.addEventListener("click", () => {
            playSfx('click');
            btnShowImport.classList.add("active");
            if (btnShowExport) btnShowExport.classList.remove("active");
            importArea.hidden = false;
            exportArea.hidden = true;
            if (importError) importError.hidden = true;
            if (importTextarea) importTextarea.value = "";
        });
    }

    const btnCopyExport = document.getElementById("btn-copy-export");
    if (btnCopyExport && exportTextarea) {
        btnCopyExport.addEventListener("click", () => {
            exportTextarea.select();
            navigator.clipboard.writeText(exportTextarea.value).then(() => {
                playSfx('success');
                const orig = btnCopyExport.textContent;
                btnCopyExport.textContent = "✔️ Código Copiado com Sucesso!";
                setTimeout(() => btnCopyExport.textContent = orig, 2000);
            });
        });
    }

    const btnSaveImport = document.getElementById("btn-save-import");
    if (btnSaveImport && importTextarea) {
        btnSaveImport.addEventListener("click", () => {
            try {
                const importedData = JSON.parse(importTextarea.value);
                if (importedData && Array.isArray(importedData.roster)) {
                    state = { ...DEFAULT_STATE, ...importedData };
                    saveState();
                    
                    if (staticNameInput) staticNameInput.value = state.staticName;
                    const selContentType = document.getElementById("select-content-type");
                    if (selContentType) selContentType.value = state.contentType;
                    
                    renderActiveProgsPanel();
                    renderProgTabsBar();
                    renderEncounterOptions();
                    renderRosterTables();
                    renderEquipmentPanel();
                    applyTheme();
                    
                    playSfx('success');
                    if (modalShare) modalShare.hidden = true;
                    if (importError) importError.hidden = true;
                    alert("Dados do elenco carregados com sucesso!");
                } else {
                    throw new Error("Formato JSON inválido para o Roster.");
                }
            } catch (err) {
                if (importError) {
                    importError.textContent = "Erro ao importar: Código JSON corrompido ou incompatível.";
                    importError.hidden = false;
                }
            }
        });
    }

    renderActiveProgsPanel();
    renderProgTabsBar();
    renderEncounterOptions();
    renderRosterTables();
    renderEquipmentPanel();
});
