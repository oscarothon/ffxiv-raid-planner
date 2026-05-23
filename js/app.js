// Lógica da Aplicação - FFXIV Static Raid Planner Premium
// Suporta: Independência de Elenco por Raid, Seleção de Classes Inline Animada & Agenda Preditiva Avançada

// Ícones nativos do FFXIV: Emperor's New Attire — arquivos locais em assets/icons/emperor/
const EMP_ICON_BASE = "assets/icons/emperor";
const GEAR_SLOTS = [
    { id: "weapon",    name: "Arma",       itemName: "The Emperor's New Fists",     icon: "⚔️", group: "armor",     iconUrl: `${EMP_ICON_BASE}/fists.png` },
    { id: "head",      name: "Cabeça",     itemName: "The Emperor's New Hat",       icon: "🪖", group: "armor",     iconUrl: `${EMP_ICON_BASE}/hat.png` },
    { id: "body",      name: "Peito",      itemName: "The Emperor's New Robe",      icon: "🥋", group: "armor",     iconUrl: `${EMP_ICON_BASE}/robe.png` },
    { id: "hands",     name: "Mãos",       itemName: "The Emperor's New Gloves",    icon: "🧤", group: "armor",     iconUrl: `${EMP_ICON_BASE}/gloves.png` },
    { id: "legs",      name: "Pernas",     itemName: "The Emperor's New Breeches",  icon: "👖", group: "armor",     iconUrl: `${EMP_ICON_BASE}/breeches.png` },
    { id: "feet",      name: "Pés",        itemName: "The Emperor's New Boots",     icon: "🥾", group: "armor",     iconUrl: `${EMP_ICON_BASE}/boots.png` },
    { id: "earrings",  name: "Brincos",    itemName: "The Emperor's New Earrings",  icon: "✨", group: "accessory", iconUrl: `${EMP_ICON_BASE}/earrings.png` },
    { id: "necklace",  name: "Colar",      itemName: "The Emperor's New Necklace",  icon: "📿", group: "accessory", iconUrl: `${EMP_ICON_BASE}/necklace.png` },
    { id: "bracelets", name: "Bracelete", itemName: "The Emperor's New Bracelet",  icon: "⭕", group: "accessory", iconUrl: `${EMP_ICON_BASE}/bracelet.png` },
    { id: "ring1",     name: "Anel 1",     itemName: "The Emperor's New Ring",      icon: "💍", group: "accessory", iconUrl: `${EMP_ICON_BASE}/ring.png` },
    { id: "ring2",     name: "Anel 2",     itemName: "The Emperor's New Ring",      icon: "💍", group: "accessory", iconUrl: `${EMP_ICON_BASE}/ring.png` }
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
let activeContentTypeId = "raid";

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
    scheduledProgs: {}, // legado — migrado para raidEvents em hydrateState
    raidEvents: [],    // [{id, progId, date, quorum, createdBy, createdAt, postponedTo, postponedBy, postponedAt}]
    pendingNotifications: [], // [{id, date, progId, createdBy, createdAt}]
    lootPriorities: {}, // Mapeia "progId" -> [memberId em ordem de prioridade]
    roster: [],
    customContents: [], // [{id, name, partyMode: "full"|"light"|"dynamic", expansionId, iconUrl}] — Fase 8 / N
    expansions: [],     // [{id, name, levelCap, order, isLimited?}] — Fase N (seed em hydrateState)
};

const FLEX_POOLS = {
    melee: ["MNK", "DRG", "NIN", "SAM", "RPR", "VPR"],
    tank: ["PLD", "WAR", "DRK", "GNB"],
    healer: ["WHM", "SCH", "AST", "SGE"],
    ranged: ["BRD", "MCH", "DNC"],
    caster: ["BLM", "SMN", "RDM", "PCT"],
    all: ["PLD", "WAR", "DRK", "GNB", "WHM", "SCH", "AST", "SGE", "MNK", "DRG", "NIN", "SAM", "RPR", "VPR", "BRD", "MCH", "DNC", "BLM", "SMN", "RDM", "PCT"]
};

// Fase Q — grade de horários (12:00 → 02:00, 28 slots de 30 min)
const SCHED_SLOTS = [
    "12:00","12:30","13:00","13:30","14:00","14:30",
    "15:00","15:30","16:00","16:30","17:00","17:30",
    "18:00","18:30","19:00","19:30","20:00","20:30",
    "21:00","21:30","22:00","22:30","23:00","23:30",
    "00:00","00:30","01:00","01:30"
];

let state = {};
let customSelectedJobs = new Set();

// Ordena uma lista de jobIds segundo a ordem canônica definida em FFXIV_JOBS,
// garantindo que remover e re-adicionar um job retorne à mesma posição.
function sortJobsCanonical(jobIds) {
    const order = new Map(FFXIV_JOBS.map((j, i) => [j.id, i]));
    return [...jobIds].sort((a, b) => {
        const ia = order.has(a) ? order.get(a) : 999;
        const ib = order.has(b) ? order.get(b) : 999;
        return ia - ib;
    });
}

// ==========================================================================
// Sistema de Efeitos Sonoros FFXIV
// ==========================================================================
let audioCtx = null;
let localSfxEnabled = localStorage.getItem('sfx_enabled') !== 'false';
let localTheme = localStorage.getItem('theme') || 'dark';

function playSfx(type) {
    if (!localSfxEnabled) return;
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
// Gerenciamento de Estado e Persistência via API (Flask + SQLite)
// ==========================================================================
let currentUser = null;
let currentStaticName = null;
let currentInviteCode = null;
let currentStaticId = null;
let currentUserId = null;
let currentUserRole = null; // 'admin' | 'officer' | 'member'
let saveTimer = null;

// Sincronização entre contas (Fase 1B)
let lastStateETag = null;
let pollingTimer = null;
let pendingSaveAt = 0; // timestamp do último saveState() pendente — evita reload durante edição
const POLL_INTERVAL_MS = 5000;
const SAVE_QUIET_WINDOW_MS = 2000; // não recarrega se o user salvou nos últimos 2s

// ==========================================================================
// Helpers de Permissão (cargos: admin > officer > member)
// ==========================================================================
function isAdmin()    { return currentUserRole === 'admin'; }
function isOfficer()  { return currentUserRole === 'admin' || currentUserRole === 'officer'; }
function isMember()   { return !!currentUserRole; }

function isOwnSlot(player) {
    return !!player && player.user_id != null && player.user_id === currentUserId;
}
function findOwnSlot() {
    return state.roster.find(p => p.user_id === currentUserId) || null;
}
function hasOwnSlot() { return !!findOwnSlot(); }

function canManageRoles()    { return isAdmin(); }
function canManageStatic()   { return isAdmin(); } // staticName, reset roster, etc.
function canManageContent()  { return isOfficer(); } // add/remove progs, agendar, prioridade loot
function canEditOtherPlayer(){ return isOfficer(); }
function canEditPlayer(p)    { return isOfficer() || isOwnSlot(p); }
function canScheduleDate()   { return isOfficer(); }
function canEditScheduleFor(p) { return isOfficer() || isOwnSlot(p); }
function canEditEventDetails(evt) {
    if (!evt) return false;
    return isOfficer() || evt.createdBy === currentUserId;
}

// Rótulo amigável do cargo
function roleLabel(r) {
    if (r === 'admin')   return 'Administrador';
    if (r === 'officer') return 'Officer';
    if (r === 'member')  return 'Membro';
    return 'Visitante';
}

// ==========================================================================
// Modal de Confirmação Tematizado (substitui confirm() do browser)
// ==========================================================================
/**
 * Abre um modal tematizado e retorna uma Promise que resolve para true/false.
 * Uso:
 *   const ok = await showConfirm({ title, message, detail, confirmText, cancelText, danger });
 *   if (ok) { ... }
 */
function showConfirm(opts = {}) {
    return new Promise(resolve => {
        const modal     = document.getElementById("modal-confirm");
        const titleEl   = document.getElementById("modal-confirm-title");
        const msgEl     = document.getElementById("modal-confirm-message");
        const detailEl  = document.getElementById("modal-confirm-detail");
        const okBtn     = document.getElementById("btn-confirm-ok");
        const cancelBtn = document.getElementById("btn-confirm-cancel");
        if (!modal || !okBtn || !cancelBtn) {
            resolve(window.confirm(opts.message || "Confirmar?"));
            return;
        }

        titleEl.textContent = opts.title   || "Confirmar Ação";
        msgEl.textContent   = opts.message || "Tem certeza?";
        if (opts.detail) {
            detailEl.textContent = opts.detail;
            detailEl.hidden = false;
        } else {
            detailEl.hidden = true;
            detailEl.textContent = "";
        }
        okBtn.textContent     = opts.confirmText || "Confirmar";
        cancelBtn.textContent = opts.cancelText  || "Cancelar";
        okBtn.className = opts.danger ? "ff-btn-danger" : "ff-btn-action";

        modal.hidden = false;

        function cleanup() {
            modal.hidden = true;
            okBtn.removeEventListener("click", onOk);
            cancelBtn.removeEventListener("click", onCancel);
            modal.removeEventListener("click", onOverlay);
            document.removeEventListener("keydown", onKey);
        }
        function onOk()      { cleanup(); playSfx('success'); resolve(true); }
        function onCancel()  { cleanup(); playSfx('click');   resolve(false); }
        function onOverlay(e) { if (e.target === modal) onCancel(); }
        function onKey(e) {
            if (e.key === "Escape") onCancel();
            else if (e.key === "Enter") onOk();
        }

        okBtn.addEventListener("click", onOk);
        cancelBtn.addEventListener("click", onCancel);
        modal.addEventListener("click", onOverlay);
        document.addEventListener("keydown", onKey);

        // Foca o botão de cancelar por padrão (ação segura)
        setTimeout(() => cancelBtn.focus(), 50);
    });
}

// ==========================================================================
// Sistema de Toast (notificações tematizadas)
// ==========================================================================
function showToast(message, opts = {}) {
    const cont = document.getElementById("toast-container");
    if (!cont) {
        // fallback silencioso para console se o container ainda não existir
        console.warn("[toast]", message);
        return;
    }
    const type = opts.type || "info";
    const defaultTitles = {
        info:    "Aviso",
        warning: "Atenção",
        error:   "Sem permissão",
        success: "Sucesso"
    };
    const title = opts.title || defaultTitles[type] || "Aviso";
    const duration = opts.duration ?? 4500;

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <div class="toast-title">${title}</div>
        <div class="toast-body">${message}</div>
    `;
    cont.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-removing");
        setTimeout(() => toast.remove(), 320);
    }, duration);
}

function hydrateState(parsed) {
    state = { ...DEFAULT_STATE, ...(parsed || {}) };
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
    if (!Array.isArray(state.raidEvents)) {
        state.raidEvents = [];
    }
    // Migração: converte scheduledProgs legado → raidEvents (executa uma vez)
    if (Object.keys(state.scheduledProgs).length > 0 && state.raidEvents.length === 0) {
        state.raidEvents = Object.entries(state.scheduledProgs).map(([date, progId]) => ({
            id: `evt_${progId}_${date.replace(/-/g, '')}`,
            progId,
            date,
            quorum: 6,
            createdBy: null,
            createdAt: new Date().toISOString(),
            postponedTo: null,
            postponedBy: null,
            postponedAt: null,
        }));
        state.scheduledProgs = {};
    }
    if (!state.lootPriorities || typeof state.lootPriorities !== "object") {
        state.lootPriorities = {};
    }
    if (!Array.isArray(state.customContents)) {
        state.customContents = [];
    }

    // Bugfix: progNotes (descrição persistente do prog) foi removido — só
    // raidEvent.description existe. Limpa entradas legadas no estado.
    if (state.progNotes) delete state.progNotes;

    // Fase Q — raidEvents ganham time e durationMin (null = horário a definir)
    state.raidEvents.forEach(e => {
        if (e.time === undefined) e.time = null;
        if (e.durationMin === undefined) e.durationMin = null;
    });

    // Fase N — seed do catálogo de expansões (clona o seed para não compartilhar refs)
    if (!Array.isArray(state.expansions) || state.expansions.length === 0) {
        state.expansions = FFXIV_EXPANSIONS_SEED.map(e => ({ ...e }));
    }

    // Fase N — backfill: customs antigos com `expansion` (string) viram `expansionId`
    state.customContents.forEach(c => {
        if (!c.expansionId) {
            c.expansionId = resolveContentExpansionId(c);
        }
    });

    state.roster = state.roster.map(player => {
        const id = player.id || "mem_" + Math.random().toString(36).substr(2, 9);
        const flexType = player.flexType || "custom";
        let jobsPool = player.jobsPool || [];
        if (jobsPool.length === 0 && player.job) jobsPool = [player.job];
        if (jobsPool.length === 0) jobsPool = ["WAR"];

        const assignedJob = player.assignedJob || player.job || jobsPool[0];
        const assignedJobsByProg = player.assignedJobsByProg || {};
        const monthlySchedule = player.monthlySchedule || {};
        // Fase Q — migração: string → {status, ranges}; "late" legado vira "maybe"
        Object.keys(monthlySchedule).forEach(k => {
            const v = monthlySchedule[k];
            if (typeof v === "string") {
                monthlySchedule[k] = { status: v === "late" ? "maybe" : v, ranges: [] };
            }
        });
        const statusByProg = player.statusByProg || {};
        const baseStatus = player.status === "bench" ? "bench" : "active";

        if (state.activeProgs && state.activeProgs.length > 0) {
            state.activeProgs.forEach(pId => {
                if (!statusByProg[pId]) statusByProg[pId] = baseStatus;
            });
        }

        return {
            id,
            user_id: (typeof player.user_id === "number") ? player.user_id : null,
            name: player.name || "",
            flexType,
            jobsPool,
            assignedJob,
            assignedJobsByProg,
            monthlySchedule,
            statusByProg,
            ilvl: parseInt(player.ilvl) || 710,
            bis: !!player.bis,
            status: baseStatus,
            lootPreferences: player.lootPreferences || {}
        };
    });

    applyTheme();
}

async function loadState() {
    try {
        const res = await API.getState();
        currentStaticName = res.static_name;
        currentInviteCode = res.invite_code;
        currentStaticId   = res.static_id;
        currentUserId     = res.user_id;
        currentUserRole   = res.user_role;
        lastStateETag     = res.etag || null;
        // Fase O.2 — map {user_id: character} dos members da static
        currentCharacters = (res.characters && typeof res.characters === "object") ? res.characters : {};
        hydrateState(res.data || {});
        return "loaded";
    } catch (err) {
        if (err.status === 401) return "needs_login";
        if (err.status === 404 && err.data && err.data.error === "no_active_static") {
            return "needs_static";
        }
        console.error("Falha ao carregar estado:", err);
        return "error";
    }
}

// Throttle pra mensagens de erro de save — evita spam quando uma mesma ação
// gera múltiplas falhas em sequência (ex: input rápido, race com polling).
const SAVE_ERROR_TOAST_COOLDOWN_MS = 8000;
let _lastSaveErrorToastAt = 0;
function maybeShowSaveErrorToast(message) {
    const now = Date.now();
    if (now - _lastSaveErrorToastAt < SAVE_ERROR_TOAST_COOLDOWN_MS) return;
    _lastSaveErrorToastAt = now;
    showToast(message, { type: "error" });
}

function saveState() {
    delete state.loot;
    pendingSaveAt = Date.now();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        // Limpa o timer antes do PUT pra que polling possa rodar enquanto request está in-flight
        saveTimer = null;
        API.putState(state).then(res => {
            // O backend retorna o novo ETag após salvar — evita reload desnecessário no polling
            if (res && res.etag) lastStateETag = res.etag;
            pendingSaveAt = Date.now(); // marca o save como concluído (mas mantém janela quieta)
        }).catch(err => {
            console.error("Falha ao salvar estado:", err);
            if (err.status === 401) {
                showAuthModal();
                return;
            }
            if (err.status === 403 && err.data && err.data.error === "forbidden_changes") {
                // Backend rejeitou mudanças por falta de permissão.
                // Recarrega o estado canônico para reverter a UI (1x).
                maybeShowSaveErrorToast("Você não tem autoridade para realizar essa alteração. As mudanças foram revertidas.");
                bootstrapAfterAuth();
                return;
            }
            // Outros erros (rede, 5xx): só warning no console, sem toast — geralmente
            // se resolve no próximo save automático ou no polling.
        });
    }, 400);
    updateDashboardStats();
}

function applyTheme() {
    document.body.classList.remove('theme-classic', 'theme-darkness');
    if (localTheme === 'classic')   document.body.classList.add('theme-classic');
    else if (localTheme === 'darkness') document.body.classList.add('theme-darkness');

    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
        const labels = { dark: 'Crystal Blue', classic: 'Classic Dark', darkness: 'Darkness' };
        const span = btn.querySelector('.txt');
        if (span) span.textContent = labels[localTheme] || 'Tema';
    }
}

// ==========================================================================
// Sincronização entre Contas (Polling com ETag) — Fase 1B
// ==========================================================================

/**
 * Aplica novo estado vindo do servidor preservando ao máximo o contexto local
 * do usuário (aba ativa, prog inspecionado, foco em input, scroll, modal aberto).
 */
function applyRemoteState(newPayload) {
    // Preserva contexto de UI
    const activeTab        = document.querySelector(".tab-btn.active")?.dataset?.tab;
    const inspectedProgId  = state.inspectedProgId;
    const focusedEl        = document.activeElement;
    const focusedId        = focusedEl && focusedEl.id ? focusedEl.id : null;
    const focusedDataId    = focusedEl && focusedEl.dataset && focusedEl.dataset.id ? focusedEl.dataset.id : null;
    const focusedTag       = focusedEl ? focusedEl.tagName : null;
    const cursorStart      = focusedEl && typeof focusedEl.selectionStart === "number" ? focusedEl.selectionStart : null;
    const cursorEnd        = focusedEl && typeof focusedEl.selectionEnd === "number" ? focusedEl.selectionEnd : null;
    const scrollY          = window.scrollY;

    // Hidrata o estado canônico
    currentStaticName = newPayload.static_name;
    currentInviteCode = newPayload.invite_code;
    currentUserRole   = newPayload.user_role;
    lastStateETag     = newPayload.etag || null;
    // Fase O.2 — refresca o map de characters dos members (slots da Party
    // dependem desse map pra ler nome/ilvl/jobs via getSlotIdentity).
    if (newPayload.characters && typeof newPayload.characters === "object") {
        currentCharacters = newPayload.characters;
    }
    hydrateState(newPayload.data || {});

    // Restaura prog inspecionado se ainda existir
    if (inspectedProgId && state.activeProgs && state.activeProgs.includes(inspectedProgId)) {
        state.inspectedProgId = inspectedProgId;
    }

    // Re-render completo
    renderActiveProgsPanel();
    renderProgTabsBar();
    renderRosterTables();
    renderEquipmentPanel();
    renderNotificationBanner();
    updateUserPill();
    applyTheme();

    // Restaura aba ativa sem disparar click (evita SFX + side effects)
    if (activeTab) {
        document.querySelectorAll(".tab-btn").forEach(b => {
            const isTarget = b.dataset.tab === activeTab;
            b.classList.toggle("active", isTarget);
            b.setAttribute("aria-selected", isTarget ? "true" : "false");
        });
        document.querySelectorAll(".main-content > .tab-pane").forEach(p => {
            p.hidden = p.id !== `${activeTab}-tab`;
        });
    }

    // Tenta restaurar foco e cursor
    if (focusedId) {
        const el = document.getElementById(focusedId);
        if (el) {
            el.focus();
            if (cursorStart !== null && typeof el.setSelectionRange === "function") {
                try { el.setSelectionRange(cursorStart, cursorEnd); } catch (_) {}
            }
        }
    } else if (focusedDataId && focusedTag === "INPUT") {
        const el = document.querySelector(`input[data-id="${focusedDataId}"]`);
        if (el) {
            el.focus();
            if (cursorStart !== null && typeof el.setSelectionRange === "function") {
                try { el.setSelectionRange(cursorStart, cursorEnd); } catch (_) {}
            }
        }
    }

    window.scrollTo(0, scrollY);
}

async function pollServerState() {
    if (!currentUserId || !currentStaticId) return;
    // Janela quieta: se o usuário acabou de editar algo, evita reload em cima da edição
    if (Date.now() - pendingSaveAt < SAVE_QUIET_WINDOW_MS) return;
    // Se há save pendente em debounce, espera
    if (saveTimer) return;
    // Não roda se a aba do navegador está oculta — economiza
    if (document.hidden) return;

    try {
        const res = await API.getStateConditional(lastStateETag);
        if (res.notModified) return; // nada mudou
        if (!res.payload) return;
        const prevRole        = currentUserRole;
        const prevStaticName  = currentStaticName;
        const prevActiveProgs = JSON.stringify(state.activeProgs || []);
        const prevScheduled   = JSON.stringify(state.scheduledProgs || {});
        const prevLoot        = JSON.stringify(state.lootPriorities || {});

        applyRemoteState(res.payload);
        if (isOfficer()) refreshPendingBadge();

        const significantChange =
            currentUserRole   !== prevRole        ||
            currentStaticName !== prevStaticName  ||
            JSON.stringify(state.activeProgs    || []) !== prevActiveProgs ||
            JSON.stringify(state.scheduledProgs || {}) !== prevScheduled   ||
            JSON.stringify(state.lootPriorities || {}) !== prevLoot;

        if (significantChange) {
            showToast("Dados atualizados — alterações de outro membro foram recebidas.", { type: "info", duration: 3500, title: "Sincronizado" });
        }
    } catch (err) {
        // Sessão expirou ou conta foi deletada por admin — em ambos os casos,
        // o usuário perdeu o acesso e precisa ser levado de volta para o login.
        if (err.status === 401) {
            await handleKickFromStatic("Sua sessão foi encerrada. Faça login novamente.");
            return;
        }
        if (err.status === 403 && err.data && err.data.error === "not_a_member") {
            await handleKickFromStatic("Você foi removido desta static por um administrador.");
            return;
        }
        console.warn("Polling falhou:", err);
    }
}

function startPolling() {
    stopPolling();
    pollingTimer = setInterval(pollServerState, POLL_INTERVAL_MS);
    // Dispara também quando a aba volta a ser visível ou ganha foco
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onWindowFocus);
}

function stopPolling() {
    if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
    }
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("focus", onWindowFocus);
}

function onVisibilityChange() {
    if (!document.hidden) pollServerState();
}
function onWindowFocus() {
    pollServerState();
}

/**
 * Limpa toda a sessão local quando o user é removido da static
 * (por admin ou por auto-kick). Faz logout no backend e volta para a tela de login.
 */
async function handleKickFromStatic(message) {
    stopPolling();
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    showToast(message || "Você não tem mais acesso a esta static.", {
        type: "warning",
        title: "Acesso revogado",
        duration: 6000,
    });
    try { await API.logout(); } catch (_) {}
    currentUser = null;
    currentUserRole = null;
    currentUserId = null;
    currentStaticId = null;
    lastStateETag = null;
    updateUserPill();
    // Fecha modais que possam estar abertos
    document.querySelectorAll(".ff-modal-overlay").forEach(m => { if (m.id !== "modal-auth") m.hidden = true; });
    showAuthModal();
}

// ==========================================================================
// Acessores de Propriedades por Raid (Independência de Status e Classe)
// ==========================================================================
function getAssignedJobForProg(player, progId) {
    if (!player) return "WAR";
    const targetProg = progId || state.inspectedProgId || "geral";
    // Fase 14 — conteúdo limited tem job travado por definição
    if (isLimitedProg(targetProg)) {
        return getLimitedJob(targetProg);
    }
    if (targetProg !== "geral" && player.assignedJobsByProg && player.assignedJobsByProg[targetProg]) {
        return player.assignedJobsByProg[targetProg];
    }
    return player.assignedJob || player.jobsPool[0] || "WAR";
}

function setAssignedJobForProg(player, progId, jobId) {
    if (!player) return;
    const targetProg = progId || state.inspectedProgId || "geral";
    // Fase 14 — não persiste seleção em conteúdo limited (job é sempre o travado)
    if (isLimitedProg(targetProg)) return;
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

// Slot está visível neste prog? (statusByProg !== "removed").
// Use em filtros que listam "todos os participantes" (titular + reserva).
function isPlayerInProg(player, progId) {
    return getPlayerStatusForProg(player, progId) !== "removed";
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

// ============================================================================
// Fase N — Catálogo de Expansões: helpers de retrocompat e lookup
// ============================================================================

function normalizeExpansionName(name) {
    return String(name || "").toLowerCase().trim().replace(/\s+/g, " ");
}

function getExpansionById(id) {
    if (!id) return null;
    const list = (state && Array.isArray(state.expansions)) ? state.expansions : [];
    return list.find(e => e.id === id) || null;
}

function getExpansionIdByName(name) {
    if (!name) return null;
    const norm = normalizeExpansionName(name);
    const list = (state && Array.isArray(state.expansions)) ? state.expansions : [];
    const direct = list.find(e => normalizeExpansionName(e.name) === norm);
    if (direct) return direct.id;
    if (typeof EXPANSION_ALIASES !== "undefined" && EXPANSION_ALIASES[norm]) {
        return EXPANSION_ALIASES[norm];
    }
    return null;
}

// Resolve em camadas: expansionId direto → nome+aliases → heurística por nome do
// conteúdo → fallback permissivo (expansão mais recente). Nunca retorna null para
// conteúdos válidos (PLANNING_V2 Fase N: "nenhum conteúdo fica sem expansão").
function resolveContentExpansionId(content) {
    if (!content) return null;
    if (content.expansionId) return content.expansionId;
    const fromName = getExpansionIdByName(content.expansion);
    if (fromName) return fromName;
    const cname = content.name || content.id || "";
    if (typeof CONTENT_NAME_EXPANSION_HINTS !== "undefined") {
        for (const hint of CONTENT_NAME_EXPANSION_HINTS) {
            if (hint.match.test(cname)) return hint.expId;
        }
    }
    const list = (state && Array.isArray(state.expansions)) ? state.expansions : [];
    const normal = list.filter(e => !e.isLimited);
    if (normal.length > 0) {
        return normal.reduce((a, b) => (a.order > b.order ? a : b)).id;
    }
    return null;
}

function getExpansionDisplayName(content) {
    if (!content) return "";
    const id = resolveContentExpansionId(content);
    if (id) {
        const exp = getExpansionById(id);
        if (exp) return exp.name;
    }
    return content.expansion || "";
}

function getProgObj(progId) {
    if (progId === "geral") return { id: "geral", name: "Geral Padrão", expansionId: null };
    const customs = Array.isArray(state.customContents) ? state.customContents : [];
    const limited = Array.isArray(FFXIV_LIMITED_CONTENTS) ? FFXIV_LIMITED_CONTENTS : [];
    const allTargets = [...FFXIV_RAIDS, ...FFXIV_ULTIMATES, ...limited, ...customs];
    return allTargets.find(t => t.id === progId) || { id: progId, name: progId, expansionId: null };
}

// ============================================================================
// Fase O — Personagem (1:1 com o user logado, vive em users.character_json)
// ============================================================================

let currentCharacter = null; // {name, ilvl, currentExpansionId, jobs:[{id,level?}], subscribedProgs:[]}
let currentCharacters = {}; // Map {user_id: character} dos members da static (Fase O.2)
let _characterSaveTimer = null;

// Lê identidade (nome, ilvl, jobs/jobsPool) de um slot do roster. Se o slot
// tem user_id vinculado E temos o character_json desse user no map, usa esses
// dados. Senão (slots legados), retorna do próprio slot (comportamento antigo).
function getSlotIdentity(player) {
    if (!player) return { name: "", ilvl: 0, jobsPool: [], fromCharacter: false };
    const uid = player.user_id;
    if (uid != null && currentCharacters && currentCharacters[uid]) {
        const c = currentCharacters[uid];
        const jobs = Array.isArray(c.jobs) ? c.jobs.map(j => j && j.id).filter(Boolean) : [];
        return {
            name: (c.name || player.name || ""),
            ilvl: (typeof c.ilvl === "number" && c.ilvl > 0) ? c.ilvl : (player.ilvl || 0),
            jobsPool: jobs.length > 0 ? jobs : (player.jobsPool || []),
            fromCharacter: true,
            character: c,
        };
    }
    return {
        name: player.name || "",
        ilvl: player.ilvl || 0,
        jobsPool: player.jobsPool || [],
        fromCharacter: false,
    };
}

function emptyCharacter() {
    return { name: "", ilvl: null, currentExpansionId: null, jobs: [], subscribedProgs: [] };
}

async function loadCharacter() {
    try {
        const data = await API.getCharacter();
        currentCharacter = {
            ...emptyCharacter(),
            ...(data || {}),
            jobs: Array.isArray(data?.jobs) ? data.jobs : [],
            subscribedProgs: Array.isArray(data?.subscribedProgs) ? data.subscribedProgs : [],
        };
    } catch (err) {
        console.warn("loadCharacter falhou:", err);
        currentCharacter = emptyCharacter();
    }
}

// Reivindica um slot livre do roster: backend copia name/ilvl/jobsPool para o
// character_json, seta slot.user_id e responde com o character resultante.
async function claimRosterSlot(slotId) {
    try {
        const res = await API.claimSlot(slotId);
        if (res && res.character) {
            currentCharacter = {
                ...emptyCharacter(),
                ...res.character,
                jobs: Array.isArray(res.character.jobs) ? res.character.jobs : [],
                subscribedProgs: Array.isArray(res.character.subscribedProgs) ? res.character.subscribedProgs : [],
            };
        }
        // Recarrega state pra trazer roster atualizado + characters map
        await loadState();
        renderAllAfterLoad();
        showToast("Slot vinculado ao seu personagem. Edite seus dados na aba Personagem.", {
            type: "success",
            title: "Slot reivindicado",
        });
        playSfx('success');
    } catch (err) {
        const code = err?.data?.error || err?.message;
        let msg = "Não foi possível reivindicar o slot.";
        if (code === "already_has_slot") msg = "Você já tem um slot vinculado nesta static.";
        else if (code === "slot_already_claimed") msg = "Esse slot já foi reivindicado por outro membro.";
        else if (code === "slot_not_found") msg = "Slot não existe.";
        showToast(msg, { type: "error", title: "Falhou" });
    }
}

function saveCharacterDebounced() {
    if (!currentCharacter) return;
    // Fase P — sincroniza o map distribuído (`currentCharacters`) com o estado
    // local do user logado, para que consumidores que leem do map (ex.: outros
    // pontos da UI) também enxerguem a edição antes do próximo polling.
    if (currentUserId != null) {
        if (!currentCharacters || typeof currentCharacters !== "object") currentCharacters = {};
        currentCharacters[currentUserId] = currentCharacter;
    }
    // Re-renderiza views que dependem da identidade/compatibilidade do char.
    // Sem isso, mudar expansão/level do Limited não reflete na agenda mensal
    // nem em "Próximos dias de raid" até o próximo poll (~5s).
    try {
        if (typeof renderScheduleTable === "function") renderScheduleTable();
        if (typeof renderQuickSchedule === "function") renderQuickSchedule();
    } catch (e) { /* renderers ainda não montados */ }

    if (_characterSaveTimer) clearTimeout(_characterSaveTimer);
    _characterSaveTimer = setTimeout(async () => {
        try {
            await API.putCharacter(currentCharacter);
            showCharacterSaveIndicator();
        } catch (err) {
            console.warn("saveCharacter falhou:", err);
            if (err.status === 401) {
                showAuthModal();
                return;
            }
            // Erros não-autenticação: throttled toast pra não spammar em sequência.
            maybeShowSaveErrorToast("Não foi possível salvar o personagem. Tente novamente.");
        }
    }, 400);
}

function showCharacterSaveIndicator() {
    const el = document.getElementById("char-save-indicator");
    if (!el) return;
    el.hidden = false;
    el.classList.remove("is-fading");
    clearTimeout(el._fadeTimer);
    el._fadeTimer = setTimeout(() => {
        el.classList.add("is-fading");
        setTimeout(() => { el.hidden = true; }, 400);
    }, 1500);
}

function renderCharacterTab() {
    if (!currentCharacter) return;
    renderCharacterIdentity();
    renderCharacterJobs();
    renderCharacterProgs();
}

// Avalia se o personagem atende aos requisitos para marcar uma linha como
// "Evento Ativo". Pode receber um content (não-Limited) OU um evento Limited.
// Retorna { markable: boolean, reason?: string }.
//
// Regras:
//  - Para evento Limited específico: char tem o job E level ≥ event.limitedJobMinLevel.
//  - Para conteúdo normal: char.currentExpansionId definido E order ≥ order do conteúdo.
//  - Conteúdo sem expansionId resolvível (raro após Fase N): sempre permite.
function isContentMarkableForCharacter(target, character) {
    if (!target || !character) return { markable: false, reason: "Dados ausentes." };

    // Detecta se é um raidEvent Limited (tem progId + limitedJobMinLevel)
    const isLimitedEvent = !!(target.progId && Number.isFinite(target.limitedJobMinLevel));
    if (isLimitedEvent) {
        const prog = getProgObj(target.progId);
        const jobId = prog && prog.limitedJobId;
        if (!jobId) return { markable: true };
        const jobs = Array.isArray(character.jobs) ? character.jobs : [];
        const ownsJob = jobs.find(j => j && j.id === jobId);
        if (!ownsJob) {
            return { markable: false, reason: `Você precisa ter ${jobId} em suas classes para participar.` };
        }
        const minLevel = target.limitedJobMinLevel || 1;
        const level = Number(ownsJob.level || 0);
        if (level < minLevel) {
            return { markable: false, reason: `Seu ${jobId} está no nível ${level || "—"}; este evento requer nível ${minLevel}.` };
        }
        return { markable: true };
    }

    // Conteúdo Limited sem evento associado: nada a marcar (Eventos Ativos
    // de Limited só listam eventos individuais)
    if (target.partyMode === "limited") {
        return { markable: false, reason: "Limited só pode ser marcado por evento específico." };
    }

    // Normal: compara order da expansão atual com a do conteúdo.
    // target pode ser um raidEvent (tem progId mas não expansionId); nesse
    // caso busca o conteúdo real via getProgObj para ter o expansionId correto.
    const contentObj = target.progId ? getProgObj(target.progId) : target;
    const contentExpId = resolveContentExpansionId(contentObj);
    if (!contentExpId) return { markable: true };
    // Fase P — fallback permissivo: char sem currentExpansionId (legado /
    // produção pré-Fase O) NÃO é bloqueado. O PLANNING_V2 define
    // explicitamente: "char sem currentExpansionId... → conta como
    // compatível." Para esses casos a UI da aba Personagem pede pro user
    // definir, mas a contagem de quórum não pune retroativamente.
    if (!character.currentExpansionId) return { markable: true };
    const charExp = getExpansionById(character.currentExpansionId);
    const contentExp = getExpansionById(contentExpId);
    if (!charExp || !contentExp) return { markable: true };
    if ((charExp.order || 0) < (contentExp.order || 0)) {
        return { markable: false, reason: `Você precisa estar em ${contentExp.name} ou superior (sua atual: ${charExp.name}).` };
    }
    return { markable: true };
}

function renderCharacterIdentity() {
    const nameEl = document.getElementById("char-name");
    const ilvlEl = document.getElementById("char-ilvl");
    const expSel = document.getElementById("char-expansion");
    if (!nameEl || !ilvlEl || !expSel) return;

    nameEl.value = currentCharacter.name || "";
    ilvlEl.value = currentCharacter.ilvl ?? "";

    // Popula expansões normais (sem Limited Job — Limited tem validação própria
    // baseada no level do job, não na ordem da expansão)
    expSel.innerHTML = "";
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "— Selecione —";
    expSel.appendChild(blank);
    (state.expansions || []).slice()
        .filter(exp => !exp.isLimited)
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .forEach(exp => {
            const o = document.createElement("option");
            o.value = exp.id;
            const cap = exp.levelCap ? ` (lvl ${exp.levelCap})` : "";
            o.textContent = `${exp.name}${cap}`;
            expSel.appendChild(o);
        });
    expSel.value = currentCharacter.currentExpansionId || "";
}

function renderCharacterJobs() {
    const grid = document.getElementById("char-jobs-grid");
    if (!grid) return;
    grid.innerHTML = "";
    const byId = new Map((currentCharacter.jobs || []).map(j => [j.id, j]));

    FFXIV_JOBS.forEach(job => {
        const selected = byId.has(job.id);
        const charJob = byId.get(job.id);
        const card = document.createElement("div");
        card.className = `char-job-card${selected ? ' is-selected' : ''}`;
        card.dataset.jobId = job.id;
        card.innerHTML = `
            <img src="${job.iconUrl}" alt="${job.id}" onerror="this.style.display='none'">
            <span class="char-job-id">${job.id}</span>
            <input type="number" class="char-job-level" min="1" max="100" placeholder="lvl"
                   value="${charJob?.level ?? ''}" aria-label="Level de ${job.name}">
        `;
        card.addEventListener("click", (e) => {
            // Click no input não toggla
            if (e.target.classList.contains("char-job-level")) return;
            toggleCharacterJob(job.id);
        });
        const lvlInput = card.querySelector(".char-job-level");
        lvlInput.addEventListener("input", () => {
            const j = (currentCharacter.jobs || []).find(jj => jj.id === job.id);
            if (!j) return;
            const v = parseInt(lvlInput.value, 10);
            if (Number.isFinite(v) && v > 0) j.level = v;
            else delete j.level;
            saveCharacterDebounced();
            // Se este job é o de algum Limited subscribed, pode ter caído
            // abaixo do mínimo — revalidar.
            revalidateSubscribedProgs();
        });
        lvlInput.addEventListener("click", e => e.stopPropagation());
        grid.appendChild(card);
    });
}

function toggleCharacterJob(jobId) {
    if (!currentCharacter) return;
    if (!Array.isArray(currentCharacter.jobs)) currentCharacter.jobs = [];
    const idx = currentCharacter.jobs.findIndex(j => j.id === jobId);
    if (idx >= 0) currentCharacter.jobs.splice(idx, 1);
    else currentCharacter.jobs.push({ id: jobId });
    saveCharacterDebounced();
    renderCharacterJobs();
    // Limited pode ter virado incompatível (perda do job) — revalidar.
    revalidateSubscribedProgs();
}

// Após mudança em currentExpansionId, jobs ou level: remove silenciosamente
// dos subscribedProgs aqueles que deixaram de ser compatíveis e re-renderiza
// a lista (pois eventos antes bloqueados podem ter virado elegíveis).
// subscribedProgs pode conter progIds (não-Limited) ou eventIds (Limited).
function revalidateSubscribedProgs() {
    if (!currentCharacter) return;
    const subs = Array.isArray(currentCharacter.subscribedProgs) ? currentCharacter.subscribedProgs : [];
    const events = Array.isArray(state.raidEvents) ? state.raidEvents : [];

    const removed = [];
    if (subs.length > 0) {
        const kept = [];
        subs.forEach(subId => {
            // Tenta resolver como eventId primeiro (Limited)
            const evt = events.find(e => e && e.id === subId);
            if (evt) {
                const elig = isContentMarkableForCharacter(evt, currentCharacter);
                if (elig.markable) kept.push(subId);
                else {
                    const prog = getProgObj(evt.progId);
                    const date = evt.postponedTo || evt.date || "";
                    const dd = date.split("-").reverse().slice(0, 2).join("/");
                    removed.push(`${prog.name || evt.progId} (${dd})`);
                }
                return;
            }
            // Senão tenta como progId
            const prog = getProgObj(subId);
            if (!prog) { kept.push(subId); return; }
            const elig = isContentMarkableForCharacter(prog, currentCharacter);
            if (elig.markable) kept.push(subId);
            else removed.push(prog.name || subId);
        });
        if (removed.length > 0) {
            currentCharacter.subscribedProgs = kept;
            saveCharacterDebounced();
        }
    }

    renderCharacterProgs();

    if (removed.length > 0) {
        const list = removed.join(", ");
        const word = removed.length === 1 ? "evento" : "eventos";
        showToast(`${removed.length} ${word} removido(s) de Eventos Ativos: ${list}`, {
            type: "info",
            title: "Incompatibilidade detectada",
        });
    }
}

function renderCharacterProgs() {
    const cont = document.getElementById("char-progs-list");
    if (!cont) return;
    cont.innerHTML = "";
    const active = Array.isArray(state.activeProgs) ? state.activeProgs : [];
    if (active.length === 0) {
        cont.innerHTML = `<div class="character-progs-empty">Nenhum evento ativo na static.</div>`;
        return;
    }
    const subs = new Set(currentCharacter.subscribedProgs || []);
    const events = Array.isArray(state.raidEvents) ? state.raidEvents : [];

    // Acumula linhas pra ordenar consistentemente: não-Limited primeiro, depois
    // Limited por data crescente.
    const rows = [];

    active.forEach(progId => {
        const prog = getProgObj(progId);
        const isLimited = prog.partyMode === "limited";

        if (isLimited) {
            // Para Limited, listamos uma linha por EVENTO futuro daquele prog.
            // Sem evento agendado, o conteúdo não aparece.
            const progEvents = events
                .filter(e => e && e.progId === progId)
                .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
            progEvents.forEach(evt => {
                const subId = evt.id;
                const date = evt.postponedTo || evt.date || "";
                const [yy, mm, dd] = date.split("-");
                const dateLabel = (dd && mm) ? `${dd}/${mm}` : date;
                const lvlPart = Number.isFinite(evt.limitedJobMinLevel) ? ` · Lv. ${evt.limitedJobMinLevel}+` : "";
                const labelPart = evt.eventLabel ? ` · ${evt.eventLabel}` : "";
                const eventDisplay = `${prog.name} — ${dateLabel}${lvlPart}${labelPart}`;
                const eligibility = isContentMarkableForCharacter(evt, currentCharacter);
                rows.push({
                    sortKey: `1_${date}_${prog.name}`,
                    subId,
                    display: eventDisplay,
                    meta: prog.limitedJobId || "",
                    eligibility,
                });
            });
        } else {
            // Não-Limited: linha por prog (1 sub por progId)
            const eligibility = isContentMarkableForCharacter(prog, currentCharacter);
            rows.push({
                sortKey: `0_${prog.name}`,
                subId: progId,
                display: prog.name || progId,
                meta: getExpansionDisplayName(prog) || "",
                eligibility,
            });
        }
    });

    if (rows.length === 0) {
        cont.innerHTML = `<div class="character-progs-empty">Nenhum evento elegível.</div>`;
        return;
    }

    rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    rows.forEach(({ subId, display, meta, eligibility }) => {
        const subscribed = subs.has(subId);
        const blocked = !eligibility.markable;
        const row = document.createElement("label");
        row.className = `char-prog-row${subscribed ? ' is-subscribed' : ''}${blocked ? ' is-blocked' : ''}`;
        if (blocked) row.title = eligibility.reason || "";
        row.innerHTML = `
            <input type="checkbox" ${subscribed ? 'checked' : ''} ${blocked ? 'disabled' : ''} data-sub-id="${escapeHtml(subId)}">
            <span class="char-prog-name">${escapeHtml(display)}</span>
            ${meta ? `<span class="char-prog-meta">${escapeHtml(meta)}</span>` : ''}
            ${blocked ? `<span class="char-prog-blocked-icon" aria-label="Bloqueado">🔒</span>` : ''}
        `;
        const cb = row.querySelector("input");
        cb.addEventListener("change", () => {
            if (blocked) { cb.checked = false; return; }
            const list = currentCharacter.subscribedProgs = Array.isArray(currentCharacter.subscribedProgs)
                ? currentCharacter.subscribedProgs : [];
            const idx = list.indexOf(subId);
            if (cb.checked && idx < 0) list.push(subId);
            else if (!cb.checked && idx >= 0) list.splice(idx, 1);
            saveCharacterDebounced();
            row.classList.toggle("is-subscribed", cb.checked);
        });
        cont.appendChild(row);
    });
}

// Listeners dos inputs de identidade (configurados 1x no DOMContentLoaded)
function bindCharacterIdentityListeners() {
    const nameEl = document.getElementById("char-name");
    const ilvlEl = document.getElementById("char-ilvl");
    const expSel = document.getElementById("char-expansion");
    if (nameEl) nameEl.addEventListener("input", () => {
        currentCharacter.name = nameEl.value;
        saveCharacterDebounced();
    });
    if (ilvlEl) ilvlEl.addEventListener("input", () => {
        const v = parseInt(ilvlEl.value, 10);
        currentCharacter.ilvl = Number.isFinite(v) && v >= 0 ? v : null;
        saveCharacterDebounced();
    });
    if (expSel) expSel.addEventListener("change", () => {
        currentCharacter.currentExpansionId = expSel.value || null;
        saveCharacterDebounced();
        // Pode ter reduzido a expansão atual — desmarca eventos incompatíveis
        // automaticamente e re-renderiza a seção de progs.
        revalidateSubscribedProgs();
    });
}

// Fase 8 — Modo de party do conteúdo
// Hardcoded Savage/Ultimate = "full" (8 titulares). Limited Jobs = "limited".
// Customs definem "full" | "light" | "dynamic" via state.customContents.
function getCustomContent(progId) {
    if (!progId) return null;
    const customs = Array.isArray(state.customContents) ? state.customContents : [];
    return customs.find(c => c.id === progId) || null;
}

// Fase 14 — conteúdos de Limited Job (hardcoded em data.js)
function getLimitedContent(progId) {
    if (!progId) return null;
    const limited = Array.isArray(FFXIV_LIMITED_CONTENTS) ? FFXIV_LIMITED_CONTENTS : [];
    return limited.find(c => c.id === progId) || null;
}

function isLimitedProg(progId) {
    return !!getLimitedContent(progId);
}

function getLimitedJob(progId) {
    const c = getLimitedContent(progId);
    return c ? c.limitedJobId : null;
}

function getPartyMode(progId) {
    if (!progId || progId === "geral") return "full";
    if (isLimitedProg(progId)) return "limited";
    const c = getCustomContent(progId);
    if (!c) return "full"; // hardcoded raids/ultimates
    const m = c.partyMode;
    return (m === "light" || m === "dynamic") ? m : "full";
}

function getPartySize(progId) {
    const mode = getPartyMode(progId);
    if (mode === "light") return 4;
    return 8; // full, dynamic e limited compartilham cap de 8
}

function isDynamicProg(progId) {
    return getPartyMode(progId) === "dynamic";
}

function isCustomProg(progId) {
    return !!getCustomContent(progId);
}

// ==========================================================================
// Seletor Customizado de Classes
// ==========================================================================
function updateCustomJobsCounter() {
    const counter = document.getElementById("custom-jobs-counter");
    const preview = document.getElementById("custom-jobs-selected-preview");
    const n = customSelectedJobs.size;
    if (counter) {
        counter.textContent = `${n} selecionada${n === 1 ? '' : 's'}`;
        counter.classList.toggle("zero", n === 0);
    }
    if (preview) {
        if (n === 0) {
            preview.hidden = true;
            preview.innerHTML = "";
        } else {
            preview.hidden = false;
            preview.innerHTML = Array.from(customSelectedJobs)
                .map(id => `<span class="sel-chip">${id}</span>`)
                .join("");
        }
    }
}

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
        btn.innerHTML = `${imgHtml}<span>${job.id}</span>`;
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
            updateCustomJobsCounter();
        });
        grid.appendChild(btn);
    });
    updateCustomJobsCounter();
}

// ==========================================================================
// Renderizadores da Interface
// ==========================================================================

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

// Fase 3 — Mapeia o tipo do prog para um ícone nativo do FFXIV (assets/icons/dictionary)
function getProgTypeMeta(progId) {
    const isUlt = FFXIV_ULTIMATES.some(u => u.id === progId);
    // Fase 14 — limited tem prioridade: usa o ícone do próprio job travado
    if (isLimitedProg(progId)) {
        const jobId = getLimitedJob(progId);
        const job = FFXIV_JOBS.find(j => j.id === jobId);
        return {
            label: "Limited",
            key: "limited",
            icon: (job && job.iconUrl) || "assets/icons/dictionary/blue_mage_v11.png",
        };
    }
    const customObj = getCustomContent(progId);
    if (customObj) {
        const mode = getPartyMode(progId);
        if (mode === "dynamic") {
            return { label: "Dynamic", key: "dynamic", icon: "assets/icons/dictionary/event_participant.png" };
        }
        if (mode === "light") {
            return { label: "Light", key: "light", icon: "assets/icons/dictionary/variant_criterion_dungeons.png" };
        }
        return { label: "Custom", key: "full", icon: "assets/icons/dictionary/raid.png" };
    }
    if (isUlt) {
        return { label: "Ultimate", key: "ultimate", icon: "assets/icons/dictionary/ultimate_raids.png" };
    }
    return { label: "Savage", key: "savage", icon: "assets/icons/dictionary/instanced_raid.png" };
}

let contentPickerOpen = false;

function renderActiveProgsPanel() {
    const container = document.getElementById("active-progs-list");
    if (!container) return;

    const canManage = canManageContent();
    container.innerHTML = "";

    const progs = state.activeProgs || [];

    if (progs.length === 0 && !canManage) {
        container.innerHTML = `<div class="prog-cards-empty">Nenhum conteúdo em progresso cadastrado.</div>`;
    } else {
        progs.forEach(progId => container.appendChild(buildProgCard(progId, canManage)));
        if (canManage) container.appendChild(buildAddCard());
    }

    // Picker fica oculto para non-managers
    const panel = document.getElementById("content-picker-panel");
    if (panel) {
        if (!canManage) {
            panel.hidden = true;
            contentPickerOpen = false;
        } else if (contentPickerOpen) {
            renderContentPicker();
        }
    }
}

function buildProgCard(progId, canManage) {
    const progObj = getProgObj(progId);
    const meta = getProgTypeMeta(progId);
    const mode = getPartyMode(progId);
    const partySize = getPartySize(progId);
    const dynamic = mode === "dynamic";
    const fullName = progObj.name || progId;
    const shortName = fullName.split(" (")[0];
    const expansion = progId === "geral" ? "Todas" : getExpansionDisplayName(progObj);

    // Status: próximo raid event
    const raidEvt = getRaidEventForProg(progId);
    let statusDot = "status-idle";
    let statusText = "Sem agendamento";
    if (raidEvt) {
        const date = raidEvt.postponedTo || raidEvt.date;
        const [y, m, d] = date.split("-");
        const dObj = new Date(date + "T00:00:00");
        const wkNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
        const dateStr = `${wkNames[dObj.getDay()]}, ${d}/${m}`;
        const avail = getAvailCountForDate(date, raidEvt);
        if (dynamic) {
            statusDot = "status-info";
            statusText = `${dateStr} · ${avail} confirmado${avail === 1 ? '' : 's'}`;
        } else {
            const quorum = raidEvt.quorum || partySize;
            const met = avail >= quorum;
            statusDot = met ? "status-ok" : "status-pending";
            statusText = `${dateStr} · ${avail}/${quorum} confirmados`;
        }
    }

    const card = document.createElement("div");
    card.className = `prog-card prog-card-type-${meta.key}`;
    card.dataset.progId = progId;
    card.innerHTML = `
        <div class="prog-card-icon" aria-hidden="true">
            <img src="${meta.icon}" alt="" onerror="this.style.display='none'">
        </div>
        <div class="prog-card-body">
            <div class="prog-card-row-top">
                <span class="prog-card-pill type-${meta.key}">${meta.label}</span>
                ${canManage ? `<button class="prog-card-remove" type="button" title="Remover conteúdo">&times;</button>` : ''}
            </div>
            <h3 class="prog-card-name" title="${escapeHtml(fullName)}">${escapeHtml(shortName)}</h3>
            <div class="prog-card-meta">
                ${expansion ? `<span>${escapeHtml(expansion)}</span>` : ''}
                <span>${partySize} jogadores</span>
            </div>
            <div class="prog-card-status">
                <span class="status-dot ${statusDot}"></span>
                <span class="prog-card-status-text">${escapeHtml(statusText)}</span>
            </div>
        </div>
    `;

    if (canManage) {
        card.querySelector(".prog-card-remove").addEventListener("click", async (e) => {
            e.stopPropagation();
            playSfx('click');

            // Detecta agendamentos futuros desse prog — se houver, confirma com aviso
            // de que serão cancelados (e o grupo notificado no Telegram via Fase M).
            const todayStr = new Date().toISOString().slice(0, 10);
            const futureEvents = (state.raidEvents || []).filter(ev =>
                ev.progId === progId && (ev.postponedTo || ev.date) >= todayStr
            );
            if (futureEvents.length > 0) {
                const dates = futureEvents
                    .map(ev => {
                        const d = ev.postponedTo || ev.date;
                        const [y, m, day] = d.split("-");
                        return `${day}/${m}`;
                    })
                    .join(", ");
                const ok = await showConfirm({
                    title: "Desativar conteúdo",
                    message: `Desativar "${fullName}"?`,
                    detail: `Há ${futureEvents.length} agendamento${futureEvents.length === 1 ? '' : 's'} futuro${futureEvents.length === 1 ? '' : 's'} (${dates}). ${futureEvents.length === 1 ? 'Ele será cancelado' : 'Eles serão cancelados'} e o grupo será notificado no Telegram.`,
                    danger: true,
                    confirmText: "Desativar",
                });
                if (!ok) return;
            }

            state.activeProgs = state.activeProgs.filter(id => id !== progId);
            // Limpa raidEvents e pendingNotifications órfãos — sem isso, o
            // scheduler do servidor continua disparando lembretes 24h/today
            // (server/app.py:_maybe_send_reminders itera por state.raidEvents).
            state.raidEvents = (state.raidEvents || []).filter(ev => ev.progId !== progId);
            state.pendingNotifications = (state.pendingNotifications || []).filter(n => n.progId !== progId);
            if (state.inspectedProgId === progId) {
                state.inspectedProgId = state.activeProgs[0] || "geral";
            }
            saveState();
            renderActiveProgsPanel();
            renderProgTabsBar();
            renderRosterTables();
        });
    }
    return card;
}

function buildAddCard() {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `prog-card prog-card-add ${contentPickerOpen ? 'is-open' : ''}`;
    card.innerHTML = `
        <span class="prog-card-add-icon">+</span>
        <span class="prog-card-add-label">Adicionar conteúdo</span>
    `;
    card.addEventListener("click", () => {
        playSfx('click');
        toggleContentPicker();
    });
    return card;
}

function toggleContentPicker() {
    contentPickerOpen = !contentPickerOpen;
    const panel = document.getElementById("content-picker-panel");
    if (panel) panel.hidden = !contentPickerOpen;
    renderActiveProgsPanel();
}

function closeContentPicker() {
    contentPickerOpen = false;
    const panel = document.getElementById("content-picker-panel");
    if (panel) panel.hidden = true;
    renderActiveProgsPanel();
}

function renderContentPicker() {
    const panel = document.getElementById("content-picker-panel");
    if (!panel || panel.hidden) return;

    const tabsCont = document.getElementById("content-picker-tabs");
    const gridCont = document.getElementById("content-picker-grid");
    if (!tabsCont || !gridCont) return;

    tabsCont.innerHTML = "";
    CONTENT_TYPES.forEach(ct => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `content-picker-tab ${ct.id === activeContentTypeId ? 'active' : ''}`;
        btn.textContent = ct.label;
        btn.addEventListener("click", () => {
            playSfx('tab');
            activeContentTypeId = ct.id;
            renderContentPicker();
        });
        tabsCont.appendChild(btn);
    });

    gridCont.innerHTML = "";
    const currentType = CONTENT_TYPES.find(ct => ct.id === activeContentTypeId);
    if (!currentType) return;

    const items = currentType.getList();
    if (items.length === 0) {
        gridCont.innerHTML = `<div class="content-picker-empty">${
            activeContentTypeId === "custom"
                ? 'Nenhum conteúdo customizado cadastrado. Use o botão "Conteúdos" no topo da página para criar.'
                : 'Nenhum item disponível.'
        }</div>`;
        return;
    }

    items.forEach(item => {
        const isActive = (state.activeProgs || []).includes(item.id);
        let iconPath;
        if (activeContentTypeId === "raid")          iconPath = "assets/icons/dictionary/instanced_raid.png";
        else if (activeContentTypeId === "ultimate") iconPath = "assets/icons/dictionary/ultimate_raids.png";
        else if (activeContentTypeId === "limited") {
            // Fase 14 — ícone do próprio job limitado (BLU)
            const job = FFXIV_JOBS.find(j => j.id === item.limitedJobId);
            iconPath = (job && job.iconUrl) || "assets/icons/dictionary/blue_mage_v11.png";
        }
        else {
            const m = (item.partyMode === "light" || item.partyMode === "dynamic") ? item.partyMode : "full";
            iconPath = m === "dynamic" ? "assets/icons/dictionary/event_participant.png"
                     : m === "light"   ? "assets/icons/dictionary/variant_criterion_dungeons.png"
                                       : "assets/icons/dictionary/raid.png";
        }
        const card = document.createElement("button");
        card.type = "button";
        card.className = `content-picker-card${isActive ? ' is-active' : ''}`;
        card.disabled = isActive;
        card.title = isActive ? "Já adicionado" : `Adicionar ${item.name}`;
        const shortName = (item.name || item.id).split(" (")[0];
        card.innerHTML = `
            <img class="content-picker-card-icon" src="${iconPath}" alt="" onerror="this.style.display='none'">
            <span class="content-picker-card-name">${escapeHtml(shortName)}</span>
            ${(() => { const ex = getExpansionDisplayName(item); return ex ? `<span class="content-picker-card-meta">${escapeHtml(ex)}</span>` : ''; })()}
            ${isActive ? `<span class="content-picker-card-tag">Em uso</span>` : ''}
        `;
        if (!isActive) {
            card.addEventListener("click", () => {
                playSfx('success');
                if (!state.activeProgs) state.activeProgs = [];
                state.activeProgs.push(item.id);
                // Sincroniza statusByProg do roster para o novo prog (mesma lógica do antigo btn-add-prog)
                state.roster.forEach(player => {
                    if (!player.statusByProg) player.statusByProg = {};
                    if (!player.statusByProg[item.id]) {
                        player.statusByProg[item.id] = player.status === "bench" ? "bench" : "active";
                    }
                });
                if (!state.inspectedProgId || state.inspectedProgId === "geral") {
                    state.inspectedProgId = item.id;
                }
                saveState();
                renderActiveProgsPanel();
                renderProgTabsBar();
                renderRosterTables();
                renderQuickSchedule();
                if (isOfficer()) {
                    const pickerEl = document.getElementById("content-picker-panel");
                    if (pickerEl) pickerEl.hidden = true;
                    openScheduleModal(null, item.id);
                }
            });
        }
        gridCont.appendChild(card);
    });
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

// Fase 14 — gera o HTML dos badges do pool de jobs.
// Em conteúdo limited, mostra um único badge travado com o job da raid (sem botoes).
// Fase O.2 — para slots vinculados (player.user_id), usa jobsPool derivado do
// character_json via getSlotIdentity; senão usa player.jobsPool legado.
function buildPoolBadgesHtml(player, activeProgId, canEdit) {
    if (isLimitedProg(activeProgId)) {
        const jobId = getLimitedJob(activeProgId);
        const jObj = FFXIV_JOBS.find(j => j.id === jobId);
        const roleData = jObj ? FFXIV_ROLES[jObj.role] : null;
        const color = (roleData && roleData.color) || "#06b6d4";
        const imgH = jObj && jObj.iconUrl ? `<img class="job-img-icon" src="${jObj.iconUrl}" alt="${jobId}">` : (jObj ? jObj.icon : "");
        return `<span class="job-badge job-badge-locked" style="background-color: ${color};" title="Job travado para este conteúdo">${imgH || jobId}<span class="job-badge-lock">🔒</span></span>`;
    }
    const currentAssignedJob = getAssignedJobForProg(player, activeProgId);
    const identity = getSlotIdentity(player);
    return (identity.jobsPool || []).map(jId => {
        const jObj = FFXIV_JOBS.find(j => j.id === jId);
        const roleData = jObj ? FFXIV_ROLES[jObj.role] : null;
        const color = roleData ? roleData.color : '#475569';
        const imgH = jObj && jObj.iconUrl ? `<img class="job-img-icon" src="${jObj.iconUrl}" alt="${jId}">` : (jObj ? jObj.icon : '');
        const isAssigned = jId === currentAssignedJob;
        const disabledStyle = canEdit ? '' : 'pointer-events:none; opacity:0.7;';
        return `<button type="button" class="job-badge direct-pool-job-btn" style="background-color: ${color}; ${isAssigned ? 'opacity:0.4; transform:none; cursor:default;' : ''} ${disabledStyle}" data-id="${player.id}" data-job="${jId}" title="Clique para definir ${jId} como principal neste conteúdo">${imgH || jId}</button>`;
    }).join(' ');
}

// Fase O.2 — botão "Claim" para slots livres (sem user_id). Visível só para
// o user logado que ainda não tem um slot vinculado nesta static.
function buildClaimButton(player) {
    if (!player || player.user_id != null) return "";
    if (!currentUserId) return "";
    if (hasOwnSlot()) return "";
    return `<button class="btn-table-action btn-claim-slot" data-id="${player.id}" title="Reivindicar este slot e vincular ao seu personagem">📥 Claim</button>`;
}

// Constrói o HTML dos botões de ação para uma linha do roster baseado em
// permissões. O botão "Editar" foi removido pois a identidade do jogador vem
// agora da aba Personagem. Excluir aqui significa "remover deste evento/prog",
// não deletar o slot do roster.
function buildRowActions(player, ctx) {
    const benchBtn = `<button class="btn-table-action btn-move-bench" data-id="${player.id}" title="Mover para o Banco de Reservas deste evento"><img src="assets/icons/dictionary/party_member.png" alt="Banco" style="width:28px;height:28px;display:block;"></button>`;
    const activeBtn = `<button class="btn-table-action btn-move-active" data-id="${player.id}" title="Alocar como Titular neste evento"><img src="assets/icons/dictionary/party_leader.png" alt="Alocar" style="width:28px;height:28px;display:block;"></button>`;
    const delBtn = `<button class="btn-table-action btn-remove-from-prog" data-id="${player.id}" title="Remover jogador deste evento"><img src="assets/icons/dictionary/exit_game.png" alt="Remover" style="width:28px;height:28px;display:block;"></button>`;

    if (isOfficer()) {
        return ctx === "active" ? `${benchBtn}${delBtn}` : `${activeBtn}${delBtn}`;
    }
    if (isOwnSlot(player)) {
        // Member no próprio slot: pode se remover do prog (não tem move bench/active)
        return delBtn;
    }
    return "";
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

    // Slots explicitamente removidos do prog (statusByProg[progId] === "removed")
    // não aparecem nem como titular nem como reserva. Slot continua intacto
    // para outros progs.
    const slotsInProg = state.roster.filter(p => getPlayerStatusForProg(p, activeProgId) !== "removed");

    // Separação por Conteúdo: Avalia o statusByProg da Raid ativa
    const allActiveMembers = slotsInProg
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

    const partySize = getPartySize(activeProgId);
    const dynamic = isDynamicProg(activeProgId);

    // Cap defensivo: se a data tem mais actives que partySize (ex: dados
    // legados, seeds, migrações), só os primeiros partySize entram em
    // "Titulares". O restante é exibido como "Excedente" no banco — não
    // mutamos o dado (officer decide o que fazer manualmente).
    const overflowMembers = (!dynamic && allActiveMembers.length > partySize)
        ? allActiveMembers.slice(partySize)
        : [];
    const activeMembers = (!dynamic && allActiveMembers.length > partySize)
        ? allActiveMembers.slice(0, partySize)
        : allActiveMembers;

    const benchMembers = slotsInProg
        .filter(p => getPlayerStatusForProg(p, activeProgId) !== "active")
        .concat(overflowMembers);

    if (activeCountText) {
        activeCountText.textContent = `${activeMembers.length} / ${partySize}`;
        activeCountText.style.color = activeMembers.length >= partySize ? "var(--color-avail)" : "var(--gold-bright)";
        if (overflowMembers.length > 0) {
            activeCountText.title = `Atenção: ${overflowMembers.length} slot(s) marcado(s) como ativo(s) acima do limite de ${partySize}. Foram exibidos como reservas — reorganize o roster.`;
        } else {
            activeCountText.title = "";
        }
    }

    if (activeMembers.length === 0) {
        activeTbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum jogador na Party Principal desta Raid. Utilize os botões de promoção do banco abaixo para alocar titulares.</td></tr>`;
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

            // Fase O.2 — identidade do slot vem do character se vinculado;
            // inputs ficam disabled quando o slot tem user_id (dados editáveis
            // só na aba Personagem do dono).
            const identity = getSlotIdentity(player);
            const locked = !!player.user_id;
            const canEdit = !locked && canEditPlayer(player);
            const canPickJob = canEditPlayer(player);
            const ownTag = isOwnSlot(player) ? '<span style="font-size:0.7rem;color:var(--gold-bright);margin-left:4px;font-style:italic;">(você)</span>' : '';
            const lockedHint = locked ? '<span class="slot-locked-hint" title="Edite seus dados na aba Personagem">🔗</span>' : '';
            const poolBadgesHtml = buildPoolBadgesHtml(player, activeProgId, canPickJob);

            tr.innerHTML = `
                <td data-label="rank" style="font-weight: bold; color: var(--gold-muted);">#${idx + 1}</td>
                <td data-label="Jogador">
                    <input type="text" class="ff-input inp-roster-name" value="${escapeHtml(identity.name)}" data-id="${player.id}" placeholder="Nome / Nick" ${canEdit ? '' : 'disabled'}>${ownTag}${lockedHint}
                </td>
                <td data-label="Classes">
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
                        ${poolBadgesHtml}
                    </div>
                </td>
                <td data-label="Principal">
                    ${assignedJobHtml}
                </td>
                <td data-label="iLvl">
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <input type="number" class="ff-input inp-roster-ilvl" value="${identity.ilvl}" min="1" max="999" data-id="${player.id}" style="width: 65px; padding: 6px;" ${canEdit ? '' : 'disabled'}>
                        <label title="BiS (Best in Slot)"><input type="checkbox" class="ff-checkbox chk-roster-bis" data-id="${player.id}" ${player.bis ? 'checked' : ''} ${canEdit ? '' : 'disabled'}></label>
                    </div>
                </td>
                <td data-label="Ações">
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        ${buildClaimButton(player)}
                        ${buildRowActions(player, "active")}
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
            const identity = getSlotIdentity(player);
            const locked = !!player.user_id;
            const canEdit = !locked && canEditPlayer(player);
            const canPickJob = canEditPlayer(player);
            const ownTag = isOwnSlot(player) ? '<span style="font-size:0.7rem;color:var(--gold-bright);margin-left:4px;font-style:italic;">(você)</span>' : '';
            const lockedHint = locked ? '<span class="slot-locked-hint" title="Edite seus dados na aba Personagem">🔗</span>' : '';
            const poolBadgesHtml = buildPoolBadgesHtml(player, activeProgId, canPickJob);

            tr.innerHTML = `
                <td data-label="Jogador">
                    <input type="text" class="ff-input inp-roster-name" value="${escapeHtml(identity.name)}" data-id="${player.id}" placeholder="Nome / Nick" ${canEdit ? '' : 'disabled'}>${ownTag}${lockedHint}
                </td>
                <td data-label="Classes">
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
                        ${poolBadgesHtml}
                    </div>
                </td>
                <td data-label="iLvl">
                    <input type="number" class="ff-input inp-roster-ilvl" value="${identity.ilvl}" min="1" max="999" data-id="${player.id}" style="width: 70px; padding: 6px;" ${canEdit ? '' : 'disabled'}>
                </td>
                <td data-label="Ações">
                    <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                        ${buildClaimButton(player)}
                        ${buildRowActions(player, "bench")}
                    </div>
                </td>
            `;
            benchTbody.appendChild(tr);
        });
    }

    // Fase O.2 — cadastro manual de slots foi removido. Identidade do
    // jogador vive no character_json (aba Personagem). Slots da Party vêm
    // de claim de slots legados ou (futuramente) de subscribedProgs.
    const addPanel = document.querySelector(".add-member-panel");
    if (addPanel) addPanel.style.display = "none";

    bindRosterTableEvents();
    renderDashboardVisualizer();
    renderScheduleTable();
    renderNotificationBanner();
    updateDashboardStats();
    renderEquipmentPanel();
}

function bindRosterTableEvents() {
    const container = document.getElementById("party-tab");
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
            // Fase O.2 — slots vinculados a um user têm identidade vinda do
            // character_json; ignora edits diretos no slot.
            if (target && !target.user_id) {
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
            if (target && !target.user_id) {
                target.ilvl = parseInt(e.target.value) || 0;
                saveState();
                renderDashboardVisualizer();
            }
        });
    });

    // Fase O.2 — handler dos botões "Claim" em slots livres
    container.querySelectorAll(".btn-claim-slot").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            playSfx('click');
            const slotId = btn.dataset.id;
            await claimRosterSlot(slotId);
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
            const partySize = getPartySize(activeProgId);
            // Modo dynamic: sem cap rígido e sem aviso de party cheia.
            if (!isDynamicProg(activeProgId) && activeCount >= partySize) {
                const label = getPartyMode(activeProgId) === "light" ? "Light Party" : "Party Principal";
                showToast(`${label} desta Raid já atingiu o limite máximo de ${partySize} jogadores. Mova alguém para o banco primeiro.`, { type: "warning", title: "Party Cheia" });
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

    // Remove jogador apenas DO PROG/EVENTO inspecionado (não deleta o slot do
    // roster). statusByProg[currentProgId] é apagado — o jogador some das
    // listas daquele prog, mas continua nos outros progs que participa.
    container.querySelectorAll(".btn-remove-from-prog").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const id = e.currentTarget.dataset.id;
            const target = state.roster.find(p => p.id === id);
            if (!target) return;
            const progId = state.inspectedProgId || "geral";
            const identity = getSlotIdentity(target);
            const progLabel = (getProgObj(progId).name || progId).split(" (")[0];
            const ok = await showConfirm({
                title: "Remover deste evento",
                message: `Remover "${identity.name || 'Sem Nome'}" de "${progLabel}"?`,
                detail: "O jogador some da composição deste evento mas continua nos outros progs em que participa.",
                confirmText: "Remover",
                danger: true,
            });
            if (!ok) return;
            // Marca explicitamente como "removed" em vez de deletar — assim
            // o fallback de getPlayerStatusForProg não vai trazer o jogador
            // de volta via player.status global. Slot continua intacto pra
            // outros progs.
            if (!target.statusByProg) target.statusByProg = {};
            target.statusByProg[progId] = "removed";
            // assignedJobsByProg também é limpo pra esse prog
            if (target.assignedJobsByProg) {
                delete target.assignedJobsByProg[progId];
            }
            saveState();
            renderRosterTables();
            renderScheduleTable();
        });
    });
}

// ==========================================================================
// Modal de Edição de Jogador (nome + pool de classes)
// ==========================================================================
let editingPlayerId = null;
let editingSelectedJobs = new Set();

function openEditPlayerModal(playerId) {
    const player = state.roster.find(p => p.id === playerId);
    if (!player) return;
    editingPlayerId = playerId;
    editingSelectedJobs = new Set(player.jobsPool || []);

    const modal = document.getElementById("modal-edit-player");
    const nameInp = document.getElementById("edit-player-name");
    const errEl = document.getElementById("edit-player-error");
    if (nameInp) nameInp.value = player.name || "";
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }

    renderEditJobsGrid();
    if (modal) modal.hidden = false;
    playSfx('tab');
}

function closeEditPlayerModal() {
    const modal = document.getElementById("modal-edit-player");
    if (modal) modal.hidden = true;
    editingPlayerId = null;
    editingSelectedJobs.clear();
}

function updateEditJobsCounter() {
    const counter = document.getElementById("edit-jobs-counter");
    if (!counter) return;
    const n = editingSelectedJobs.size;
    counter.textContent = `${n} selecionada${n === 1 ? '' : 's'}`;
    counter.classList.toggle("zero", n === 0);
}

function renderEditJobsGrid() {
    const grid = document.getElementById("edit-jobs-grid");
    if (!grid) return;
    grid.innerHTML = "";

    FFXIV_JOBS.forEach(job => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "custom-job-btn";
        btn.dataset.job = job.id;
        if (editingSelectedJobs.has(job.id)) btn.classList.add("selected");

        const roleData = FFXIV_ROLES[job.role];
        btn.style.borderBottom = `2px solid ${roleData ? roleData.color : '#fff'}`;
        const imgHtml = job.iconUrl ? `<img class="job-img-icon" src="${job.iconUrl}" alt="${job.id}" onerror="this.style.display='none'">` : job.icon;
        btn.innerHTML = `${imgHtml}<span>${job.id}</span>`;
        btn.title = job.name;

        btn.addEventListener("click", () => {
            playSfx('click');
            if (editingSelectedJobs.has(job.id)) {
                editingSelectedJobs.delete(job.id);
                btn.classList.remove("selected");
            } else {
                editingSelectedJobs.add(job.id);
                btn.classList.add("selected");
            }
            updateEditJobsCounter();
        });
        grid.appendChild(btn);
    });
    updateEditJobsCounter();
}

function saveEditedPlayer() {
    if (!editingPlayerId) return;
    const player = state.roster.find(p => p.id === editingPlayerId);
    if (!player) return;

    const errEl = document.getElementById("edit-player-error");
    const nameInp = document.getElementById("edit-player-name");
    const newName = (nameInp ? nameInp.value : "").trim();

    if (!newName) {
        if (errEl) { errEl.textContent = "Informe o nome do jogador."; errEl.hidden = false; }
        return;
    }
    if (editingSelectedJobs.size === 0) {
        if (errEl) { errEl.textContent = "Selecione ao menos uma classe no pool."; errEl.hidden = false; }
        return;
    }

    const newPool = sortJobsCanonical(editingSelectedJobs);
    player.name = newName;
    player.jobsPool = newPool;

    // Reajusta a classe atribuída por prog se ela não estiver mais no pool
    if (!newPool.includes(player.assignedJob)) {
        player.assignedJob = newPool[0];
    }
    if (player.assignedJobsByProg) {
        Object.keys(player.assignedJobsByProg).forEach(pId => {
            if (!newPool.includes(player.assignedJobsByProg[pId])) {
                player.assignedJobsByProg[pId] = newPool[0];
            }
        });
    }

    // O player virou específico (custom) ao editar pool manualmente
    player.flexType = "custom";

    playSfx('success');
    saveState();
    closeEditPlayerModal();
    renderRosterTables();
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

    const partySize = getPartySize(activeProgId);
    for (let i = 0; i < partySize; i++) {
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
                    <div class="member-ilvl">iLvl: ${player.ilvl} ${player.bis ? 'BiS' : ''}</div>
                </div>
            `;
            container.appendChild(card);
        } else {
            const emptyCard = document.createElement("div");
            emptyCard.className = "member-mini-card empty-slot";
            emptyCard.innerHTML = `<div class="empty-slot-txt">Vaga Livre ${i + 1}</div>`;
            emptyCard.style.cursor = "pointer";
            emptyCard.addEventListener("click", () => {
                const rosterTabBtn = document.querySelector(".tab-btn[data-tab='party']");
                if (rosterTabBtn) rosterTabBtn.click();
            });
            container.appendChild(emptyCard);
        }
    }
}

// ==========================================================================
// Raid Events — Helpers (Fase 11)
// ==========================================================================

function getRaidEventForDate(dateKey) {
    return (state.raidEvents || []).find(e => (e.postponedTo || e.date) === dateKey);
}

function getRaidEventForProg(progId) {
    const today = new Date().toISOString().slice(0, 10);
    return (state.raidEvents || []).find(e =>
        e.progId === progId && (e.postponedTo || e.date) >= today
    );
}

// Resolve o character_json vinculado a um slot do roster (via player.user_id).
// Retorna null se o slot é legado (sem user_id) ou se o map ainda não trouxe
// aquele character. Usado pela Fase P para validar compatibilidade.
//
// Para o user logado, prefere `currentCharacter` (estado local) — assim
// edições na aba Personagem refletem imediatamente em calendário/Próximos
// dias sem ter que esperar o próximo poll de `/api/state` (~5s).
function getCharacterForPlayer(player) {
    if (!player) return null;
    const uid = player.user_id;
    if (uid == null) return null;
    if (uid === currentUserId && currentCharacter) return currentCharacter;
    return (currentCharacters && currentCharacters[uid]) || null;
}

// Fase Q — lê a entrada do monthlySchedule de forma unificada.
// Retorna {status: string, ranges: [{start, end}]}; suporta legado string e
// o novo formato objeto. Status vazio ("") indica dia sem marcação.
function getSchedEntry(player, dateKey) {
    const raw = player.monthlySchedule?.[dateKey];
    if (!raw) return { status: "", ranges: [] };
    if (typeof raw === "string") return { status: raw, ranges: [] };
    return { status: raw.status || "", ranges: Array.isArray(raw.ranges) ? raw.ranges : [] };
}

// Fase P — valida se um slot do roster é compatível com um evento (Limited
// considera level mínimo do job; não-Limited compara order da expansão).
// `target` é um raidEvent (preferencial) OU um content/prog. Slots sem
// character vinculado caem no fallback permissivo (contam como compatíveis).
function isPlayerCompatibleWithTarget(player, target) {
    if (!target) return { compatible: true };
    const character = getCharacterForPlayer(player);
    if (!character) return { compatible: true };
    const elig = isContentMarkableForCharacter(target, character);
    return { compatible: !!elig.markable, reason: elig.reason };
}

// Fase P + Q — getAvailCountForDate pode receber um event/target opcional.
// Quando fornecido, só conta jogadores cujo character é compatível com aquele
// evento. Fase Q: quando o target é um raidEvent COM time, conta apenas
// jogadores com confirmação derivada "confirmed" (range cobre toda a janela).
// Sem time (ou sem target), usa apenas o status do dia.
function getAvailCountForDate(dateKey, target = null) {
    return (state.roster || []).filter(p => {
        if (target && target.time && target.progId) {
            // Modo Fase Q derivado: usa janela do evento
            return getConfirmationStatusForEvent(p, target) === "confirmed";
        }
        if (getSchedEntry(p, dateKey).status !== "avail") return false;
        if (!target) return true;
        return isPlayerCompatibleWithTarget(p, target).compatible;
    }).length;
}

// ==========================================================================
// Fase Q — Helpers de ranges, overlap windows e confirmação derivada
// ==========================================================================

// Retorna o conjunto de índices de slots cobertos por um player num dado dia.
// "avail" sem ranges = dia inteiro (28 slots); "maybe" idem.
// "unavail" ou sem entrada = vazio.
function expandRangesForDate(player, dateKey) {
    const entry = getSchedEntry(player, dateKey);
    if (entry.status === "" || entry.status === "unavail") {
        return { status: entry.status || "unavail", slots: new Set() };
    }
    if (entry.ranges.length === 0) {
        const all = new Set();
        for (let i = 0; i < SCHED_SLOTS.length; i++) all.add(i);
        return { status: entry.status, slots: all };
    }
    return { status: entry.status, slots: rangesToSlotIdxs(entry.ranges) };
}

// Converte horário "HH:MM" em índice de slot (ou -1 se inválido).
function timeToSlotIdx(timeStr) {
    return SCHED_SLOTS.indexOf(timeStr);
}

// Converte (timeStr, durationMin) em conjunto de índices de slots cobertos.
function eventSlotIdxs(timeStr, durationMin) {
    const startIdx = timeToSlotIdx(timeStr);
    if (startIdx < 0 || !durationMin) return new Set();
    const slotsNeeded = Math.ceil(durationMin / 30);
    const idxs = new Set();
    for (let i = 0; i < slotsNeeded; i++) {
        const idx = startIdx + i;
        if (idx >= SCHED_SLOTS.length) break;
        idxs.add(idx);
    }
    return idxs;
}

// Fase Q — calcula janelas viáveis de overlap para um dia.
// Retorna lista de { start, end, durationMin, countAvail, countMaybe,
// guaranteed: boolean }, ordenada por: garantidas primeiro, depois por largura
// decrescente, depois por início mais cedo.
//
// `target` é o raidEvent ou prog para checagem de compatibilidade Fase P
// (se omitido, não filtra). `durationMin` é a duração mínima exigida.
// `requiredCount` é quantos jogadores precisam estar disponíveis (default 8).
function computeViableWindows(dateKey, durationMin, target = null, requiredCount = 8) {
    const slotsNeeded = Math.max(1, Math.ceil(durationMin / 30));
    const roster = state.roster || [];

    // Para cada slot, conta avail e maybe (filtrando por compatibilidade)
    const avail = new Array(SCHED_SLOTS.length).fill(0);
    const maybe = new Array(SCHED_SLOTS.length).fill(0);

    roster.forEach(p => {
        if (target) {
            const compat = isPlayerCompatibleWithTarget(p, target);
            if (!compat.compatible) return;
        }
        const exp = expandRangesForDate(p, dateKey);
        if (exp.status === "avail") {
            exp.slots.forEach(idx => { avail[idx] += 1; });
        } else if (exp.status === "maybe") {
            exp.slots.forEach(idx => { maybe[idx] += 1; });
        }
    });

    // Detecta janelas contínuas onde count >= requiredCount e largura >= slotsNeeded
    const windows = [];
    const tryDetect = (isGuaranteed) => {
        let start = 0;
        while (start <= SCHED_SLOTS.length - slotsNeeded) {
            let end = start;
            while (end < SCHED_SLOTS.length) {
                const total = isGuaranteed ? avail[end] : (avail[end] + maybe[end]);
                if (total < requiredCount) break;
                end++;
            }
            const width = end - start;
            if (width >= slotsNeeded) {
                let minAvail = Infinity, minMaybe = Infinity;
                for (let i = start; i < end; i++) {
                    if (avail[i] < minAvail) minAvail = avail[i];
                    if (maybe[i] < minMaybe) minMaybe = maybe[i];
                }
                windows.push({
                    start: SCHED_SLOTS[start],
                    end: slotEnd(end - 1),
                    startIdx: start,
                    endIdx: end,
                    widthSlots: width,
                    durationMin: width * 30,
                    countAvail: isFinite(minAvail) ? minAvail : 0,
                    countMaybe: isFinite(minMaybe) ? minMaybe : 0,
                    guaranteed: isGuaranteed,
                });
                start = end;
            } else {
                start = end + 1;
            }
        }
    };
    tryDetect(true);
    tryDetect(false);

    // Remove duplicatas exatas (mesma janela aparece como garantida E potencial)
    const seenRange = new Set();
    return windows
        .sort((a, b) => {
            if (a.guaranteed !== b.guaranteed) return a.guaranteed ? -1 : 1;
            if (a.widthSlots !== b.widthSlots) return b.widthSlots - a.widthSlots;
            return a.startIdx - b.startIdx;
        })
        .filter(w => {
            const key = `${w.startIdx}-${w.endIdx}`;
            if (seenRange.has(key)) return false;
            seenRange.add(key);
            return true;
        });
}

// Fase Q — duração default sugerida no agendamento, por categoria de conteúdo.
// Ultimate: 180 min; Savage/Custom/Limited: 120 min. Editável pelo officer.
function getDefaultDurationForProg(progId) {
    if (!progId) return 120;
    if (Array.isArray(FFXIV_ULTIMATES) && FFXIV_ULTIMATES.find(u => u.id === progId)) return 180;
    return 120;
}

// Fase Q — formata janela como "HH:MM–HH:MM (Xh)" para tooltips/UI.
function formatWindowLabel(w) {
    const hrs = Math.floor(w.durationMin / 60);
    const min = w.durationMin % 60;
    const dur = min === 0 ? `${hrs}h` : `${hrs}h${min}`;
    return `${w.start}–${w.end} (${dur})`;
}

// Fase Q — confirmação derivada do range do player vs janela do evento.
// Retorna "confirmed" | "partial" | "maybe" | "unavail" | "incompatible" | "pending".
//  - "pending": evento sem time
//  - "incompatible": Fase P (expansão ou Limited level insuficiente)
//  - "confirmed": status "avail" e ranges cobrem TODA a janela do evento
//  - "partial": status "avail" mas só cobre parte da janela
//  - "maybe": status "maybe" e há overlap com a janela
//  - "unavail": status "unavail" ou avail/maybe sem overlap nenhum
function getConfirmationStatusForEvent(player, event) {
    if (!event) return "pending";
    if (event.time === null || event.time === undefined) return "pending";
    const compat = isPlayerCompatibleWithTarget(player, event);
    if (!compat.compatible) return "incompatible";
    const dateKey = event.postponedTo || event.date;
    const entry   = getSchedEntry(player, dateKey);
    if (entry.status === "" || entry.status === "unavail") return "unavail";
    const playerSlots = expandRangesForDate(player, dateKey).slots;
    const eventSlots  = eventSlotIdxs(event.time, event.durationMin || 120);
    if (eventSlots.size === 0) return "pending";
    let overlap = 0;
    eventSlots.forEach(idx => { if (playerSlots.has(idx)) overlap++; });
    if (overlap === 0) return "unavail";
    if (entry.status === "avail") {
        return overlap === eventSlots.size ? "confirmed" : "partial";
    }
    return "maybe";
}

// ==========================================================================
// Fase Q — Popover de disponibilidade diária
// ==========================================================================

let _popoverPlayerRef = null; // ref para fechar/reabrir no mesmo player

// Converte conjunto de índices de slots selecionados em ranges [{start, end}].
// Slots contíguos são fundidos num único range. end = início do próximo slot
// (ou +30 min do último). Trata cross-midnight corretamente (00:xx > 23:xx).
function slotsToRanges(selectedIdxs) {
    if (!selectedIdxs || selectedIdxs.length === 0) return [];
    const sorted = [...new Set(selectedIdxs)].sort((a, b) => a - b);
    const ranges = [];
    let start = sorted[0];
    let prev  = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] !== prev + 1) {
            ranges.push({ start: SCHED_SLOTS[start], end: slotEnd(prev) });
            start = sorted[i];
        }
        prev = sorted[i];
    }
    ranges.push({ start: SCHED_SLOTS[start], end: slotEnd(prev) });
    return ranges;
}

// Retorna o horário de fim de um slot (início + 30 min), cruzando meia-noite.
function slotEnd(idx) {
    const next = idx + 1;
    if (next < SCHED_SLOTS.length) return SCHED_SLOTS[next];
    return "02:00"; // fim do último slot
}

// Converte ranges [{start, end}] de volta para conjunto de índices de slots.
function rangesToSlotIdxs(ranges) {
    if (!ranges || ranges.length === 0) return new Set();
    const result = new Set();
    ranges.forEach(({ start, end }) => {
        const si = SCHED_SLOTS.indexOf(start);
        const ei = SCHED_SLOTS.indexOf(end);
        if (si < 0) return;
        const limit = ei < 0 ? SCHED_SLOTS.length : ei;
        for (let i = si; i < limit; i++) result.add(i);
    });
    return result;
}

// Bugfix: armazena o cleanup do popover ativo num escopo módulo. Sem isso,
// fechamentos via toggle/Confirmar/Cancelar deixavam listeners zumbis de
// onClickOutside em `document`, que disparavam em cliques futuros e fechavam
// o NOVO popover (porque .contains() era checado em refs detached).
let _popoverCleanup = null;

function closeSchedulePopover() {
    const existing = document.getElementById("sched-popover");
    if (existing) existing.remove();
    if (_popoverCleanup) {
        _popoverCleanup();
        _popoverCleanup = null;
    }
    _popoverPlayerRef = null;
}

function openSchedulePopover(player, dateKey, anchorEl) {
    // Fecha outro popover aberto (sempre via closeSchedulePopover para limpar listeners)
    const existing = document.getElementById("sched-popover");
    if (existing) {
        const sameCell = _popoverPlayerRef === player && existing.dataset.dateKey === dateKey;
        closeSchedulePopover();
        if (sameCell) return;
    }

    const entry     = getSchedEntry(player, dateKey);
    let curStatus   = entry.status || "avail";
    let selectedIdx = rangesToSlotIdxs(entry.ranges);
    // "avail" sem ranges = dia inteiro (todos selecionados)
    if ((curStatus === "avail" || curStatus === "maybe") && entry.ranges.length === 0) {
        SCHED_SLOTS.forEach((_, i) => selectedIdx.add(i));
    }

    const popover = document.createElement("div");
    popover.id = "sched-popover";
    popover.dataset.dateKey = dateKey;
    popover.className = "sched-popover";
    _popoverPlayerRef = player;

    // Posição: abaixo/acima da célula, com scroll
    const rect = anchorEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    popover.style.position = "fixed";
    popover.style.left = Math.min(rect.left, window.innerWidth - 460) + "px";
    if (spaceBelow >= 280) {
        popover.style.top = (rect.bottom + 4) + "px";
    } else {
        popover.style.bottom = (window.innerHeight - rect.top + 4) + "px";
    }

    function renderPopover() {
        const showGrid = curStatus === "avail" || curStatus === "maybe";
        const slotColor = curStatus === "maybe" ? "var(--color-late)" : "var(--color-avail)";

        let slotsHtml = "";
        if (showGrid) {
            slotsHtml = `
            <div class="sched-popover-grid-wrap">
                <div class="sched-popover-hours-row">
                    ${SCHED_SLOTS.filter((_, i) => i % 2 === 0).map(s => `<span>${s.split(":")[0]}</span>`).join("")}
                </div>
                <div class="sched-popover-grid" id="sp-grid">
                    ${SCHED_SLOTS.map((s, i) => `
                        <div class="sched-slot${selectedIdx.has(i) ? " selected" : ""}"
                             data-idx="${i}" title="${s}–${slotEnd(i)}"
                             style="${selectedIdx.has(i) ? `background:${slotColor};border-color:${slotColor};` : ""}">
                        </div>
                    `).join("")}
                </div>
                <div class="sched-popover-grid-actions">
                    <button class="sched-btn-all-day" id="sp-all-day">Dia inteiro</button>
                    <button class="sched-btn-clear" id="sp-clear">Limpar</button>
                </div>
            </div>`;
        }

        const statuses = [
            { key: "avail",   label: "Disponível",    cls: "active-avail"   },
            { key: "maybe",   label: "Talvez",        cls: "active-maybe"   },
            { key: "unavail", label: "Indisponível",  cls: "active-unavail" },
        ];

        popover.innerHTML = `
            <div class="sched-popover-status-btns">
                ${statuses.map(s => `
                    <button class="sched-popover-status-btn${curStatus === s.key ? " " + s.cls : ""}"
                            data-status="${s.key}">${s.label}</button>
                `).join("")}
            </div>
            ${slotsHtml}
            <div class="sched-popover-footer">
                <button class="sched-btn-confirm" id="sp-confirm">Confirmar</button>
                <button class="sched-btn-cancel" id="sp-cancel">Cancelar</button>
            </div>
        `;

        // Listeners de status
        popover.querySelectorAll(".sched-popover-status-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                curStatus = btn.dataset.status;
                if (curStatus === "unavail") selectedIdx.clear();
                else if (selectedIdx.size === 0) {
                    SCHED_SLOTS.forEach((_, i) => selectedIdx.add(i));
                }
                renderPopover();
                bindGridListeners();
            });
        });

        // Confirmar
        const confirmBtn = popover.querySelector("#sp-confirm");
        if (confirmBtn) confirmBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isDayAll = selectedIdx.size === SCHED_SLOTS.length;
            let ranges;
            if (curStatus === "unavail" || isDayAll) {
                ranges = [];
            } else {
                ranges = slotsToRanges([...selectedIdx]);
            }
            if (curStatus === "") {
                delete player.monthlySchedule[dateKey];
            } else {
                player.monthlySchedule[dateKey] = { status: curStatus, ranges };
            }
            if (curStatus === "avail" || curStatus === "maybe") {
                (state.pendingNotifications || [])
                    .filter(n => n.date === dateKey)
                    .forEach(n => markNotificationSeen(n.id));
                renderNotificationBanner();
            }
            closeSchedulePopover();
            saveState();
            renderScheduleTable();
        });

        // Cancelar
        const cancelBtn = popover.querySelector("#sp-cancel");
        if (cancelBtn) cancelBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeSchedulePopover();
        });

        // Dia inteiro / Limpar
        const allDayBtn = popover.querySelector("#sp-all-day");
        if (allDayBtn) allDayBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            SCHED_SLOTS.forEach((_, i) => selectedIdx.add(i));
            renderPopover();
            bindGridListeners();
        });
        const clearBtn = popover.querySelector("#sp-clear");
        if (clearBtn) clearBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            selectedIdx.clear();
            renderPopover();
            bindGridListeners();
        });
    }

    function bindGridListeners() {
        const grid = popover.querySelector("#sp-grid");
        if (!grid) return;

        let dragging = false;
        let dragMode = null; // "add" | "remove"

        grid.addEventListener("mousedown", (e) => {
            const slot = e.target.closest(".sched-slot");
            if (!slot) return;
            e.preventDefault();
            dragging = true;
            const idx = parseInt(slot.dataset.idx, 10);
            dragMode = selectedIdx.has(idx) ? "remove" : "add";
            toggleSlot(idx);
        });
        grid.addEventListener("mouseover", (e) => {
            if (!dragging) return;
            const slot = e.target.closest(".sched-slot");
            if (!slot) return;
            toggleSlot(parseInt(slot.dataset.idx, 10));
        });
        document.addEventListener("mouseup", () => { dragging = false; }, { once: true });

        function toggleSlot(idx) {
            if (dragMode === "add") selectedIdx.add(idx);
            else selectedIdx.delete(idx);
            const slotEl = grid.querySelector(`[data-idx="${idx}"]`);
            if (!slotEl) return;
            const slotColor = curStatus === "maybe" ? "var(--color-late)" : "var(--color-avail)";
            if (selectedIdx.has(idx)) {
                slotEl.classList.add("selected");
                slotEl.style.background = slotColor;
                slotEl.style.borderColor = slotColor;
            } else {
                slotEl.classList.remove("selected");
                slotEl.style.background = "";
                slotEl.style.borderColor = "";
            }
        }
    }

    renderPopover();
    document.body.appendChild(popover);
    bindGridListeners();

    // Fecha com ESC ou clique fora. closeSchedulePopover() agora chama
    // _popoverCleanup automaticamente, então não precisa duplicar aqui.
    function onKeyDown(e) {
        if (e.key === "Escape") closeSchedulePopover();
    }
    function onClickOutside(e) {
        if (!popover.contains(e.target)) closeSchedulePopover();
    }
    function cleanup() {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("click",   onClickOutside);
    }
    _popoverCleanup = cleanup;
    // Sentinela para corrigir race: se openSchedulePopover for chamado
    // várias vezes seguidas sincronamente, só o último deve attachar listeners.
    const myCleanupRef = cleanup;
    setTimeout(() => {
        if (_popoverCleanup !== myCleanupRef) return; // já fechou ou foi substituído
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("click",   onClickOutside);
    }, 0);
}

// Cria ou atualiza um evento agendado.
// `extra` opcional: { limitedJobMinLevel?: number, eventLabel?: string }
// Para conteúdos Limited, múltiplos eventos paralelos no mesmo progId são
// permitidos (cada um com `limitedJobMinLevel` próprio). Para os demais,
// continua valendo "1 evento futuro por progId".
function upsertRaidEvent(dateKey, progId, quorum, description, extra) {
    if (!state.raidEvents) state.raidEvents = [];
    const limited = isLimitedProg(progId);
    extra = extra || {};

    // Procura existente — pra Limited, precisa bater (date + progId + label/level)
    // pra evitar colisão; pra não-Limited, basta progId + date.
    const existing = limited
        ? null  // edição de evento Limited específico é por id (openScheduleModal passa)
        : state.raidEvents.find(e => (e.postponedTo || e.date) === dateKey && e.progId === progId);
    if (existing) {
        existing.quorum = quorum;
        if (description !== undefined) existing.description = description;
        // Fase Q — atualiza time/durationMin se fornecidos
        if (Object.prototype.hasOwnProperty.call(extra, "time")) existing.time = extra.time;
        if (Object.prototype.hasOwnProperty.call(extra, "durationMin")) existing.durationMin = extra.durationMin;
        return existing;
    }

    // Para conteúdos não-Limited, mantém "1 evento futuro por prog"
    if (!limited) {
        state.raidEvents = state.raidEvents.filter(e => e.progId !== progId);
    }

    // ID único: pra Limited, sufixa timestamp pra permitir múltiplos na mesma data
    const baseId = `evt_${progId}_${dateKey.replace(/-/g, '')}`;
    const eventId = limited ? `${baseId}_${Date.now().toString(36)}` : baseId;

    const evt = {
        id: eventId,
        progId,
        progName: getProgObj(progId).name,
        date: dateKey,
        quorum,
        description: description || "",
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
        postponedTo: null,
        postponedBy: null,
        postponedAt: null,
        reminder24hSent: false,
        reminderTodaySent: false,
        // Fase Q — horário e duração (null = "horário a definir")
        time: Object.prototype.hasOwnProperty.call(extra, "time") ? extra.time : null,
        durationMin: Object.prototype.hasOwnProperty.call(extra, "durationMin") ? extra.durationMin : null,
    };
    if (limited) {
        const lvl = parseInt(extra.limitedJobMinLevel, 10);
        evt.limitedJobMinLevel = Number.isFinite(lvl) && lvl > 0 ? lvl : 1;
        if (extra.eventLabel) evt.eventLabel = String(extra.eventLabel).slice(0, 50);
    }
    state.raidEvents.push(evt);
    return evt;
}

function postponeRaidEvent(dateKey, newDate) {
    const evt = getRaidEventForDate(dateKey);
    if (!evt) return;
    evt.postponedTo  = newDate;
    evt.postponedBy  = currentUserId;
    evt.postponedAt  = new Date().toISOString();
    addScheduleNotification(newDate, evt.progId);
    removeScheduleNotification(dateKey);
}

function removeRaidEvent(dateKey) {
    const evt = getRaidEventForDate(dateKey);
    if (!evt) return;
    removeRaidEventById(evt.id);
    removeScheduleNotification(dateKey);
}

// Remove um evento específico pelo id (usado para eventos Limited multi-evento)
// e limpa referências em subscribedProgs do character logado.
function removeRaidEventById(eventId) {
    if (!eventId) return;
    state.raidEvents = (state.raidEvents || []).filter(e => e.id !== eventId);
    if (currentCharacter && Array.isArray(currentCharacter.subscribedProgs)) {
        const before = currentCharacter.subscribedProgs.length;
        currentCharacter.subscribedProgs = currentCharacter.subscribedProgs.filter(id => id !== eventId);
        if (currentCharacter.subscribedProgs.length !== before) {
            saveCharacterDebounced();
        }
    }
}

// ==========================================================================
// Modal de Agendamento de Dia (Fase 2A / 11)
// ==========================================================================

function openScheduleModal(dateKey = null, defaultProgId = null) {
    const modal = document.getElementById("modal-schedule-date");
    const title = document.getElementById("modal-sched-title");
    const body  = document.getElementById("modal-sched-body");
    if (!modal || !title || !body) return;

    let resolvedDateKey = dateKey;
    if (dateKey) {
        const [y, m, d] = dateKey.split("-");
        title.textContent = `Agendar — ${d}/${m}/${y}`;
    } else {
        title.textContent = "Nova Sessão";
    }

    const existingEvt = dateKey ? getRaidEventForDate(dateKey) : null;
    const currentProgId = existingEvt ? existingEvt.progId : (defaultProgId || null);
    const currentQuorum = existingEvt ? existingEvt.quorum : 6;
    const currentDescription = existingEvt ? (existingEvt.description || "") : "";
    const canEditDetails = !existingEvt || canEditEventDetails(existingEvt);
    const progs = state.activeProgs || [];

    let html = `<p class="sched-modal-desc" id="sched-modal-desc">Selecione o conteúdo e o quorum mínimo de confirmações.</p>`;

    if (!dateKey) {
        html += `
            <div id="sched-date-row" style="margin-bottom:14px;">
                <label style="font-size:0.85rem;color:var(--text-muted);display:block;margin-bottom:4px;">Data da sessão <span style="color:var(--color-late)">*</span></label>
                <input type="text" id="inp-sched-session-date" class="ff-input" placeholder="DD/MM/AAAA" maxlength="10" inputmode="numeric" style="width:100%;">
            </div>`;
    }

    // Seleção de prog
    html += `<div class="sched-prog-options">`;
    progs.forEach(progId => {
        const name = getProgObj(progId).name.split(" (")[0].split(":")[0];
        const active = progId === currentProgId ? " sched-opt-active" : "";
        html += `<button class="ff-btn-action sched-opt-btn${active}" data-prog="${progId}">${name}</button>`;
    });
    html += `</div>`;

    // Quorum (max e visibilidade ajustados conforme o prog selecionado)
    const initialMax = getPartySize(currentProgId || progs[0] || "geral");
    const initialQuorum = Math.min(currentQuorum, initialMax);
    html += `
        <div class="sched-quorum-row" id="sched-quorum-row">
            <label class="sched-quorum-label" for="inp-sched-quorum">Quorum mínimo:</label>
            <input id="inp-sched-quorum" type="number" min="1" max="${initialMax}" value="${initialQuorum}" class="ff-input sched-quorum-input">
            <span class="sched-quorum-hint">players</span>
        </div>`;

    // Fase Q — duração + janelas viáveis + modo manual
    const initialDuration = (existingEvt && existingEvt.durationMin)
        ? existingEvt.durationMin
        : getDefaultDurationForProg(currentProgId || progs[0]);
    const initialTime = (existingEvt && existingEvt.time) || "";
    const initialManual = !!(existingEvt && existingEvt.time);
    html += `
        <div class="sched-q-section" id="sched-q-section" style="margin-top:14px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">
            <div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap;margin-bottom:10px;">
                <div style="flex:0 0 140px;">
                    <label for="inp-sched-duration" style="font-size:0.85rem;color:var(--text-muted);display:block;margin-bottom:4px;">Duração esperada</label>
                    <div style="display:flex;gap:4px;align-items:center;">
                        <input id="inp-sched-duration" type="number" class="ff-input" min="30" max="360" step="30" value="${initialDuration}" style="width:80px;">
                        <span style="font-size:0.78rem;color:var(--text-muted);">min</span>
                    </div>
                </div>
                <label class="sched-manual-toggle" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.82rem;color:var(--text-muted);">
                    <input type="checkbox" id="inp-sched-manual-mode" ${initialManual ? "checked" : ""}>
                    Modo manual (definir horário sem sugestão)
                </label>
            </div>
            <div class="sched-manual-row" id="sched-manual-row" style="${initialManual ? "" : "display:none;"}margin-bottom:10px;">
                <label for="inp-sched-time" style="font-size:0.85rem;color:var(--text-muted);display:block;margin-bottom:4px;">Horário de início (HH:MM)</label>
                <input id="inp-sched-time" type="text" class="ff-input" maxlength="5" inputmode="numeric" placeholder="20:30" value="${initialTime}" style="width:100px;">
            </div>
            <div class="sched-windows-wrap" id="sched-windows-wrap" style="${initialManual ? "display:none;" : ""}">
                <div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:6px;">Janelas viáveis (escolha uma para agendar com horário):</div>
                <div class="sched-windows-list" id="sched-windows-list" style="display:flex;flex-direction:column;gap:4px;max-height:180px;overflow-y:auto;">
                    <div style="color:var(--text-muted);font-style:italic;font-size:0.8rem;padding:6px;">Selecione data e conteúdo para ver janelas.</div>
                </div>
            </div>
        </div>`;

    // Bug 2 — campos específicos de Limited: nível mínimo do job + label opcional.
    // Visíveis só quando prog selecionado é Limited (toggle via JS abaixo).
    const initialLimited = isLimitedProg(currentProgId);
    const initialLimitedJobId = initialLimited ? getLimitedJob(currentProgId) : "";
    const currentMinLevel = (existingEvt && Number.isFinite(existingEvt.limitedJobMinLevel)) ? existingEvt.limitedJobMinLevel : "";
    const currentLabel = (existingEvt && existingEvt.eventLabel) ? existingEvt.eventLabel : "";
    html += `
        <div class="sched-limited-row" id="sched-limited-row" style="${initialLimited ? '' : 'display:none;'}margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;align-items:end;">
            <div style="flex:0 0 130px;">
                <label for="inp-sched-limited-level" style="font-size:0.85rem;color:var(--text-muted);display:block;margin-bottom:4px;">
                    Nível mínimo <span id="sched-limited-job-label" style="color:var(--gold-bright);">${escapeHtml(initialLimitedJobId)}</span>
                </label>
                <input id="inp-sched-limited-level" type="number" class="ff-input" min="1" max="100" value="${currentMinLevel}" placeholder="Ex: 70">
            </div>
            <div style="flex:1;min-width:160px;">
                <label for="inp-sched-event-label" style="font-size:0.85rem;color:var(--text-muted);display:block;margin-bottom:4px;">Rótulo do evento (opcional)</label>
                <input id="inp-sched-event-label" type="text" class="ff-input" maxlength="50" placeholder="Ex: Run de treino" value="${escapeHtml(currentLabel)}">
            </div>
        </div>`;

    // Descrição do evento (Fase J): visível para criação nova e para quem pode editar
    if (canEditDetails) {
        const escapedDesc = currentDescription.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        html += `
            <div class="sched-description-row" style="margin-top:14px;display:flex;flex-direction:column;gap:6px;">
                <label class="sched-description-label" for="inp-sched-description" style="font-size:0.85rem;color:var(--text-muted);">Detalhes do evento (opcional):</label>
                <textarea id="inp-sched-description" class="ff-input" rows="4" maxlength="2000"
                          style="resize:vertical;font-family:inherit;width:100%;"
                          placeholder="Objetivos da sessão, observações sobre composição, regras de loot...">${escapedDesc}</textarea>
                <span id="sched-description-counter" style="font-size:0.72rem;color:var(--text-muted);align-self:flex-end;">${currentDescription.length}/2000</span>
            </div>`;
    }

    // Adiamento (só se já existe evento nesse dia)
    if (existingEvt) {
        html += `
        <div class="sched-postpone-row" id="sched-postpone-section">
            <button id="btn-sched-postpone-toggle" class="ff-btn-small" style="width:100%;justify-content:center;">Adiar para outra data</button>
            <div id="sched-postpone-form" style="display:none;margin-top:8px;flex-wrap:wrap;gap:8px;align-items:center;">
                <input type="text" id="inp-sched-new-date" class="ff-input" style="flex:1;" placeholder="DD/MM/AAAA" maxlength="10" inputmode="numeric">
                <button id="btn-sched-confirm-postpone" class="ff-btn-action">Confirmar</button>
            </div>
        </div>`;
        html += `<button id="btn-sched-clear" class="ff-btn-small sched-clear-btn">Limpar Agendamento</button>`;
    }

    body.innerHTML = html;

    // Máscara DD/MM/AAAA para campo de data de nova sessão
    const sessionDateEl = body.querySelector("#inp-sched-session-date");
    if (sessionDateEl) {
        sessionDateEl.addEventListener("input", e => {
            let v = e.target.value.replace(/\D/g, '').slice(0, 8);
            if (v.length > 4) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
            else if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
            e.target.value = v;
        });
    }

    // Counter dinâmico do textarea de descrição
    const descEl = body.querySelector("#inp-sched-description");
    const descCounter = body.querySelector("#sched-description-counter");
    if (descEl && descCounter) {
        descEl.addEventListener("input", () => {
            descCounter.textContent = `${descEl.value.length}/2000`;
        });
    }

    // Auto-máscara DD/MM/AAAA no campo de nova data
    const dateInputEl = body.querySelector("#inp-sched-new-date");
    if (dateInputEl) {
        dateInputEl.addEventListener("input", e => {
            let v = e.target.value.replace(/\D/g, '').slice(0, 8);
            if (v.length > 4) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
            else if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
            e.target.value = v;
        });
    }

    // Ajusta a UI de quorum conforme o partyMode do prog selecionado
    function refreshQuorumUI(progId) {
        const row = body.querySelector("#sched-quorum-row");
        const desc = body.querySelector("#sched-modal-desc");
        const input = body.querySelector("#inp-sched-quorum");
        if (!row || !input) return;
        if (isDynamicProg(progId)) {
            row.style.display = "none";
            if (desc) desc.textContent = "Evento aberto: notifica os jogadores quando vai acontecer. Sem quorum mínimo.";
            return;
        }
        row.style.display = "";
        if (desc) desc.textContent = "Selecione o conteúdo e o quorum mínimo de confirmações.";
        const max = getPartySize(progId);
        input.max = max;
        const v = parseInt(input.value, 10) || max;
        if (v > max) input.value = max;
    }

    // Bug 2 — mostra/esconde a row de Limited (nível mín + label) conforme prog
    function refreshLimitedUI(progId) {
        const row = body.querySelector("#sched-limited-row");
        const jobLabel = body.querySelector("#sched-limited-job-label");
        if (!row) return;
        if (isLimitedProg(progId)) {
            row.style.display = "flex";
            if (jobLabel) jobLabel.textContent = getLimitedJob(progId) || "";
        } else {
            row.style.display = "none";
        }
    }

    // Fase Q — janela viável (estado selecionado pelo officer)
    let pickedWindow = null; // {start, end, durationMin, guaranteed, ...} ou null

    // Recomputa as janelas viáveis com base em progId + dateKey + duração
    function refreshWindows() {
        const wrap = body.querySelector("#sched-windows-wrap");
        const list = body.querySelector("#sched-windows-list");
        const durInput = body.querySelector("#inp-sched-duration");
        if (!list) return;

        // Modo manual escondendo a lista? Não precisa renderizar
        const manualEl = body.querySelector("#inp-sched-manual-mode");
        if (manualEl && manualEl.checked) {
            if (wrap) wrap.style.display = "none";
            return;
        }
        if (wrap) wrap.style.display = "";

        // Sem prog ou sem data — mensagem placeholder
        if (!selectedProg) {
            list.innerHTML = `<div style="color:var(--text-muted);font-style:italic;font-size:0.8rem;padding:6px;">Selecione um conteúdo primeiro.</div>`;
            return;
        }
        let evalDateKey = resolvedDateKey;
        if (!evalDateKey) {
            const dateEl = body.querySelector("#inp-sched-session-date");
            const parts = (dateEl?.value || "").trim().split("/");
            if (parts.length === 3 && parts[2].length === 4) {
                evalDateKey = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
            }
        }
        if (!evalDateKey) {
            list.innerHTML = `<div style="color:var(--text-muted);font-style:italic;font-size:0.8rem;padding:6px;">Informe a data para ver janelas.</div>`;
            return;
        }

        const dur = parseInt(durInput?.value || "120", 10) || 120;
        const required = isDynamicProg(selectedProg) ? 1 : getPartySize(selectedProg);
        const target = existingEvt || getProgObj(selectedProg);
        const windows = computeViableWindows(evalDateKey, dur, target, required);

        if (windows.length === 0) {
            list.innerHTML = `<div style="color:var(--color-late);font-size:0.8rem;padding:6px;">Nenhuma janela com ${required} jogadores disponíveis. Ative "Modo manual" para definir horário arbitrário.</div>`;
            return;
        }

        list.innerHTML = windows.slice(0, 8).map((w, i) => {
            const badge = w.guaranteed
                ? `<span style="background:var(--color-avail);color:#000;font-size:0.65rem;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:6px;">GARANTIDA</span>`
                : `<span style="background:var(--color-late);color:#000;font-size:0.65rem;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:6px;">POTENCIAL</span>`;
            const counts = w.guaranteed
                ? `${w.countAvail} confirm.`
                : `${w.countAvail} confirm. + ${w.countMaybe} talvez`;
            const isPicked = pickedWindow && pickedWindow.startIdx === w.startIdx && pickedWindow.endIdx === w.endIdx;
            const pickedStyle = isPicked
                ? `background:rgba(212,175,55,0.15);border-color:var(--gold-bright);`
                : `background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.1);`;
            return `
                <div class="sched-window-item" data-idx="${i}"
                     style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 10px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;cursor:pointer;${pickedStyle}">
                    <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                        <span style="font-weight:700;color:var(--gold-bright);">${formatWindowLabel(w)}</span>
                        ${badge}
                        <span style="font-size:0.75rem;color:var(--text-muted);">${counts}</span>
                    </div>
                    <button class="ff-btn-small btn-pick-window" data-idx="${i}" style="font-size:0.72rem;padding:3px 10px;">${isPicked ? "Selecionada" : "Escolher"}</button>
                </div>`;
        }).join("");

        // Listeners (click no item ou no botão = selecionar)
        list.querySelectorAll(".sched-window-item, .btn-pick-window").forEach(el => {
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                const idx = parseInt(el.dataset.idx, 10);
                pickedWindow = windows[idx] || null;
                refreshWindows(); // re-render para mostrar seleção visual
            });
        });
    }

    // Toggle seleção de prog
    let selectedProg = currentProgId || (progs[0] || null);
    refreshQuorumUI(selectedProg);
    refreshLimitedUI(selectedProg);
    refreshWindows();

    // Listeners para refresh das janelas
    const durEl = body.querySelector("#inp-sched-duration");
    if (durEl) durEl.addEventListener("input", refreshWindows);

    const manualEl = body.querySelector("#inp-sched-manual-mode");
    if (manualEl) manualEl.addEventListener("change", () => {
        const manualRow = body.querySelector("#sched-manual-row");
        if (manualRow) manualRow.style.display = manualEl.checked ? "" : "none";
        refreshWindows();
    });

    if (sessionDateEl) sessionDateEl.addEventListener("input", () => {
        // Espera DD/MM/AAAA completo
        const v = sessionDateEl.value.trim();
        if (v.length === 10) refreshWindows();
    });

    // Máscara HH:MM para horário manual
    const timeEl = body.querySelector("#inp-sched-time");
    if (timeEl) {
        timeEl.addEventListener("input", e => {
            let v = e.target.value.replace(/\D/g, '').slice(0, 4);
            if (v.length > 2) v = v.slice(0, 2) + ':' + v.slice(2);
            e.target.value = v;
        });
    }
    body.querySelectorAll(".sched-opt-btn").forEach(btn => {
        // Confirmar agendamento ao clicar no prog (double-click)
        btn.addEventListener("dblclick", confirmSchedule);

        // Clique único: seleciona o prog; segundo clique no mesmo prog confirma.
        // Capturamos wasAlreadyActive ANTES de modificar as classes para evitar
        // que o mesmo clique que seleciona o prog já dispare confirmSchedule.
        btn.addEventListener("click", () => {
            const wasAlreadyActive = btn.classList.contains("sched-opt-active") && btn.dataset.prog === selectedProg;
            body.querySelectorAll(".sched-opt-btn").forEach(b => b.classList.remove("sched-opt-active"));
            btn.classList.add("sched-opt-active");
            selectedProg = btn.dataset.prog;
            refreshQuorumUI(selectedProg);
            refreshLimitedUI(selectedProg);
            // Fase Q — duração default por categoria; reseta janela escolhida
            const durEl2 = body.querySelector("#inp-sched-duration");
            if (durEl2 && !existingEvt) durEl2.value = getDefaultDurationForProg(selectedProg);
            pickedWindow = null;
            refreshWindows();

            if (wasAlreadyActive) {
                // segundo clique no mesmo prog = confirmar
                if (existingEvt && existingEvt.progId === selectedProg) return; // sem mudança
                // Se há campo de data visível mas ainda vazio, aguarda o usuário preenchê-lo
                const sessDateEl = body.querySelector("#inp-sched-session-date");
                if (sessDateEl && !sessDateEl.value.trim()) return;
                confirmSchedule();
            }
        });
    });

    function confirmSchedule() {
        if (!selectedProg) return;
        if (!resolvedDateKey) {
            const dateEl = body.querySelector("#inp-sched-session-date");
            const dateVal = (dateEl?.value || "").trim();
            if (!dateVal) {
                // Sem data — descarta. Descrição só vive em raidEvent.description;
                // não persistimos mais como "nota do prog" porque sobreviveria
                // ao delete do evento (bug).
                if (dateEl) {
                    dateEl.style.borderColor = "var(--color-late)";
                    setTimeout(() => { dateEl.style.borderColor = ""; }, 1500);
                }
                return;
            }
            const parts = dateVal.split("/");
            if (parts.length !== 3 || parts[2].length !== 4) {
                if (dateEl) {
                    dateEl.style.borderColor = "var(--color-late)";
                    setTimeout(() => { dateEl.style.borderColor = ""; }, 1500);
                }
                return;
            }
            resolvedDateKey = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        }
        // Modo dynamic: quorum não se aplica; gravamos 0 para sinalizar.
        const quorum = isDynamicProg(selectedProg)
            ? 0
            : (parseInt(body.querySelector("#inp-sched-quorum")?.value || "6", 10) || 6);
        const descInput = body.querySelector("#inp-sched-description");
        const description = descInput ? descInput.value : undefined;

        // Bug 2 — campos extras pra Limited (validação client-side aqui)
        const extra = {};
        if (isLimitedProg(selectedProg)) {
            const lvlEl = body.querySelector("#inp-sched-limited-level");
            const lvlVal = parseInt(lvlEl?.value || "", 10);
            if (!Number.isFinite(lvlVal) || lvlVal < 1 || lvlVal > 100) {
                if (lvlEl) {
                    lvlEl.style.borderColor = "var(--color-late)";
                    setTimeout(() => { lvlEl.style.borderColor = ""; }, 1500);
                    lvlEl.focus();
                }
                showToast(`Informe o nível mínimo (1-100) de ${getLimitedJob(selectedProg)} para este evento.`, { type: "error", title: "Nível obrigatório" });
                return;
            }
            extra.limitedJobMinLevel = lvlVal;
            const labelEl = body.querySelector("#inp-sched-event-label");
            const labelVal = (labelEl?.value || "").trim();
            if (labelVal) extra.eventLabel = labelVal;
        }

        // Fase Q — horário + duração: modo manual (input livre) ou janela escolhida
        const manualOn = !!body.querySelector("#inp-sched-manual-mode")?.checked;
        const durMin   = parseInt(body.querySelector("#inp-sched-duration")?.value || "0", 10);
        if (manualOn) {
            const timeStr = (body.querySelector("#inp-sched-time")?.value || "").trim();
            if (timeStr && /^\d{2}:\d{2}$/.test(timeStr) && SCHED_SLOTS.includes(timeStr)) {
                extra.time = timeStr;
                extra.durationMin = Number.isFinite(durMin) && durMin > 0 ? durMin : null;
            } else if (timeStr) {
                // Inválido: avisa e aborta
                const timeEl = body.querySelector("#inp-sched-time");
                if (timeEl) {
                    timeEl.style.borderColor = "var(--color-late)";
                    setTimeout(() => { timeEl.style.borderColor = ""; }, 1500);
                    timeEl.focus();
                }
                showToast(`Horário inválido. Use HH:MM em blocos de 30 min entre 12:00 e 01:30.`, { type: "error", title: "Horário inválido" });
                return;
            } else {
                // Manual mas sem time: salva sem horário definido
                extra.time = null;
                extra.durationMin = null;
            }
        } else if (pickedWindow) {
            extra.time = pickedWindow.start;
            extra.durationMin = Number.isFinite(durMin) && durMin > 0 ? durMin : pickedWindow.durationMin;
        }
        // Se nenhum dos dois caminhos definiu, deixa time/durationMin ausentes do
        // extra — upsertRaidEvent preserva os valores existentes ou usa null.

        upsertRaidEvent(resolvedDateKey, selectedProg, quorum, description, extra);
        addScheduleNotification(resolvedDateKey, selectedProg);
        saveState();
        renderScheduleTable();
        renderQuickSchedule();
        renderNotificationBanner();
        modal.hidden = true;
        playSfx('success');
    }

    // Botão "Agendar" explícito (double click em prog ou botão no futuro)
    // Para UX simples: clicar num prog diferente do atual já define; clicar Confirmar tb funciona
    // Adicionamos um botão Confirmar se não há evento ainda
    if (!existingEvt && progs.length > 0) {
        const confirmBtn = document.createElement("button");
        confirmBtn.className = "ff-btn-action";
        confirmBtn.style.cssText = "width:100%;margin-top:12px;justify-content:center;";
        confirmBtn.textContent = dateKey ? "Confirmar Agendamento" : "Salvar";
        confirmBtn.addEventListener("click", confirmSchedule);
        body.appendChild(confirmBtn);
    } else if (existingEvt && canEditDetails) {
        // Permite salvar mudanças (descrição, quorum) sem precisar trocar de prog
        const saveBtn = document.createElement("button");
        saveBtn.className = "ff-btn-action";
        saveBtn.style.cssText = "width:100%;margin-top:12px;justify-content:center;";
        saveBtn.textContent = "Salvar Alterações";
        saveBtn.addEventListener("click", confirmSchedule);
        body.appendChild(saveBtn);
    }

    // Toggle formulário de adiamento
    const postponeToggle = body.querySelector("#btn-sched-postpone-toggle");
    if (postponeToggle) {
        postponeToggle.addEventListener("click", () => {
            const form = body.querySelector("#sched-postpone-form");
            if (form) form.style.display = form.style.display === 'none' ? 'flex' : 'none';
        });
    }

    // Confirmar adiamento
    const confirmPostpone = body.querySelector("#btn-sched-confirm-postpone");
    if (confirmPostpone) {
        confirmPostpone.addEventListener("click", () => {
            const raw = body.querySelector("#inp-sched-new-date")?.value || '';
            const parts = raw.split('/');
            const newDate = (parts.length === 3 && parts[2].length === 4)
                ? `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`
                : null;
            const todayIso = new Date().toISOString().slice(0, 10);
            if (!newDate || newDate < todayIso || newDate === dateKey) return;
            postponeRaidEvent(dateKey, newDate);
            saveState();
            renderScheduleTable();
            renderQuickSchedule();
            renderNotificationBanner();
            modal.hidden = true;
            playSfx('success');
            showToast(`Raid adiada para ${raw}`, { type: "info", title: "Adiamento" });
        });
    }

    // Limpar agendamento
    const clearBtn = body.querySelector("#btn-sched-clear");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            removeRaidEvent(dateKey);
            saveState();
            renderScheduleTable();
            renderQuickSchedule();
            renderNotificationBanner();
            modal.hidden = true;
            playSfx('click');
        });
    }

    modal.hidden = false;
}

// Fase J: modal de leitura da descrição do evento (qualquer membro pode ver).
function openEventDetailsModal(dateKey) {
    const modal = document.getElementById("modal-event-details");
    const title = document.getElementById("modal-event-details-title");
    const body  = document.getElementById("modal-event-details-body");
    if (!modal || !title || !body) return;

    const evt = getRaidEventForDate(dateKey);
    if (!evt) return;

    const targetDate = evt.postponedTo || evt.date;
    const [y, m, d] = targetDate.split("-");
    const wkNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const dObj = new Date(targetDate + "T00:00:00");
    const dateStr = `${wkNames[dObj.getDay()]}, ${d}/${m}/${y}`;
    const progName = (getProgObj(evt.progId).name || evt.progName || "Raid").split(" (")[0];
    title.textContent = `${progName} — ${dateStr}`;

    const desc = evt.description || "";
    const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const canEdit = canEditEventDetails(evt);

    const descHtml = desc.trim()
        ? `<div style="white-space:pre-wrap;font-size:0.9rem;line-height:1.5;color:var(--text-main);padding:8px 0;">${escape(desc)}</div>`
        : `<div style="font-size:0.85rem;color:var(--text-muted);font-style:italic;padding:8px 0;">Sem detalhes registrados para este evento.</div>`;

    const editBtnHtml = canEdit
        ? `<button id="btn-event-details-edit" class="ff-btn-action" style="margin-top:12px;width:100%;justify-content:center;">Editar Detalhes</button>`
        : "";

    body.innerHTML = `${descHtml}${editBtnHtml}`;

    const editBtn = body.querySelector("#btn-event-details-edit");
    if (editBtn) {
        editBtn.addEventListener("click", () => {
            modal.hidden = true;
            openScheduleModal(evt.date);
        });
    }

    modal.hidden = false;
}

function addScheduleNotification(dateKey, progId) {
    if (!state.pendingNotifications) state.pendingNotifications = [];
    // Substitui notificação existente para o mesmo dia
    state.pendingNotifications = state.pendingNotifications.filter(n => n.date !== dateKey);
    state.pendingNotifications.push({
        id: `${dateKey}-${Date.now()}`,
        date: dateKey,
        progId,
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
    });
}

function removeScheduleNotification(dateKey) {
    if (!state.pendingNotifications) return;
    state.pendingNotifications = state.pendingNotifications.filter(n => n.date !== dateKey);
}

function getSeenNotificationIds() {
    try {
        return JSON.parse(localStorage.getItem("ffxiv-seen-notifs") || "[]");
    } catch { return []; }
}

function markNotificationSeen(id) {
    const seen = getSeenNotificationIds();
    if (!seen.includes(id)) seen.push(id);
    localStorage.setItem("ffxiv-seen-notifs", JSON.stringify(seen));
}

function renderNotificationBanner() {
    const container = document.getElementById("notif-banner-container");
    if (!container) return;

    const seen = getSeenNotificationIds();
    const unseen = (state.pendingNotifications || []).filter(n => !seen.includes(n.id));

    if (unseen.length === 0) {
        container.hidden = true;
        container.innerHTML = "";
        return;
    }

    const monthNames = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

    const items = unseen.map(n => {
        const [y, m, d] = n.date.split("-");
        const progObj = getProgObj(n.progId);
        const progName = progObj.name.split(" (")[0].split(":")[0];
        const dateLabel = `${d} de ${monthNames[parseInt(m, 10) - 1]}`;
        return `<div class="notif-item" data-id="${n.id}" data-date="${n.date}">
            <span class="notif-item-text">Raid agendada: <strong>${progName}</strong> em <strong>${dateLabel}</strong> — marque sua disponibilidade.</span>
            <div class="notif-item-actions">
                <button class="ff-btn-action btn-notif-avail" data-id="${n.id}">Marcar Disponibilidade</button>
                <button class="ff-btn-small btn-notif-dismiss" data-id="${n.id}">Dispensar</button>
            </div>
        </div>`;
    }).join("");

    container.innerHTML = `<div class="notif-banner">${items}</div>`;
    container.hidden = false;

    container.querySelectorAll(".btn-notif-dismiss").forEach(btn => {
        btn.addEventListener("click", () => {
            markNotificationSeen(btn.dataset.id);
            renderNotificationBanner();
        });
    });

    container.querySelectorAll(".btn-notif-avail").forEach(btn => {
        btn.addEventListener("click", () => {
            markNotificationSeen(btn.dataset.id);
            renderNotificationBanner();
            // Navega para a aba do calendário
            const calTab = document.querySelector(".tab-btn[data-tab='schedule']");
            if (calTab) calTab.click();
        });
    });
}

// Renderiza o Calendário Mensal com Seletor de Raid alvo por Dia
function renderScheduleTable() {
    const theadRow = document.getElementById("calendar-thead-row");
    const tbody = document.getElementById("calendar-tbody");
    const label = document.getElementById("calendar-month-label");

    if (!theadRow || !tbody) return;

    // Fase Q — toggle "Modo Overlap" (heatmap) visível só para officer/admin
    const overlapWrap = document.getElementById("overlap-toggle-wrap");
    const overlapInput = document.getElementById("inp-overlap-mode");
    if (overlapWrap) overlapWrap.style.display = isOfficer() ? "inline-flex" : "none";
    if (overlapInput && !overlapInput._wired) {
        overlapInput._wired = true;
        overlapInput.addEventListener("change", () => {
            window._overlapView = overlapInput.checked;
            renderScheduleTable();
        });
        // Sincroniza estado salvo (memória em window, não persiste)
        overlapInput.checked = !!window._overlapView;
    }
    const overlapMode = !!window._overlapView && isOfficer();

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

    theadRow.innerHTML = `<th class="col-fixed">Jogador</th>`;
    for (let d = 1; d <= numDays; d++) {
        const currDate = new Date(year, month, d);
        const wkDay = shortWkNames[currDate.getDay()];
        const isWeekend = currDate.getDay() === 0 || currDate.getDay() === 6;
        const dateKey = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
        
        const th = document.createElement("th");
        if (isWeekend) th.style.background = "rgba(239, 68, 68, 0.1)";
        
        const raidEvt = getRaidEventForDate(dateKey);
        const scheduledProgId = raidEvt ? raidEvt.progId : null;
        const progLabel = scheduledProgId
            ? getProgObj(scheduledProgId).name.split(" (")[0].split(":")[0]
            : "";
        const canSched = canScheduleDate();

        if (raidEvt) {
            const avail = getAvailCountForDate(dateKey, raidEvt);
            const dynamicEvt = isDynamicProg(raidEvt.progId);
            th.classList.add("day-scheduled");
            let tip;
            if (dynamicEvt) {
                tip = `${avail} confirmado(s)`;
            } else {
                const quorumMet = avail >= raidEvt.quorum;
                if (quorumMet) th.classList.add("day-quorum-met");
                tip = `${avail}/${raidEvt.quorum} confirmados`;
            }
            th.title = canSched
                ? `Agendado: ${progLabel} — ${tip} — clique para alterar`
                : `Agendado: ${progLabel} — ${tip}`;
        } else if (canSched) {
            th.title = "Clique para agendar";
        }

        const hasDescription = !!(raidEvt && (raidEvt.description || "").trim());
        const detailsIndicator = hasDescription
            ? `<button class="cell-details-indicator" data-date="${dateKey}" title="Ver detalhes do evento" aria-label="Detalhes" style="position:absolute;top:2px;right:2px;background:transparent;border:none;color:var(--gold-bright);cursor:pointer;padding:0 2px;font-size:0.7rem;line-height:1;">●</button>`
            : "";
        const noTimeBadge = raidEvt
            ? (raidEvt.time
                ? `<div class="cell-no-time-badge" style="color:var(--gold-bright);" title="Início ${raidEvt.time}${raidEvt.durationMin ? ` · ${raidEvt.durationMin}min` : ""}">${raidEvt.time}</div>`
                : `<div class="cell-no-time-badge" title="Horário a definir pelo officer">?h</div>`)
            : "";

        // Fase Q — heatmap por janela viável (modo Overlap, só officer/admin)
        if (overlapMode) {
            const windows = computeViableWindows(dateKey, 60, null, 8);
            const best = windows[0];
            if (best) {
                const intensity = Math.min(1, best.widthSlots / 8);
                const alpha = 0.15 + intensity * 0.45;
                th.style.background = `rgba(212, 175, 55, ${alpha})`;
                th.title = `Maior janela viável (≥8): ${formatWindowLabel(best)} — ${best.guaranteed ? "garantida" : "potencial"}`;
                th.classList.add("day-overlap-heat");
            } else {
                th.style.background = "rgba(120, 120, 120, 0.06)";
                th.title = `Nenhuma janela de ≥1h com 8 jogadores`;
            }
        }
        th.style.position = "relative";
        th.innerHTML = `
            ${detailsIndicator}
            ${noTimeBadge}
            <div class="cell-day-num">${d}</div>
            <div class="cell-day-wk">${wkDay}</div>
        `;
        const indBtn = th.querySelector(".cell-details-indicator");
        if (indBtn) {
            indBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openEventDetailsModal(dateKey);
            });
        }
        if (canSched) {
            th.style.cursor = "pointer";
            th.addEventListener("click", () => {
                playSfx('click');
                openScheduleModal(dateKey);
            });
        }
        theadRow.appendChild(th);
    }
    
    tbody.innerHTML = "";
    
    if (state.roster.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${numDays + 1}" style="text-align: center; color: var(--text-muted); padding: 20px;">Nenhum jogador cadastrado no elenco.</td></tr>`;
        renderQuickSchedule();
        return;
    }
    
    // Fase O.2 — calendário é GLOBAL: mostra todos os jogadores do roster,
    // independente do prog inspecionado. Disponibilidade do dia é por player,
    // não por prog. Identidade vem do character_json para slots vinculados.
    // Ordena por nome para apresentação estável.
    const sortedRoster = [...state.roster].sort((a, b) => {
        const na = getSlotIdentity(a).name || "";
        const nb = getSlotIdentity(b).name || "";
        return na.localeCompare(nb, "pt-BR");
    });

    sortedRoster.forEach(player => {
        if (!player.monthlySchedule) player.monthlySchedule = {};

        const identity = getSlotIdentity(player);
        const displayName = identity.name || '<span style="font-style:italic;color:#94a3b8;">Sem Nick</span>';

        const tr = document.createElement("tr");
        const tdName = document.createElement("td");
        tdName.className = "col-fixed";
        tdName.style.fontWeight = "600";
        tdName.innerHTML = displayName;
        tr.appendChild(tdName);

        const canTogglePlayer = canEditScheduleFor(player);

        for (let d = 1; d <= numDays; d++) {
            const dateKey = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
            const { status: statusVal, ranges: statusRanges } = getSchedEntry(player, dateKey);

            let statusText = "";
            let statusClass = "";
            if (statusVal === "avail") { statusText = "✔️"; statusClass = "avail"; }
            else if (statusVal === "maybe") { statusText = "⚠️"; statusClass = "late"; }
            else if (statusVal === "unavail") { statusText = "❌"; statusClass = "unavail"; }

            // Fase P — sinaliza visualmente quando o jogador marcou avail mas
            // não atende aos requisitos do evento daquele dia (expansão atual
            // menor que a do conteúdo, ou level do Limited job abaixo do
            // mínimo). Mantém o ✔️ mas adiciona cadeado + tooltip + desatura.
            let incompatReason = "";
            if (statusVal === "avail" || statusVal === "maybe") {
                const evtOfDay = getRaidEventForDate(dateKey);
                if (evtOfDay) {
                    const check = isPlayerCompatibleWithTarget(player, evtOfDay);
                    if (!check.compatible) {
                        statusClass += " cell-incompat";
                        incompatReason = check.reason || "Não atende aos requisitos do evento.";
                    } else if (evtOfDay.time && statusVal === "avail") {
                        // Fase Q — avisa se ranges não cobrem a janela do evento
                        const conf = getConfirmationStatusForEvent(player, evtOfDay);
                        if (conf === "partial") {
                            statusClass += " cell-partial";
                            incompatReason = `Range não cobre toda a janela do evento (${evtOfDay.time} · ${evtOfDay.durationMin || 120}min).`;
                        } else if (conf === "unavail") {
                            statusClass += " cell-incompat";
                            incompatReason = `Range não tem overlap com a janela do evento (${evtOfDay.time}).`;
                        }
                    }
                }
            }

            // Fase Q — mostra ranges resumidos como tooltip se houver
            const rangesLabel = statusRanges.length > 0
                ? " · " + statusRanges.map(r => `${r.start}–${r.end}`).join(", ")
                : "";

            const tdDay = document.createElement("td");
            tdDay.className = `cell-status ${statusClass}${canTogglePlayer ? '' : ' cell-readonly'}`;
            if (incompatReason) {
                tdDay.innerHTML = `${statusText}<span class="cell-incompat-lock" aria-hidden="true">🔒</span>`;
                tdDay.title = `Não conta — ${incompatReason}`;
            } else {
                tdDay.textContent = statusText;
                tdDay.title = canTogglePlayer
                    ? `Dia ${d}${rangesLabel}: Clique para definir disponibilidade`
                    : `Dia ${d}${rangesLabel}: somente o próprio jogador ou officer pode alterar`;
            }

            if (canTogglePlayer) {
                tdDay.addEventListener("click", (e) => {
                    playSfx('click');
                    e.stopPropagation();
                    openSchedulePopover(player, dateKey, tdDay);
                });
            } else {
                tdDay.style.cursor = "not-allowed";
                tdDay.style.opacity = "0.55";
            }
            tr.appendChild(tdDay);
        }
        tbody.appendChild(tr);
    });

    renderQuickSchedule();
}

// Agendamento Preditivo Avançado: Analisa presença parcial, uso do banco e lista nicks confirmados
// Fase L: lista datas com 8+ confirmações disponíveis sem evento agendado.
// Visível apenas para officer/admin. Permite agendar Full Party com 1 clique.
function renderQuorumOpportunities(container) {
    if (!isOfficer()) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const shortWkNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    // Fase P — sugere agendamento apenas quando há jogadores compatíveis
    // suficientes para preencher pelo menos um prog ativo. Full Party = 8,
    // Light Party = 4. Dynamic usa quórum configurado no custom content
    // (`quorum` em customContents). Limited não dispara.
    const candidateProgs = (state.activeProgs || [])
        .map(pid => ({ id: pid, obj: getProgObj(pid) }))
        .filter(({ id, obj }) => {
            if (!obj || isLimitedProg(id)) return false;
            if (isDynamicProg(id)) {
                const q = getCustomContent(id)?.quorum;
                return Number.isFinite(q) && q > 0;
            }
            return true;
        })
        .map(({ id, obj }) => {
            const threshold = isDynamicProg(id)
                ? (getCustomContent(id)?.quorum || 0)
                : getPartySize(id);
            return { ...obj, _threshold: threshold };
        });

    const opportunities = [];
    for (let delta = 0; delta < 14; delta++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (getRaidEventForDate(dateKey)) continue;

        // Busca o "melhor" prog candidato para esta data: o que tem mais
        // compatíveis acima do próprio threshold. Empata pelo maior excedente.
        let best = null;
        candidateProgs.forEach(prog => {
            const c = getAvailCountForDate(dateKey, prog);
            if (c >= prog._threshold) {
                const surplus = c - prog._threshold;
                if (!best || surplus > best.surplus) {
                    best = { count: c, prog, surplus, threshold: prog._threshold };
                }
            }
        });
        if (best) opportunities.push({ dateKey, dateObj: d, count: best.count, prog: best.prog, threshold: best.threshold });
    }

    if (opportunities.length === 0) return;

    const block = document.createElement("div");
    block.className = "quorum-opportunities-block";
    block.style.background = "rgba(16, 185, 129, 0.08)";
    block.style.border = "1px solid var(--color-avail)";
    block.style.borderRadius = "var(--radius-sm)";
    block.style.padding = "10px 12px";
    block.style.marginBottom = "12px";

    let html = `<div style="font-weight: 700; color: var(--color-avail); font-size: 0.9rem; margin-bottom: 6px;">Oportunidades de agendamento</div>`;
    opportunities.forEach(({ dateKey, dateObj, count, prog, threshold }) => {
        const dayStr  = String(dateObj.getDate()).padStart(2, '0');
        const monStr  = String(dateObj.getMonth() + 1).padStart(2, '0');
        const wkStr   = shortWkNames[dateObj.getDay()];
        const dateLbl = `${wkStr}, ${dayStr}/${monStr}`;
        const progLbl = prog ? `<span style="color: var(--gold-bright); font-weight: 600;">${escapeHtml(prog.name.split(" (")[0])}</span>` : "";
        const progAttr = prog ? ` data-prog="${escapeHtml(prog.id)}"` : "";
        const partyLbl = prog && isDynamicProg(prog.id)
            ? `Dynamic (${threshold}p)`
            : (threshold === 4 ? "Light Party" : "Full Party");
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.82rem;">
                <span><span style="color: var(--gold-bright); font-weight: 600;">${dateLbl}</span> — ${count} compatíveis para ${progLbl} (${partyLbl} possível)</span>
                <button class="ff-btn-small btn-quorum-schedule" data-date="${dateKey}"${progAttr} style="padding: 2px 10px; font-size: 0.78rem;">Agendar</button>
            </div>
        `;
    });
    block.innerHTML = html;

    block.querySelectorAll(".btn-quorum-schedule").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const dk = e.currentTarget.getAttribute("data-date");
            const pid = e.currentTarget.getAttribute("data-prog");
            if (dk) openScheduleModal(dk, pid || null);
        });
    });

    container.appendChild(block);
}

function renderQuickSchedule() {
    const container = document.getElementById("quick-schedule-list");
    if (!container) return;
    container.innerHTML = "";

    if (!state.activeProgs || state.activeProgs.length === 0) {
        container.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum conteúdo ativo para agendamento.</span>`;
        return;
    }

    renderQuorumOpportunities(container);

    const today = new Date();
    today.setHours(0,0,0,0);
    const todayKey = today.toISOString().slice(0, 10);

    const shortWkNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    state.activeProgs.forEach(progId => {
        const progObj = getProgObj(progId);
        const progTitulares = state.roster.filter(p => getPlayerStatusForProg(p, progId) === "active");
        const progReservas = state.roster.filter(p => getPlayerStatusForProg(p, progId) === "bench");

        // Encontra o raid event futuro para este prog
        const raidEvt = getRaidEventForProg(progId);
        const dynamicMode = isDynamicProg(progId);
        const defaultQuorum = dynamicMode ? 0 : getPartySize(progId);
        const quorum = raidEvt ? (raidEvt.quorum || defaultQuorum) : defaultQuorum;

        let foundDateKey = null;
        let foundDateObj = null;
        let foundEvt = null;
        let confTitulares = [];
        let confReservas = [];
        let lateTitulares = [];
        let lateReservas = [];
        // Fase P — jogadores marcaram avail mas não atendem aos requisitos do
        // evento (expansão atual menor que a do conteúdo ou level do Limited
        // job abaixo do mínimo). Não contam pra quórum; listados em separado
        // para officer/admin.
        let incompatTitulares = [];
        let incompatReservas = [];

        // Procura a data do evento (ou varre 45 dias se não houver evento)
        const datesToCheck = raidEvt
            ? [raidEvt.postponedTo || raidEvt.date]
            : Array.from({ length: 45 }, (_, i) => {
                const dObj = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
                return `${dObj.getFullYear()}-${String(dObj.getMonth()+1).padStart(2,'0')}-${String(dObj.getDate()).padStart(2,'0')}`;
            });

        for (const dateKey of datesToCheck) {
            if (dateKey < todayKey) continue;
            const dObj = new Date(dateKey + "T00:00:00");

            // Se não há raid event, só mostra datas que tenham confirmações
            const evtForDate = getRaidEventForDate(dateKey);
            if (!raidEvt && (!evtForDate || evtForDate.progId !== progId)) continue;

            // Target para checagem de compatibilidade: o raidEvent (carrega
            // limitedJobMinLevel quando Limited); se não houver, o próprio prog.
            const compatTarget = raidEvt || evtForDate || progObj;

            let tAvail = [];
            let tLate  = [];
            let rAvail = [];
            let rLate  = [];
            let tIncompat = [];
            let rIncompat = [];

            // Fase Q — quando o raidEvt tem time, usa confirmação derivada do range.
            // Sem time, mantém o comportamento legado (status do dia).
            const useDerived = !!(compatTarget && compatTarget.time && compatTarget.progId);

            progTitulares.forEach(p => {
                const displayName = getSlotIdentity(p).name || p.name || "Sem Nick";
                if (useDerived) {
                    const conf = getConfirmationStatusForEvent(p, compatTarget);
                    if (conf === "confirmed")      tAvail.push(displayName);
                    else if (conf === "maybe" || conf === "partial") tLate.push(displayName);
                    else if (conf === "incompatible") tIncompat.push(displayName);
                    return;
                }
                const sVal = getSchedEntry(p, dateKey).status;
                if (sVal === "avail") {
                    if (isPlayerCompatibleWithTarget(p, compatTarget).compatible) tAvail.push(displayName);
                    else tIncompat.push(displayName);
                } else if (sVal === "maybe") {
                    tLate.push(displayName);
                }
            });

            progReservas.forEach(p => {
                const displayName = getSlotIdentity(p).name || p.name || "Sem Nick";
                if (useDerived) {
                    const conf = getConfirmationStatusForEvent(p, compatTarget);
                    if (conf === "confirmed")      rAvail.push(displayName);
                    else if (conf === "maybe" || conf === "partial") rLate.push(displayName);
                    else if (conf === "incompatible") rIncompat.push(displayName);
                    return;
                }
                const sVal = getSchedEntry(p, dateKey).status;
                if (sVal === "avail") {
                    if (isPlayerCompatibleWithTarget(p, compatTarget).compatible) rAvail.push(displayName);
                    else rIncompat.push(displayName);
                } else if (sVal === "maybe") {
                    rLate.push(displayName);
                }
            });

            foundDateKey   = dateKey;
            foundDateObj   = dObj;
            foundEvt       = raidEvt || evtForDate;
            confTitulares  = tAvail;
            confReservas   = rAvail;
            lateTitulares  = tLate;
            lateReservas   = rLate;
            incompatTitulares = tIncompat;
            incompatReservas  = rIncompat;
            break;
        }

        const raidBlock = document.createElement("div");
        raidBlock.className = "next-raid-prog-block";
        raidBlock.style.background = "rgba(0,0,0,0.3)";
        raidBlock.style.border = "1px solid rgba(255,255,255,0.05)";
        raidBlock.style.borderRadius = "var(--radius-sm)";
        raidBlock.style.padding = "12px";
        raidBlock.style.marginBottom = "10px";

        const hasDescription = !!(raidEvt && (raidEvt.description || "").trim());
        const detailsBtnHtml = hasDescription
            ? `<button class="ff-btn-small btn-event-details-open" data-date="${raidEvt.postponedTo || raidEvt.date}" style="padding:2px 10px;font-size:0.72rem;">Detalhes</button>`
            : "";
        const headerHtml = `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight: 700; color: var(--gold-bright); font-size: 0.95rem; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;"><span>${progObj.name.split(" (")[0]}</span>${detailsBtnHtml}</div>`;

        if (foundDateKey) {
            const dayNumStr = String(foundDateObj.getDate()).padStart(2, '0');
            const monthNumStr = String(foundDateObj.getMonth() + 1).padStart(2, '0');
            const yearNumStr = String(foundDateObj.getFullYear());
            const wkDayStr = shortWkNames[foundDateObj.getDay()];
            const dateFormatted = `${wkDayStr}, ${dayNumStr}/${monthNumStr}/${yearNumStr}`;

            const totalConfCount = confTitulares.length + confReservas.length;
            const quorumMet = !dynamicMode && totalConfCount >= quorum;

            let rowBg, borderCol, quorumBadge, alertsHtml = "";
            if (dynamicMode) {
                // Evento dinâmico: só informa data + confirmados. Sem alertas de quorum/banco/atrasos.
                rowBg = "rgba(99, 102, 241, 0.1)";
                borderCol = "var(--gold-bright)";
                quorumBadge = `<span style="font-size:0.78rem;font-weight:700;color:var(--gold-bright);">${totalConfCount} confirmado(s)</span>`;
            } else {
                rowBg    = quorumMet ? "rgba(16, 185, 129, 0.1)" : "rgba(245, 158, 11, 0.1)";
                borderCol = quorumMet ? "var(--color-avail)"      : "var(--color-late)";
                quorumBadge = `<span style="font-size:0.78rem;font-weight:700;color:${quorumMet ? 'var(--color-avail)' : 'var(--color-late)'};">${totalConfCount}/${quorum}</span>`;

                if (quorumMet) {
                    alertsHtml += `<div style="background: var(--color-avail); color: #fff; font-size: 0.75rem; padding: 2px 8px; border-radius: 4px; font-weight: bold; display: inline-block;">Quorum atingido</div>`;
                } else {
                    const faltam = quorum - totalConfCount;
                    if (faltam > 0) {
                        alertsHtml += `<div style="background: var(--color-late); color: #000; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: bold; margin-bottom: 4px;">Faltam ${faltam} confirmação(ões) para o quorum</div>`;
                    }
                }
                const lateAll = [...lateTitulares, ...lateReservas];
                if (lateAll.length > 0) {
                    alertsHtml += `<div style="background: rgba(234,179,8,0.2); border: 1px solid var(--color-late); color: var(--gold-bright); font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: bold; margin-top: 4px;">Status incerto (Talvez) — não confirmados: ${lateAll.join(", ")}</div>`;
                }
                if (confReservas.length > 0) {
                    alertsHtml += `<div style="background: rgba(59,130,246,0.2); border: 1px solid #3b82f6; color: #93c5fd; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: bold; margin-top: 4px;">Banco disponível: ${confReservas.join(", ")}</div>`;
                }
                // Fase P — só officer/admin vê a lista de incompatíveis (jogadores
                // marcaram avail mas a expansão atual ou level do Limited não atende).
                const incompatAll = [...incompatTitulares, ...incompatReservas];
                if (incompatAll.length > 0 && isOfficer()) {
                    alertsHtml += `<div style="background: rgba(148,163,184,0.15); border: 1px solid #94a3b8; color: #cbd5e1; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: bold; margin-top: 4px;" title="Marcaram disponibilidade mas não atendem aos requisitos do evento (expansão ou level do Limited).">Disponíveis mas fora dos requisitos: ${incompatAll.join(", ")}</div>`;
                }
            }

            const postponedNote = raidEvt && raidEvt.postponedTo
                ? `<span style="font-size:0.72rem;color:var(--color-late);margin-left:6px;">(Adiado)</span>` : "";

            // Em modo dynamic, todos os confirmados aparecem juntos (sem split Titular/Reserva).
            const allConfirmed = [...confTitulares, ...confReservas];
            const nicksListHtml = dynamicMode
                ? `
                <div style="font-size: 0.8rem; color: var(--text-main); margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px;">
                    <span style="color: var(--text-muted);">Confirmados:</span>
                    <span style="color: var(--gold-bright); font-weight: 600;">${allConfirmed.join(", ") || "Nenhuma confirmação ainda"}</span>
                </div>
            `
                : `
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
                        <span style="font-weight: 600; font-size: 0.9rem;">Proxima Sessao: ${dateFormatted}${postponedNote}${
                            foundEvt && foundEvt.time
                                ? ` <span style="color:var(--gold-bright);">· ${foundEvt.time}</span>`
                                : foundEvt
                                    ? ` <span class="badge-no-time" title="Officer ainda não definiu o horário">Horário a definir</span>`
                                    : ""
                        }</span>
                        ${quorumBadge}
                    </div>
                    <div style="margin-top: 2px;">${alertsHtml}</div>
                    ${nicksListHtml}
                </div>
            `;
        } else {
            const noEvtMsg = raidEvt
                ? `Evento agendado para ${(raidEvt.postponedTo || raidEvt.date).split("-").reverse().join("/")} — sem confirmações ainda.`
                : "Nenhuma data agendada para este conteúdo.";
            const quickSchedFormHtml = (!raidEvt && isOfficer())
                ? `<div style="display:flex;gap:6px;align-items:center;margin-top:8px;">
                       <input type="text" class="ff-input inp-quick-sched-date" placeholder="DD/MM/AAAA" maxlength="10" inputmode="numeric" style="flex:1;font-size:0.82rem;padding:5px 8px;">
                       <button class="ff-btn-action btn-quick-sched-open" style="font-size:0.82rem;padding:5px 10px;">Agendar</button>
                   </div>`
                : "";
            raidBlock.innerHTML = `
                ${headerHtml}
                <div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">${noEvtMsg}</div>
                ${quickSchedFormHtml}
            `;
        }

        container.appendChild(raidBlock);

        // Bind do mini-form de agendamento (apenas quando sem evento)
        const quickDateInput = raidBlock.querySelector(".inp-quick-sched-date");
        const quickSchedBtn  = raidBlock.querySelector(".btn-quick-sched-open");
        if (quickDateInput && quickSchedBtn) {
            quickDateInput.addEventListener("input", e => {
                let v = e.target.value.replace(/\D/g, '').slice(0, 8);
                if (v.length > 4) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4);
                else if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
                e.target.value = v;
            });
            quickSchedBtn.addEventListener("click", () => {
                const parts = quickDateInput.value.trim().split("/");
                if (parts.length !== 3 || parts[2].length !== 4) {
                    quickDateInput.style.borderColor = "var(--color-late)";
                    setTimeout(() => { quickDateInput.style.borderColor = ""; }, 1500);
                    return;
                }
                const dateKey2 = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
                playSfx('click');
                openScheduleModal(dateKey2, progId);
            });
        }
    });

    // Bind dos botões "Detalhes" — todos delegados via classe
    container.querySelectorAll(".btn-event-details-open").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const dk = btn.getAttribute("data-date");
            if (dk) openEventDetailsModal(dk);
        });
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

        const canEditLoot = canEditPlayer(targetMember);
        const lootDisabledAttr = canEditLoot ? '' : 'disabled';

        const buildSlotRowHtml = (slot) => {
            const currPref = getLootPref(targetMember, activeProgId, slot.id);
            const iconHtml = slot.iconUrl
                ? `<img class="gear-row-icon-img" src="${slot.iconUrl}" alt="${slot.itemName || slot.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"><span class="gear-row-icon-fallback" style="display:none;">${slot.icon}</span>`
                : `<span class="gear-row-icon-fallback" style="display:flex;">${slot.icon}</span>`;
            return `
                <div class="gear-slot-row" data-slot="${slot.id}">
                    <div class="gear-row-icon-wrap">${iconHtml}</div>
                    <div class="gear-row-body">
                        <span class="gear-row-slotname">${slot.name}</span>
                        <div class="loot-pref-controls">
                            <button type="button" class="btn-loot-pref need ${currPref === 'need' ? 'active' : ''}" title="Need (Necessidade)" data-pref="need" data-slot="${slot.id}" ${lootDisabledAttr}>🎲</button>
                            <button type="button" class="btn-loot-pref greed ${currPref === 'greed' ? 'active' : ''}" title="Greed (Cobiça)" data-pref="greed" data-slot="${slot.id}" ${lootDisabledAttr}>🪙</button>
                            <button type="button" class="btn-loot-pref pass ${currPref === 'pass' ? 'active' : ''}" title="Pass (Passar)" data-pref="pass" data-slot="${slot.id}" ${lootDisabledAttr}>❌</button>
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

    const canReorder = canManageContent();
    let draggedId = null;

    priorityOrder.forEach((memberId, idx) => {
        const player = state.roster.find(p => p.id === memberId);
        if (!player) return;

        const assignedJob = getAssignedJobForProg(player, activeProgId);
        const row = document.createElement("div");
        row.className = `priority-row rank-${idx + 1}`;
        if (canReorder) {
            row.draggable = true;
            row.dataset.id = player.id;
        }
        row.innerHTML = `
            <span class="priority-rank">${idx + 1}</span>
            <span class="priority-name" title="${player.name || 'Sem Nick'}">${player.name || '<em>Sem Nick</em>'}</span>
            <span class="priority-job-sigla">${assignedJob}</span>
            ${canReorder ? '<span class="priority-drag-handle" title="Arraste para reordenar">⠿</span>' : ''}
        `;
        priorityCont.appendChild(row);
    });

    if (canReorder) {
        priorityCont.querySelectorAll(".priority-row[draggable]").forEach(row => {
            row.addEventListener("dragstart", e => {
                draggedId = row.dataset.id;
                row.classList.add("dragging");
                e.dataTransfer.effectAllowed = "move";
            });

            row.addEventListener("dragend", () => {
                draggedId = null;
                row.classList.remove("dragging");
                priorityCont.querySelectorAll(".priority-row").forEach(r => r.classList.remove("drag-over"));
            });

            row.addEventListener("dragover", e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (row.dataset.id === draggedId) return;
                priorityCont.querySelectorAll(".priority-row").forEach(r => r.classList.remove("drag-over"));
                row.classList.add("drag-over");
            });

            row.addEventListener("dragleave", () => {
                row.classList.remove("drag-over");
            });

            row.addEventListener("drop", e => {
                e.preventDefault();
                row.classList.remove("drag-over");
                if (!draggedId || row.dataset.id === draggedId) return;

                const list = syncLootPriorityWithActiveRoster(activeProgId);
                const fromIdx = list.indexOf(draggedId);
                const toIdx   = list.indexOf(row.dataset.id);
                if (fromIdx === -1 || toIdx === -1) return;

                list.splice(fromIdx, 1);
                list.splice(toIdx, 0, draggedId);
                state.lootPriorities[activeProgId] = list;

                playSfx('success');
                saveState();
                renderFightSummaryAndPriorities();
            });
        });
    }
}

function updateDashboardStats() {
    const activeProgId = state.inspectedProgId || "geral";
    const titulares = state.roster.filter(p => getPlayerStatusForProg(p, activeProgId) === "active");
    const reservas = state.roster.filter(p => getPlayerStatusForProg(p, activeProgId) === "bench");
    
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
// Modal de Gerenciamento de Membros (apenas admin)
// ==========================================================================
let cachedMembers = [];

async function openMembersModal() {
    if (!canManageRoles()) return;
    if (!currentStaticId) return;
    const modal = document.getElementById("modal-members");
    const errEl = document.getElementById("members-error");
    const cont = document.getElementById("members-list-container");
    if (!modal || !cont) return;

    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
    cont.innerHTML = `<div style="color:var(--text-muted); padding:14px; text-align:center;">Carregando membros...</div>`;
    modal.hidden = false;
    playSfx('tab');

    try {
        cachedMembers = await API.listMembers(currentStaticId);
        renderMembersList();
        if (isOfficer()) await renderPendingSection(cont);
        renderTelegramSection();
    } catch (err) {
        cont.innerHTML = "";
        if (errEl) {
            errEl.textContent = `Falha ao carregar membros: ${err.message || err.status}`;
            errEl.hidden = false;
        }
    }
}

function closeMembersModal() {
    const modal = document.getElementById("modal-members");
    if (modal) modal.hidden = true;
}

// Fase 12 — Seção Telegram no modal admin
async function renderTelegramSection() {
    const section = document.getElementById("telegram-section");
    const statusBox = document.getElementById("telegram-status-box");
    const statusText = document.getElementById("telegram-status-text");
    const instructions = document.getElementById("telegram-instructions");
    const btnUnbind = document.getElementById("btn-telegram-unbind");
    if (!section || !statusBox || !statusText) return;

    // Apenas admin vê a seção
    if (!isAdmin()) {
        section.hidden = true;
        return;
    }
    section.hidden = false;
    statusText.textContent = "Carregando...";
    if (instructions) instructions.hidden = true;
    if (btnUnbind) btnUnbind.hidden = true;

    try {
        const status = await API.telegramStatus();
        if (!status.configured) {
            statusText.innerHTML = "<span style='color: var(--danger, #c33);'>Bot não configurado no servidor.</span> Defina <code>TELEGRAM_BOT_TOKEN</code> nas variáveis de ambiente.";
            return;
        }
        if (status.bound) {
            statusText.innerHTML = `<span style='color: var(--success, #4a9);'>Vinculado</span> ao grupo (chat_id: <code>${status.chat_id}</code>)`;
            if (btnUnbind) btnUnbind.hidden = false;
        } else {
            statusText.innerHTML = "<span style='color: var(--text-muted);'>Nenhum grupo vinculado.</span>";
            if (instructions) instructions.hidden = false;
        }
    } catch (err) {
        statusText.textContent = `Erro: ${err.message || "falha ao consultar status"}`;
    }
}

async function unbindTelegramGroup() {
    if (!isAdmin()) return;
    const ok = await showConfirm({
        title: "Desvincular grupo do Telegram?",
        message: "Os alertas de raid não serão mais enviados até que um novo grupo seja vinculado.",
        confirmText: "Desvincular",
        danger: true,
    });
    if (!ok) return;
    try {
        await API.telegramUnbind();
        showToast("Grupo desvinculado.", { type: "info" });
        await renderTelegramSection();
    } catch (err) {
        showToast(`Erro: ${err.message || "falha ao desvincular"}`, { type: "error" });
    }
}

// ==========================================================================
// Modal de Gerenciamento de Conteúdos Customizados (Fase 8)
// ==========================================================================

function openContentManagerModal() {
    if (!canManageContent()) return;
    const modal = document.getElementById("modal-content-manager");
    if (!modal) return;
    const errEl = document.getElementById("cc-form-error");
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
    // Limpa o form
    const nameEl = document.getElementById("inp-cc-name");
    const selEl  = document.getElementById("sel-cc-expansion");
    if (nameEl) nameEl.value = "";
    if (selEl)  selEl.value  = "";
    const fullRadio = modal.querySelector('input[name="cc-party-mode"][value="full"]');
    if (fullRadio) fullRadio.checked = true;
    const qEl = document.getElementById("inp-cc-dynamic-quorum");
    if (qEl) qEl.value = "";
    const qGroup = document.getElementById("cc-dynamic-quorum-group");
    if (qGroup) qGroup.hidden = true;
    // Fecha o form inline de nova expansão (se ficou aberto da última vez)
    const inline = document.getElementById("cc-new-expansion-inline");
    if (inline) inline.hidden = true;
    renderExpansionDropdown();
    renderContentManagerList();
    renderExpansionManagerList();
    modal.hidden = false;
    playSfx('tab');
}

function closeContentManagerModal() {
    const modal = document.getElementById("modal-content-manager");
    if (modal) modal.hidden = true;
}

function renderContentManagerList() {
    const cont = document.getElementById("content-manager-list");
    if (!cont) return;
    const list = Array.isArray(state.customContents) ? state.customContents : [];
    cont.innerHTML = "";
    if (list.length === 0) {
        cont.innerHTML = `<div class="content-manager-empty">Nenhum conteúdo customizado cadastrado ainda.</div>`;
        return;
    }
    const modeLabel = { full: "Full Party", light: "Light Party", dynamic: "Dynamic" };
    list.forEach(c => {
        const mode = (c.partyMode === "light" || c.partyMode === "dynamic") ? c.partyMode : "full";
        const partySize = mode === "light" ? 4 : 8;
        const sizeLbl = mode === "dynamic"
            ? `até ${partySize}${Number.isFinite(c.quorum) && c.quorum > 0 ? ` · quórum ${c.quorum}` : ''}`
            : String(partySize);
        const inUse = (state.activeProgs || []).includes(c.id);
        const row = document.createElement("div");
        row.className = `content-manager-row mode-${mode}${inUse ? ' in-use' : ''}`;
        row.innerHTML = `
            <div class="content-manager-row-info">
                <span class="content-manager-row-name">${escapeHtml(c.name || c.id)}</span>
                <div class="content-manager-row-meta">
                    <span class="pill mode-${mode}">${modeLabel[mode]} · ${sizeLbl}</span>
                    ${(() => { const ex = getExpansionDisplayName(c); return ex ? `<span>${escapeHtml(ex)}</span>` : ''; })()}
                    ${inUse ? `<span style="color: var(--color-avail);">Em uso</span>` : ''}
                </div>
            </div>
            <button class="ff-btn-small btn-cc-delete" data-id="${c.id}" title="Remover conteúdo">
                <img src="assets/icons/dictionary/exit_game.png" alt="Remover" style="width:18px;height:18px;">
            </button>
        `;
        cont.appendChild(row);
    });

    cont.querySelectorAll(".btn-cc-delete").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.id;
            const c = (state.customContents || []).find(x => x.id === id);
            if (!c) return;
            const inUse = (state.activeProgs || []).includes(id);
            const ok = await showConfirm({
                title: "Remover conteúdo",
                message: `Deseja remover o conteúdo "${c.name}"?`,
                detail: inUse
                    ? "Este conteúdo está ativo. Ao remover, ele também será desativado e o agendamento futuro será apagado."
                    : "Esta ação não pode ser desfeita.",
                danger: true,
                confirmText: "Remover",
            });
            if (!ok) return;
            state.customContents = (state.customContents || []).filter(x => x.id !== id);
            state.activeProgs    = (state.activeProgs || []).filter(pid => pid !== id);
            state.raidEvents     = (state.raidEvents || []).filter(e => e.progId !== id);
            state.pendingNotifications = (state.pendingNotifications || []).filter(n => n.progId !== id);
            if (state.inspectedProgId === id) {
                state.inspectedProgId = state.activeProgs[0] || "geral";
            }
            saveState();
            renderContentManagerList();
            renderActiveProgsPanel();
            renderProgTabsBar();
            renderRosterTables();
            playSfx('click');
        });
    });
}

function handleCreateCustomContent() {
    const errEl = document.getElementById("cc-form-error");
    const showErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }

    const nameEl = document.getElementById("inp-cc-name");
    const selEl  = document.getElementById("sel-cc-expansion");
    const modeEl = document.querySelector('input[name="cc-party-mode"]:checked');

    const name = (nameEl?.value || "").trim();
    const expansionId = (selEl?.value || "").trim();
    const partyMode = modeEl?.value || "full";

    if (!name) { showErr("Informe um nome para o conteúdo."); return; }
    if (name.length > 80) { showErr("Nome muito longo (máx 80 caracteres)."); return; }
    if (!["full", "light", "dynamic"].includes(partyMode)) { showErr("Modo de party inválido."); return; }
    if (expansionId === "__new__") { showErr("Confirme a nova expansão antes de adicionar o conteúdo."); return; }

    let dynamicQuorum = null;
    if (partyMode === "dynamic") {
        const qEl = document.getElementById("inp-cc-dynamic-quorum");
        const qVal = parseInt(qEl?.value || "", 10);
        if (!Number.isFinite(qVal) || qVal < 1 || qVal > 48) {
            showErr("Informe um quórum válido (1-48) para o modo Dynamic.");
            if (qEl) qEl.focus();
            return;
        }
        dynamicQuorum = qVal;
    }

    // Gera id determinístico e único
    let baseId = "custom_" + (name.toLowerCase()
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "custom");
    let id = baseId;
    const existingIds = new Set([
        ...FFXIV_RAIDS.map(r => r.id),
        ...FFXIV_ULTIMATES.map(u => u.id),
        ...(state.customContents || []).map(c => c.id),
    ]);
    let suffix = 1;
    while (existingIds.has(id)) {
        id = `${baseId}_${suffix++}`;
    }

    const newContent = { id, name, partyMode };
    if (expansionId) newContent.expansionId = expansionId;
    if (dynamicQuorum !== null) newContent.quorum = dynamicQuorum;

    if (!Array.isArray(state.customContents)) state.customContents = [];
    state.customContents.push(newContent);
    saveState();

    if (nameEl) nameEl.value = "";
    if (selEl)  selEl.value  = "";
    const fullRadio = document.querySelector('input[name="cc-party-mode"][value="full"]');
    if (fullRadio) fullRadio.checked = true;
    const qEl = document.getElementById("inp-cc-dynamic-quorum");
    if (qEl) qEl.value = "";
    const qGroup = document.getElementById("cc-dynamic-quorum-group");
    if (qGroup) qGroup.hidden = true;

    renderContentManagerList();
    renderActiveProgsPanel();
    playSfx('success');
    showToast(`Conteúdo "${name}" criado.`, { type: "success", title: "Conteúdo adicionado" });
}

// ============================================================================
// Fase N — UI do catálogo de expansões
// ============================================================================

function renderExpansionDropdown() {
    const sel = document.getElementById("sel-cc-expansion");
    if (!sel) return;
    const list = (state.expansions || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    const prev = sel.value;
    sel.innerHTML = "";
    const optBlank = document.createElement("option");
    optBlank.value = "";
    optBlank.textContent = "— Selecione —";
    sel.appendChild(optBlank);
    list.forEach(exp => {
        const o = document.createElement("option");
        o.value = exp.id;
        const cap = exp.levelCap ? ` (lvl ${exp.levelCap})` : "";
        o.textContent = `${exp.name}${cap}`;
        sel.appendChild(o);
    });
    const optNew = document.createElement("option");
    optNew.value = "__new__";
    optNew.textContent = "+ Nova expansão…";
    sel.appendChild(optNew);
    if (prev && Array.from(sel.options).some(o => o.value === prev)) {
        sel.value = prev;
    }
}

function handleNewExpansionInline() {
    const errEl = document.getElementById("new-exp-error");
    const showErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.hidden = false; } };
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }

    const nameEl = document.getElementById("inp-new-exp-name");
    const capEl  = document.getElementById("inp-new-exp-levelcap");
    const name = (nameEl?.value || "").trim();
    const capRaw = (capEl?.value || "").trim();

    if (!name) { showErr("Informe o nome da expansão."); return; }
    if (name.length > 40) { showErr("Nome muito longo (máx 40 caracteres)."); return; }
    const norm = normalizeExpansionName(name);
    const exists = (state.expansions || []).some(e => normalizeExpansionName(e.name) === norm);
    if (exists) { showErr("Já existe uma expansão com esse nome."); return; }

    let levelCap = null;
    if (capRaw !== "") {
        const n = parseInt(capRaw, 10);
        if (!Number.isFinite(n) || n <= 0) { showErr("Level cap deve ser um número positivo."); return; }
        levelCap = n;
    }

    const baseId = norm.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "exp";
    let id = baseId;
    let suffix = 1;
    const idsExist = new Set((state.expansions || []).map(e => e.id));
    while (idsExist.has(id)) id = `${baseId}_${suffix++}`;

    // Nova expansão entra logo após a última normal; Limited(s) são empurradas
    // sempre para o final da lista.
    const nonLimited = (state.expansions || []).filter(e => !e.isLimited);
    const maxNonLimited = nonLimited.reduce((m, e) => Math.max(m, e.order || 0), 0);
    const newOrder = maxNonLimited + 1;
    const newExp = { id, name, levelCap, order: newOrder };
    state.expansions.push(newExp);
    (state.expansions || [])
        .filter(e => e.isLimited)
        .forEach((e, i) => { e.order = newOrder + 100 + i; });
    saveState();

    renderExpansionDropdown();
    renderExpansionManagerList();
    const sel = document.getElementById("sel-cc-expansion");
    if (sel) sel.value = id;

    if (nameEl) nameEl.value = "";
    if (capEl) capEl.value = "";
    const inline = document.getElementById("cc-new-expansion-inline");
    if (inline) inline.hidden = true;
    playSfx('success');
    showToast(`Expansão "${name}" adicionada.`, { type: "success", title: "Expansão criada" });
}

function renderExpansionManagerList() {
    const cont = document.getElementById("expansion-manager-list");
    if (!cont) return;
    const list = (state.expansions || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    cont.innerHTML = "";
    if (list.length === 0) {
        cont.innerHTML = `<div class="content-manager-empty">Nenhuma expansão cadastrada.</div>`;
        return;
    }
    // Contar conteúdos vinculados a cada expansão
    const allContents = [...FFXIV_RAIDS, ...FFXIV_ULTIMATES, ...FFXIV_LIMITED_CONTENTS, ...(state.customContents || [])];
    const usageById = {};
    allContents.forEach(c => {
        const expId = resolveContentExpansionId(c);
        if (expId) usageById[expId] = (usageById[expId] || 0) + 1;
    });

    list.forEach(exp => {
        const usage = usageById[exp.id] || 0;
        const row = document.createElement("div");
        row.className = "content-manager-row";
        row.innerHTML = `
            <div class="content-manager-row-info">
                <span class="content-manager-row-name">${escapeHtml(exp.name)}</span>
                <div class="content-manager-row-meta" style="gap: 10px; align-items: center;">
                    <label style="font-size:0.8rem; color: var(--text-muted);">Level cap:</label>
                    <input type="number" class="ff-input exp-levelcap-input" data-id="${exp.id}"
                           value="${exp.levelCap ?? ''}" min="1" max="999"
                           placeholder="${exp.isLimited ? '—' : ''}"
                           style="width: 80px; padding: 4px 8px; font-size: 0.85rem;"
                           ${exp.isLimited ? 'disabled title="Limited Jobs não têm level cap"' : ''}>
                    <span style="font-size:0.75rem; color: var(--text-muted);">
                        ${usage} conteúdo${usage === 1 ? '' : 's'} vinculado${usage === 1 ? '' : 's'}
                    </span>
                </div>
            </div>
            <div style="display:flex; gap:6px;">
                <button class="ff-btn-small btn-exp-save" data-id="${exp.id}" ${exp.isLimited ? 'disabled' : ''}>Salvar</button>
                <button class="ff-btn-small btn-exp-delete" data-id="${exp.id}" ${(usage > 0 || exp.isLimited) ? 'disabled' : ''}
                        title="${exp.isLimited ? 'Não é possível remover Limited Job' : (usage > 0 ? 'Não é possível remover: há conteúdos vinculados' : 'Remover expansão')}">
                    <img src="assets/icons/dictionary/exit_game.png" alt="Remover" style="width:16px;height:16px;">
                </button>
            </div>
        `;
        cont.appendChild(row);
    });

    cont.querySelectorAll(".btn-exp-save").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            const inp = cont.querySelector(`.exp-levelcap-input[data-id="${id}"]`);
            if (!inp) return;
            const exp = (state.expansions || []).find(e => e.id === id);
            if (!exp) return;
            const raw = (inp.value || "").trim();
            let newCap = null;
            if (raw !== "") {
                const n = parseInt(raw, 10);
                if (!Number.isFinite(n) || n <= 0) {
                    showToast("Level cap deve ser positivo.", { type: "error", title: "Valor inválido" });
                    return;
                }
                newCap = n;
            }
            exp.levelCap = newCap;
            saveState();
            playSfx('click');
            showToast(`Level cap atualizado para ${exp.name}.`, { type: "success" });
        });
    });

    cont.querySelectorAll(".btn-exp-delete").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = btn.dataset.id;
            const exp = (state.expansions || []).find(e => e.id === id);
            if (!exp) return;
            const ok = await showConfirm({
                title: "Remover expansão",
                message: `Remover a expansão "${exp.name}"?`,
                detail: "Esta ação não pode ser desfeita.",
                danger: true,
                confirmText: "Remover",
            });
            if (!ok) return;
            state.expansions = (state.expansions || []).filter(e => e.id !== id);
            saveState();
            renderExpansionDropdown();
            renderExpansionManagerList();
            playSfx('click');
        });
    });
}

// Escape simples para conteúdo dinâmico em innerHTML
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
}

async function refreshPendingBadge() {
    const badge = document.getElementById("pending-badge");
    if (!badge || !isOfficer()) return;
    try {
        const list = await API.listPending();
        if (list.length > 0) {
            badge.textContent = list.length;
            badge.hidden = false;
        } else {
            badge.hidden = true;
        }
    } catch (_) {
        badge.hidden = true;
    }
}

async function renderPendingSection(cont) {
    let pending = [];
    try { pending = await API.listPending(); } catch (_) { return; }
    if (pending.length === 0) return;

    const section = document.createElement("div");
    section.className = "pending-section";
    section.innerHTML = `<div class="pending-section-title">Solicitacoes Pendentes (${pending.length})</div>`;

    pending.forEach(p => {
        const row = document.createElement("div");
        row.className = "pending-row";
        row.dataset.id = p.id;
        const age = p.hours_ago <= 0 ? "agora mesmo" : `${p.hours_ago}h atrás`;
        row.innerHTML = `
            <div>
                <span class="pending-username">${p.username}</span>
                <span class="pending-age">${age}</span>
            </div>
            <div class="pending-actions">
                <button class="ff-btn-action pending-approve" data-id="${p.id}" data-name="${p.username}">Aprovar</button>
                <button class="ff-btn-small pending-reject" data-id="${p.id}" data-name="${p.username}">Rejeitar</button>
            </div>
        `;
        section.appendChild(row);
    });

    cont.prepend(section);

    section.querySelectorAll(".pending-approve").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = parseInt(btn.dataset.id);
            const name = btn.dataset.name;
            try {
                await API.approvePending(id);
                playSfx('success');
                showToast(`${name} aprovado e adicionado como membro.`, { type: "success", title: "Aprovado" });
                refreshPendingBadge();
                btn.closest(".pending-row").remove();
                if (!section.querySelector(".pending-row")) section.remove();
            } catch (err) {
                showToast(err.message, { type: "error" });
            }
        });
    });

    section.querySelectorAll(".pending-reject").forEach(btn => {
        btn.addEventListener("click", async () => {
            const id = parseInt(btn.dataset.id);
            const name = btn.dataset.name;
            try {
                await API.rejectPending(id);
                playSfx('click');
                showToast(`Solicitação de ${name} rejeitada.`, { type: "info", title: "Rejeitado" });
                refreshPendingBadge();
                btn.closest(".pending-row").remove();
                if (!section.querySelector(".pending-row")) section.remove();
            } catch (err) {
                showToast(err.message, { type: "error" });
            }
        });
    });
}

function renderMembersList() {
    const cont = document.getElementById("members-list-container");
    if (!cont) return;
    cont.innerHTML = "";

    const totalAdmins = cachedMembers.filter(x => x.role === "admin").length;

    cachedMembers.forEach(m => {
        const isSelf = m.id === currentUserId;
        const isLastAdmin = m.role === "admin" && totalAdmins === 1;
        const row = document.createElement("div");
        row.className = "member-row";

        const selectDisabled = isSelf && isLastAdmin
            ? `disabled title="Não é possível rebaixar o último administrador"`
            : "";

        // Botão de excluir conta:
        // - Desabilitado se for o próprio admin (não pode auto-deletar)
        // - Desabilitado se for o último admin
        const removeDisabled = (isSelf || isLastAdmin) ? "disabled" : "";
        let removeTitle = `Excluir a conta de ${m.username} permanentemente`;
        if (isSelf)            removeTitle = "Você não pode excluir a própria conta";
        else if (isLastAdmin)  removeTitle = "Não é possível excluir o último administrador";

        row.innerHTML = `
            <div>
                <span class="member-row-name">${m.username}${isSelf ? '<span class="you-tag">(você)</span>' : ''}</span>
                <div class="member-row-joined">Entrou em: ${(m.joined_at || '').slice(0, 10)}</div>
            </div>
            <select class="member-role-select" data-uid="${m.id}" ${selectDisabled}>
                <option value="admin"   ${m.role === 'admin'   ? 'selected' : ''}>Administrador</option>
                <option value="officer" ${m.role === 'officer' ? 'selected' : ''}>Officer</option>
                <option value="member"  ${m.role === 'member'  ? 'selected' : ''}>Membro</option>
            </select>
            <button type="button" class="btn-member-remove" data-uid="${m.id}" data-username="${m.username}" title="${removeTitle}" ${removeDisabled}>
                <img src="assets/icons/dictionary/exit_game.png" alt="Excluir" style="width:24px;height:24px;display:block;">
            </button>
        `;
        cont.appendChild(row);
    });

    cont.querySelectorAll(".member-role-select").forEach(sel => {
        sel.addEventListener("change", async (e) => {
            const uid = parseInt(e.target.dataset.uid);
            const newRole = e.target.value;
            const errEl = document.getElementById("members-error");
            try {
                await API.setMemberRole(currentStaticId, uid, newRole);
                const m = cachedMembers.find(x => x.id === uid);
                if (m) m.role = newRole;
                if (uid === currentUserId) {
                    currentUserRole = newRole;
                    updateUserPill();
                    renderAllAfterLoad();
                }
                playSfx('success');
                renderMembersList();
            } catch (err) {
                if (errEl) {
                    errEl.textContent = err.data?.error === "cannot_demote_last_admin"
                        ? "Não é possível rebaixar o último administrador da static."
                        : `Falha ao atualizar cargo: ${err.message || err.status}`;
                    errEl.hidden = false;
                }
                const m = cachedMembers.find(x => x.id === uid);
                if (m) e.target.value = m.role;
            }
        });
    });

    cont.querySelectorAll(".btn-member-remove").forEach(btn => {
        btn.addEventListener("click", async () => {
            const uid = parseInt(btn.dataset.uid);
            const username = btn.dataset.username || "este usuário";

            const confirmed = await showConfirm({
                title: "Excluir Conta",
                message: `Excluir permanentemente a conta de ${username}?`,
                detail: "A conta é apagada do banco de dados. O slot do roster vinculado a essa conta é preservado mas perde o vínculo (vira disponível para qualquer um reivindicar). Esta ação não pode ser desfeita.",
                confirmText: "Excluir Conta",
                danger: true,
            });
            if (!confirmed) return;

            const errEl = document.getElementById("members-error");
            try {
                await API.removeMember(currentStaticId, uid);
                playSfx('success');

                cachedMembers = cachedMembers.filter(x => x.id !== uid);
                showToast(`Conta de ${username} excluída.`, { type: "success", title: "Conta removida" });
                renderMembersList();
                // Recarrega o estado para refletir o slot orfanizado
                await bootstrapAfterAuth();
                // Reabre o modal para o admin continuar trabalhando
                openMembersModal();
            } catch (err) {
                const code = err.data?.error;
                let msg;
                if (code === "cannot_remove_last_admin") {
                    msg = "Não é possível excluir o último administrador da static.";
                } else if (code === "cannot_delete_self") {
                    msg = "Você não pode excluir a própria conta.";
                } else {
                    msg = `Falha ao excluir conta: ${err.message || err.status}`;
                }
                if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
                showToast(msg, { type: "error" });
            }
        });
    });
}

// ==========================================================================
// Fluxo de Autenticação e Modais
// ==========================================================================
function showAuthModal(errMsg) {
    const m = document.getElementById("modal-auth");
    const e = document.getElementById("auth-error");
    if (m) m.hidden = false;
    if (e) {
        if (errMsg) { e.textContent = errMsg; e.hidden = false; }
        else { e.hidden = true; e.textContent = ""; }
    }
    const ms = document.getElementById("modal-static");
    if (ms) ms.hidden = true;
}

function hideAuthModal() {
    const m = document.getElementById("modal-auth");
    if (m) m.hidden = true;
}

function updateUserPill() {
    const pill = document.getElementById("user-pill");
    const nameEl = document.getElementById("user-pill-name");
    const roleEl = document.getElementById("user-pill-role");
    if (!pill) return;
    if (currentUser) {
        pill.hidden = false;
        if (nameEl) nameEl.textContent = currentUser.username;
        if (roleEl) {
            roleEl.textContent = roleLabel(currentUserRole);
            roleEl.className = `user-pill-role role-${currentUserRole || 'none'}`;
            roleEl.hidden = !currentUserRole;
        }
    } else {
        pill.hidden = true;
    }

    // Mostra/esconde botão admin de gerenciar membros
    const btnManage = document.getElementById("btn-manage-members");
    if (btnManage) btnManage.hidden = !canManageRoles();

    // Mostra/esconde botão de gerenciar conteúdos customizados (officer+)
    const btnContents = document.getElementById("btn-manage-contents");
    if (btnContents) btnContents.hidden = !canManageContent();

    // Mostra/esconde botão de "Limpar Todos" baseado em admin
    const btnResetRoster = document.getElementById("btn-reset-roster");
    if (btnResetRoster) btnResetRoster.hidden = !canManageStatic();
}

async function bootstrapAfterAuth() {
    const result = await loadState();
    if (result === "needs_login") {
        stopPolling();
        showAuthModal();
        return;
    }
    if (result !== "loaded") {
        stopPolling();
        showAuthModal("Erro ao carregar dados. Tente entrar novamente.");
        return;
    }
    hideAuthModal();
    updateUserPill();
    await loadCharacter();
    renderAllAfterLoad();
    startPolling();
}

function renderAllAfterLoad() {
    renderActiveProgsPanel();
    renderProgTabsBar();
    renderRosterTables();
    renderEquipmentPanel();
    renderCharacterTab();

    const btnSoundToggle = document.getElementById("btn-sound-toggle");
    if (btnSoundToggle) btnSoundToggle.classList.toggle("active", localSfxEnabled);
}

// ==========================================================================
// Controladores de Eventos Iniciais
// ==========================================================================
document.addEventListener("DOMContentLoaded", async () => {
    // Inicializa o estado vazio para que renderizadores não quebrem antes do load
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));

    // Tenta verificar sessão antes de tudo
    try {
        currentUser = await API.me();
    } catch (err) {
        currentUser = null;
    }

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
                showToast("Informe o nome ou nick in-game do jogador.", { type: "warning" });
                if (nameInp) nameInp.focus();
                return;
            }

            // Permissão: membros só podem criar o próprio slot (e só um)
            const isOfficerPlus = isOfficer();
            if (!isOfficerPlus) {
                if (!isMember()) {
                    showToast("Você precisa estar logado para adicionar um jogador.", { type: "warning" });
                    return;
                }
                if (hasOwnSlot()) {
                    showToast("Você já tem um slot de jogador cadastrado. Edite-o em vez de criar outro.", { type: "warning", title: "Slot já existe" });
                    return;
                }
            }

            const checkedProfiles = Array.from(document.querySelectorAll(".chk-flex-profile:checked")).map(chk => chk.value);

            if (checkedProfiles.length === 0) {
                showToast("Selecione pelo menos um perfil flex ou o modo Específico.", { type: "warning" });
                return;
            }

            const activeProgId = state.inspectedProgId || "geral";
            let finalStatusForProg = statusVal;

            if (statusVal === "active") {
                const activeCount = state.roster.filter(p => getPlayerStatusForProg(p, activeProgId) === "active").length;
                const partySize = getPartySize(activeProgId);
                // Modo dynamic: sem cap, jogador novo entra direto como ativo.
                if (!isDynamicProg(activeProgId) && activeCount >= partySize) {
                    const label = getPartyMode(activeProgId) === "light" ? "Light Party" : "Party Principal";
                    showToast(`${label} já está completa com ${partySize} jogadores. O novo jogador entrará como Reserva neste conteúdo.`, { type: "warning", title: "Party Cheia" });
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

            let jobsPool = sortJobsCanonical(new Set(mergedPool));

            if (jobsPool.length === 0) {
                showToast("Nenhuma classe resultante na Pool. Selecione pelo menos uma classe avulsa ou perfil predefinido.", { type: "warning" });
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

            // Member: o slot criado é vinculado à sua conta automaticamente.
            // Officer+: cria slot livre (sem user_id) — pode vincular depois manualmente.
            const linkedUserId = isOfficerPlus ? null : currentUserId;

            state.roster.push({
                id: "mem_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
                user_id: linkedUserId,
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

    // Fase 3 — Botão de fechar o picker de conteúdo
    const btnPickerClose = document.getElementById("btn-content-picker-close");
    if (btnPickerClose) {
        btnPickerClose.addEventListener("click", () => {
            playSfx('click');
            closeContentPicker();
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

    const btnThemeToggle = document.getElementById("btn-theme-toggle");
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener("click", () => {
            playSfx('click');
            const themes = ['dark', 'classic', 'darkness'];
            const idx = themes.indexOf(localTheme);
            localTheme = themes[(idx + 1) % themes.length];
            localStorage.setItem('theme', localTheme);
            applyTheme();
        });
    }

    const btnSoundToggle = document.getElementById("btn-sound-toggle");
    if (btnSoundToggle) {
        btnSoundToggle.classList.toggle("active", localSfxEnabled);
        btnSoundToggle.addEventListener("click", () => {
            localSfxEnabled = !localSfxEnabled;
            localStorage.setItem('sfx_enabled', localSfxEnabled ? 'true' : 'false');
            btnSoundToggle.classList.toggle("active", localSfxEnabled);
            playSfx('click');
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

            // Fase O — re-renderiza a aba Personagem ao entrar (state pode ter
            // mudado, ex: novos progs ativos para a seção de subscrição).
            if (targetTab === "character") {
                renderCharacterTab();
            }
        });
    });

    // Fase O — listeners dos inputs de identidade (uma vez no boot)
    bindCharacterIdentityListeners();

    const btnResetRoster = document.getElementById("btn-reset-roster");
    if (btnResetRoster) {
        btnResetRoster.addEventListener("click", async () => {
            const ok = await showConfirm({
                title: "Limpar Todos os Jogadores",
                message: "Apagar TODOS os jogadores cadastrados no elenco?",
                detail: "Esta ação remove o roster inteiro da static, incluindo slots vinculados a contas. Não pode ser desfeita.",
                confirmText: "Limpar Todos",
                danger: true,
            });
            if (ok) {
                state.roster = [];
                saveState();
                renderRosterTables();
                playSfx('success');
            }
        });
    }

    // ----- Handlers de Autenticação -----
    const btnShowLogin = document.getElementById("btn-show-login");
    const btnShowRegister = document.getElementById("btn-show-register");
    const loginArea = document.getElementById("auth-login-area");
    const registerArea = document.getElementById("auth-register-area");

    if (btnShowLogin && btnShowRegister && loginArea && registerArea) {
        btnShowLogin.addEventListener("click", () => {
            playSfx('click');
            btnShowLogin.classList.add("active");
            btnShowRegister.classList.remove("active");
            loginArea.hidden = false;
            registerArea.hidden = true;
        });
        btnShowRegister.addEventListener("click", () => {
            playSfx('click');
            btnShowRegister.classList.add("active");
            btnShowLogin.classList.remove("active");
            registerArea.hidden = false;
            loginArea.hidden = true;
        });
    }

    const btnAuthLogin = document.getElementById("btn-auth-login");
    if (btnAuthLogin) {
        btnAuthLogin.addEventListener("click", async () => {
            const u = document.getElementById("login-username").value.trim();
            const p = document.getElementById("login-password").value;
            if (!u || !p) { showAuthModal("Preencha usuário e senha."); return; }
            try {
                currentUser = await API.login(u, p);
                playSfx('success');
                await bootstrapAfterAuth();
            } catch (err) {
                showAuthModal(err.message);
            }
        });
    }

    const btnAuthRegister = document.getElementById("btn-auth-register");
    if (btnAuthRegister) {
        btnAuthRegister.addEventListener("click", async () => {
            const u = document.getElementById("reg-username").value.trim();
            const p = document.getElementById("reg-password").value;
            try {
                const res = await API.register(u, p);
                if (res && res.status === "pending") {
                    playSfx('tab');
                    document.getElementById("btn-show-login")?.click();
                    const authErr = document.getElementById("auth-error");
                    if (authErr) {
                        authErr.textContent = "Solicitação enviada! Aguarde aprovação de um officer.";
                        authErr.style.color = "var(--color-avail)";
                        authErr.hidden = false;
                    }
                    return;
                }
                currentUser = res;
                playSfx('success');
                await bootstrapAfterAuth();
            } catch (err) {
                showAuthModal(err.message);
            }
        });
    }

    // Enter nos campos de login/registro dispara o botão correspondente
    ["login-username", "login-password"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                btnAuthLogin?.click();
            }
        });
    });
    ["reg-username", "reg-password"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                btnAuthRegister?.click();
            }
        });
    });

    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
        btnLogout.addEventListener("click", async () => {
            playSfx('click');
            stopPolling();
            try { await API.logout(); } catch (_) {}
            currentUser = null;
            currentUserRole = null;
            currentUserId = null;
            currentStaticId = null;
            lastStateETag = null;
            updateUserPill();
            showAuthModal();
        });
    }

    // ----- Modal de Gerenciamento de Membros (Admin) -----
    const btnManageMembers = document.getElementById("btn-manage-members");
    if (btnManageMembers) {
        btnManageMembers.addEventListener("click", () => {
            playSfx('click');
            openMembersModal();
        });
    }

    // ----- Modal de Gerenciamento de Conteúdos (Officer+) — Fase 8 -----
    const btnManageContents = document.getElementById("btn-manage-contents");
    if (btnManageContents) {
        btnManageContents.addEventListener("click", () => {
            playSfx('click');
            openContentManagerModal();
        });
    }
    const btnCreateContent = document.getElementById("btn-cc-create");
    if (btnCreateContent) {
        btnCreateContent.addEventListener("click", handleCreateCustomContent);
    }
    document.querySelectorAll('input[name="cc-party-mode"]').forEach(radio => {
        radio.addEventListener("change", () => {
            const group = document.getElementById("cc-dynamic-quorum-group");
            if (group) group.hidden = radio.value !== "dynamic" || !radio.checked;
        });
    });
    const inpCcName = document.getElementById("inp-cc-name");
    if (inpCcName) {
        inpCcName.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); handleCreateCustomContent(); }
        });
    }

    // Fase N — handlers do dropdown de expansão e do form inline "nova expansão"
    const selCcExp = document.getElementById("sel-cc-expansion");
    if (selCcExp) {
        selCcExp.addEventListener("change", () => {
            const inline = document.getElementById("cc-new-expansion-inline");
            if (selCcExp.value === "__new__") {
                if (inline) inline.hidden = false;
                document.getElementById("inp-new-exp-name")?.focus();
            } else {
                if (inline) inline.hidden = true;
            }
        });
    }
    const btnNewExpAdd = document.getElementById("btn-new-exp-add");
    if (btnNewExpAdd) btnNewExpAdd.addEventListener("click", handleNewExpansionInline);
    const btnNewExpCancel = document.getElementById("btn-new-exp-cancel");
    if (btnNewExpCancel) {
        btnNewExpCancel.addEventListener("click", () => {
            const inline = document.getElementById("cc-new-expansion-inline");
            if (inline) inline.hidden = true;
            const sel = document.getElementById("sel-cc-expansion");
            if (sel && sel.value === "__new__") sel.value = "";
            const nameEl = document.getElementById("inp-new-exp-name");
            const capEl = document.getElementById("inp-new-exp-levelcap");
            const errEl = document.getElementById("new-exp-error");
            if (nameEl) nameEl.value = "";
            if (capEl) capEl.value = "";
            if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
        });
    }
    ["inp-new-exp-name", "inp-new-exp-levelcap"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); handleNewExpansionInline(); }
        });
    });

    // Fechar qualquer modal via data-target="modal-xxx" no .btn-close-modal
    document.querySelectorAll(".btn-close-modal[data-target]").forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.dataset.target;
            const m = document.getElementById(targetId);
            if (m) m.hidden = true;
            playSfx('click');
        });
    });

    // Fechar modal de membros clicando no overlay
    const modalMembers = document.getElementById("modal-members");
    if (modalMembers) {
        modalMembers.addEventListener("click", (e) => {
            if (e.target === modalMembers) modalMembers.hidden = true;
        });
    }

    // Fase 12 — Botão de desvincular grupo do Telegram
    const btnTgUnbind = document.getElementById("btn-telegram-unbind");
    if (btnTgUnbind) btnTgUnbind.addEventListener("click", unbindTelegramGroup);
    const modalContentMgr = document.getElementById("modal-content-manager");
    if (modalContentMgr) {
        modalContentMgr.addEventListener("click", (e) => {
            if (e.target === modalContentMgr) modalContentMgr.hidden = true;
        });
    }

    // ----- Handlers do Modal de Edição de Jogador -----
    const btnEditSave = document.getElementById("btn-edit-player-save");
    const btnEditCancel = document.getElementById("btn-edit-player-cancel");
    const modalEditPlayer = document.getElementById("modal-edit-player");
    if (btnEditSave) btnEditSave.addEventListener("click", saveEditedPlayer);
    if (btnEditCancel) btnEditCancel.addEventListener("click", () => { playSfx('click'); closeEditPlayerModal(); });
    if (modalEditPlayer) {
        // Clique no overlay (fora da modal) fecha
        modalEditPlayer.addEventListener("click", (e) => {
            if (e.target === modalEditPlayer) closeEditPlayerModal();
        });
        // Botão X
        const closeBtn = modalEditPlayer.querySelector(".btn-close-modal");
        if (closeBtn) closeBtn.addEventListener("click", () => { playSfx('click'); closeEditPlayerModal(); });
    }

    // ----- Bootstrap final: tem sessão? carrega; senão pede login -----
    if (currentUser) {
        await bootstrapAfterAuth();
    } else {
        showAuthModal();
    }
});
