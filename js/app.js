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
    customContents: [], // [{id, name, partyMode: "full"|"light"|"dynamic", expansion, iconUrl}] — Fase 8
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

    state.roster = state.roster.map(player => {
        const id = player.id || "mem_" + Math.random().toString(36).substr(2, 9);
        const flexType = player.flexType || "custom";
        let jobsPool = player.jobsPool || [];
        if (jobsPool.length === 0 && player.job) jobsPool = [player.job];
        if (jobsPool.length === 0) jobsPool = ["WAR"];

        const assignedJob = player.assignedJob || player.job || jobsPool[0];
        const assignedJobsByProg = player.assignedJobsByProg || {};
        const monthlySchedule = player.monthlySchedule || {};
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

function saveState() {
    delete state.loot;
    pendingSaveAt = Date.now();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
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
                // Recarrega o estado canônico para reverter a UI.
                showToast("Você não tem autoridade para realizar essa alteração. As mudanças foram revertidas.", { type: "error" });
                bootstrapAfterAuth();
            }
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
    const customs = Array.isArray(state.customContents) ? state.customContents : [];
    const limited = Array.isArray(FFXIV_LIMITED_CONTENTS) ? FFXIV_LIMITED_CONTENTS : [];
    const allTargets = [...FFXIV_RAIDS, ...FFXIV_ULTIMATES, ...limited, ...customs];
    return allTargets.find(t => t.id === progId) || { id: progId, name: progId, expansion: "" };
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
    const expansion = progObj.expansion || "";

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
        const avail = getAvailCountForDate(date);
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
        card.querySelector(".prog-card-remove").addEventListener("click", (e) => {
            e.stopPropagation();
            playSfx('click');
            state.activeProgs = state.activeProgs.filter(id => id !== progId);
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
            ${item.expansion ? `<span class="content-picker-card-meta">${escapeHtml(item.expansion)}</span>` : ''}
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
    return (player.jobsPool || []).map(jId => {
        const jObj = FFXIV_JOBS.find(j => j.id === jId);
        const roleData = jObj ? FFXIV_ROLES[jObj.role] : null;
        const color = roleData ? roleData.color : '#475569';
        const imgH = jObj && jObj.iconUrl ? `<img class="job-img-icon" src="${jObj.iconUrl}" alt="${jId}">` : (jObj ? jObj.icon : '');
        const isAssigned = jId === currentAssignedJob;
        const disabledStyle = canEdit ? '' : 'pointer-events:none; opacity:0.7;';
        return `<button type="button" class="job-badge direct-pool-job-btn" style="background-color: ${color}; ${isAssigned ? 'opacity:0.4; transform:none; cursor:default;' : ''} ${disabledStyle}" data-id="${player.id}" data-job="${jId}" title="Clique para definir ${jId} como principal neste conteúdo">${imgH || jId}</button>`;
    }).join(' ');
}

// Constrói o HTML dos botões de ação para uma linha do roster baseado em permissões
function buildRowActions(player, ctx) {
    const editBtn = `<button class="btn-table-action btn-edit-member" data-id="${player.id}" title="Editar nome e classes do jogador"><img src="assets/icons/dictionary/adventurer_plate.png" alt="Editar" style="width:28px;height:28px;display:block;"></button>`;
    const benchBtn = `<button class="btn-table-action btn-move-bench" data-id="${player.id}" title="Mover para o Banco de Reservas desta Raid"><img src="assets/icons/dictionary/party_member.png" alt="Banco" style="width:28px;height:28px;display:block;"></button>`;
    const activeBtn = `<button class="btn-table-action btn-move-active" data-id="${player.id}" title="Alocar como Titular na Party Principal desta Raid"><img src="assets/icons/dictionary/party_leader.png" alt="Alocar" style="width:28px;height:28px;display:block;"></button>`;
    const delBtn = `<button class="btn-table-action btn-delete-member" data-id="${player.id}" title="Excluir Jogador"><img src="assets/icons/dictionary/exit_game.png" alt="Excluir" style="width:28px;height:28px;display:block;"></button>`;

    if (isOfficer()) {
        return ctx === "active" ? `${editBtn}${benchBtn}${delBtn}` : `${editBtn}${activeBtn}${delBtn}`;
    }
    if (isOwnSlot(player)) {
        // Member no próprio slot: pode editar e excluir, não pode mover banco/titular
        return `${editBtn}${delBtn}`;
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

    const partySize = getPartySize(activeProgId);
    if (activeCountText) {
        activeCountText.textContent = `${activeMembers.length} / ${partySize}`;
        activeCountText.style.color = activeMembers.length >= partySize ? "var(--color-avail)" : "var(--gold-bright)";
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

            const canEdit = canEditPlayer(player);
            const ownTag = isOwnSlot(player) ? '<span style="font-size:0.7rem;color:var(--gold-bright);margin-left:4px;font-style:italic;">(você)</span>' : '';
            const poolBadgesHtml = buildPoolBadgesHtml(player, activeProgId, canEdit);

            tr.innerHTML = `
                <td data-label="rank" style="font-weight: bold; color: var(--gold-muted);">#${idx + 1}</td>
                <td data-label="Jogador">
                    <input type="text" class="ff-input inp-roster-name" value="${player.name}" data-id="${player.id}" placeholder="Nome / Nick" ${canEdit ? '' : 'disabled'}>${ownTag}
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
                        <input type="number" class="ff-input inp-roster-ilvl" value="${player.ilvl}" min="1" max="999" data-id="${player.id}" style="width: 65px; padding: 6px;" ${canEdit ? '' : 'disabled'}>
                        <label title="BiS (Best in Slot)"><input type="checkbox" class="ff-checkbox chk-roster-bis" data-id="${player.id}" ${player.bis ? 'checked' : ''} ${canEdit ? '' : 'disabled'}></label>
                    </div>
                </td>
                <td data-label="Ações">
                    <div style="display: flex; gap: 4px;">
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
            const canEdit = canEditPlayer(player);
            const ownTag = isOwnSlot(player) ? '<span style="font-size:0.7rem;color:var(--gold-bright);margin-left:4px;font-style:italic;">(você)</span>' : '';
            const poolBadgesHtml = buildPoolBadgesHtml(player, activeProgId, canEdit);

            tr.innerHTML = `
                <td data-label="Jogador">
                    <input type="text" class="ff-input inp-roster-name" value="${player.name}" data-id="${player.id}" placeholder="Nome / Nick" ${canEdit ? '' : 'disabled'}>${ownTag}
                </td>
                <td data-label="Classes">
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
                        ${poolBadgesHtml}
                    </div>
                </td>
                <td data-label="iLvl">
                    <input type="number" class="ff-input inp-roster-ilvl" value="${player.ilvl}" min="1" max="999" data-id="${player.id}" style="width: 70px; padding: 6px;" ${canEdit ? '' : 'disabled'}>
                </td>
                <td data-label="Ações">
                    <div style="display: flex; gap: 4px;">
                        ${buildRowActions(player, "bench")}
                    </div>
                </td>
            `;
            benchTbody.appendChild(tr);
        });
    }

    // Visibilidade do painel "Cadastrar Novo Jogador" conforme cargo
    const addPanel = document.querySelector(".add-member-panel");
    const addPanelHeader = addPanel?.querySelector(".panel-header h2");
    if (addPanel) {
        if (isOfficer()) {
            addPanel.style.display = "";
            if (addPanelHeader) addPanelHeader.textContent = "Cadastrar Novo Jogador";
        } else if (isMember()) {
            if (hasOwnSlot()) {
                addPanel.style.display = "none";
            } else {
                addPanel.style.display = "";
                if (addPanelHeader) addPanelHeader.textContent = "Crie seu Slot de Jogador";
            }
        } else {
            addPanel.style.display = "none";
        }
    }

    bindRosterTableEvents();
    renderDashboardVisualizer();
    renderScheduleTable();
    renderNotificationBanner();
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

    container.querySelectorAll(".btn-delete-member").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const id = e.currentTarget.dataset.id;
            const target = state.roster.find(p => p.id === id);
            if (!target) return;
            const ok = await showConfirm({
                title: "Excluir Jogador",
                message: `Deseja realmente excluir o jogador "${target.name || 'Sem Nome'}" do elenco?`,
                detail: "O slot será removido do roster e da fila de prioridade de loot. Esta ação não pode ser desfeita.",
                confirmText: "Excluir",
                danger: true,
            });
            if (!ok) return;
            state.roster = state.roster.filter(p => p.id !== id);
            saveState();
            renderRosterTables();
        });
    });

    container.querySelectorAll(".btn-edit-member").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const id = e.currentTarget.dataset.id;
            openEditPlayerModal(id);
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
                const rosterTabBtn = document.querySelector(".tab-btn[data-tab='roster']");
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

function getAvailCountForDate(dateKey) {
    return (state.roster || []).filter(p =>
        p.monthlySchedule && p.monthlySchedule[dateKey] === "avail"
    ).length;
}

function upsertRaidEvent(dateKey, progId, quorum) {
    if (!state.raidEvents) state.raidEvents = [];
    const existing = state.raidEvents.find(e => (e.postponedTo || e.date) === dateKey && e.progId === progId);
    if (existing) {
        existing.quorum = quorum;
        return existing;
    }
    // Remove evento anterior para o mesmo progId (só um evento futuro por prog)
    state.raidEvents = state.raidEvents.filter(e => e.progId !== progId);
    const evt = {
        id: `evt_${progId}_${dateKey.replace(/-/g, '')}`,
        progId,
        progName: getProgObj(progId).name,
        date: dateKey,
        quorum,
        createdBy: currentUserId,
        createdAt: new Date().toISOString(),
        postponedTo: null,
        postponedBy: null,
        postponedAt: null,
        reminder24hSent: false,
        reminderTodaySent: false,
    };
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
    state.raidEvents = state.raidEvents.filter(e => e.id !== evt.id);
    removeScheduleNotification(dateKey);
}

// ==========================================================================
// Modal de Agendamento de Dia (Fase 2A / 11)
// ==========================================================================

function openScheduleModal(dateKey) {
    const modal = document.getElementById("modal-schedule-date");
    const title = document.getElementById("modal-sched-title");
    const body  = document.getElementById("modal-sched-body");
    if (!modal || !title || !body) return;

    const [y, m, d] = dateKey.split("-");
    const label = `${d}/${m}/${y}`;
    title.textContent = `Agendar — ${label}`;

    const existingEvt = getRaidEventForDate(dateKey);
    const currentProgId = existingEvt ? existingEvt.progId : null;
    const currentQuorum = existingEvt ? existingEvt.quorum : 6;
    const progs = state.activeProgs || [];

    let html = `<p class="sched-modal-desc" id="sched-modal-desc">Selecione o conteúdo e o quorum mínimo de confirmações.</p>`;

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

    // Toggle seleção de prog
    let selectedProg = currentProgId || (progs[0] || null);
    refreshQuorumUI(selectedProg);
    body.querySelectorAll(".sched-opt-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            body.querySelectorAll(".sched-opt-btn").forEach(b => b.classList.remove("sched-opt-active"));
            btn.classList.add("sched-opt-active");
            selectedProg = btn.dataset.prog;
            refreshQuorumUI(selectedProg);
        });
    });

    // Confirmar agendamento ao clicar no prog (fecha o modal)
    body.querySelectorAll(".sched-opt-btn").forEach(btn => {
        btn.addEventListener("dblclick", confirmSchedule);
    });

    // Botão confirmar implícito: clique em prog já selecionado
    body.querySelectorAll(".sched-opt-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            if (btn.dataset.prog === selectedProg && btn.classList.contains("sched-opt-active")) {
                // segundo clique no mesmo prog = confirmar
                if (existingEvt && existingEvt.progId === selectedProg) return; // sem mudança
                confirmSchedule();
            }
        });
    });

    function confirmSchedule() {
        if (!selectedProg) return;
        // Modo dynamic: quorum não se aplica; gravamos 0 para sinalizar.
        const quorum = isDynamicProg(selectedProg)
            ? 0
            : (parseInt(body.querySelector("#inp-sched-quorum")?.value || "6", 10) || 6);
        upsertRaidEvent(dateKey, selectedProg, quorum);
        addScheduleNotification(dateKey, selectedProg);
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
        confirmBtn.textContent = "Confirmar Agendamento";
        confirmBtn.addEventListener("click", confirmSchedule);
        body.appendChild(confirmBtn);
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
            const avail = getAvailCountForDate(dateKey);
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

        th.innerHTML = `
            <div class="cell-day-num">${d}</div>
            <div class="cell-day-wk">${wkDay}</div>
        `;
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
    
    const activeProgId = state.inspectedProgId || "geral";
    const sortedRoster = [...state.roster].sort((a, b) => {
        const sA = getPlayerStatusForProg(a, activeProgId);
        const sB = getPlayerStatusForProg(b, activeProgId);
        if (sA === "active" && sB !== "active") return -1;
        if (sA !== "active" && sB === "active") return 1;
        return 0;
    });

    let renderedBenchHeader = false;
    const dynamicInspected = isDynamicProg(activeProgId);

    sortedRoster.forEach(player => {
        const playerStatusInProg = getPlayerStatusForProg(player, activeProgId);
        // Em dynamic, não há split titular/banco — todos são participantes.
        if (!dynamicInspected && playerStatusInProg === "bench" && !renderedBenchHeader) {
            renderedBenchHeader = true;
            const sep = document.createElement("tr");
            sep.innerHTML = `<td colspan="${numDays + 1}" style="background: rgba(165, 53, 53, 0.15); color: #fca5a5; font-weight: bold; font-size: 0.85rem; padding: 6px 16px; text-align: left;">Substitutos (Banco de Reservas desta Raid)</td>`;
            tbody.appendChild(sep);
        }

        if (!player.monthlySchedule) player.monthlySchedule = {};

        const tr = document.createElement("tr");
        const tdName = document.createElement("td");
        tdName.className = "col-fixed";
        tdName.style.fontWeight = "600";
        const statusTag = (!dynamicInspected && playerStatusInProg === "bench") ? `<span style="font-size:0.7rem;color:#fca5a5;">(Reserva)</span>` : '';
        tdName.innerHTML = `${player.name || '<span style="font-style:italic;color:#94a3b8;">Sem Nick</span>'} ${statusTag}`;
        tr.appendChild(tdName);

        const canTogglePlayer = canEditScheduleFor(player);

        for (let d = 1; d <= numDays; d++) {
            const dateKey = `${yearStr}-${monthStr}-${String(d).padStart(2, '0')}`;
            const statusVal = player.monthlySchedule[dateKey] || "";

            let statusText = "";
            let statusClass = "";
            if (statusVal === "avail") { statusText = "✔️"; statusClass = "avail"; }
            else if (statusVal === "late") { statusText = "⚠️"; statusClass = "late"; }
            else if (statusVal === "unavail") { statusText = "❌"; statusClass = "unavail"; }

            const tdDay = document.createElement("td");
            tdDay.className = `cell-status ${statusClass}${canTogglePlayer ? '' : ' cell-readonly'}`;
            tdDay.textContent = statusText;
            tdDay.title = canTogglePlayer ? `Dia ${d}: Clique para alternar` : `Dia ${d}: somente o próprio jogador ou officer pode alterar`;

            if (canTogglePlayer) {
                tdDay.addEventListener("click", () => {
                    playSfx('click');
                    if (statusVal === "") player.monthlySchedule[dateKey] = "avail";
                    else if (statusVal === "avail") player.monthlySchedule[dateKey] = "late";
                    else if (statusVal === "late") player.monthlySchedule[dateKey] = "unavail";
                    else delete player.monthlySchedule[dateKey];

                    saveState();
                    renderScheduleTable();
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

    const opportunities = [];
    for (let delta = 0; delta < 14; delta++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (getRaidEventForDate(dateKey)) continue;
        const count = getAvailCountForDate(dateKey);
        if (count >= 8) opportunities.push({ dateKey, dateObj: d, count });
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
    opportunities.forEach(({ dateKey, dateObj, count }) => {
        const dayStr  = String(dateObj.getDate()).padStart(2, '0');
        const monStr  = String(dateObj.getMonth() + 1).padStart(2, '0');
        const wkStr   = shortWkNames[dateObj.getDay()];
        const dateLbl = `${wkStr}, ${dayStr}/${monStr}`;
        html += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0; font-size: 0.82rem;">
                <span><span style="color: var(--gold-bright); font-weight: 600;">${dateLbl}</span> — ${count} pessoa(s) disponíveis (Full Party possível)</span>
                <button class="ff-btn-small btn-quorum-schedule" data-date="${dateKey}" style="padding: 2px 10px; font-size: 0.78rem;">Agendar</button>
            </div>
        `;
    });
    block.innerHTML = html;

    block.querySelectorAll(".btn-quorum-schedule").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const dk = e.currentTarget.getAttribute("data-date");
            if (dk) openScheduleModal(dk);
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
        const progReservas = state.roster.filter(p => getPlayerStatusForProg(p, progId) !== "active");

        // Encontra o raid event futuro para este prog
        const raidEvt = getRaidEventForProg(progId);
        const dynamicMode = isDynamicProg(progId);
        const defaultQuorum = dynamicMode ? 0 : getPartySize(progId);
        const quorum = raidEvt ? (raidEvt.quorum || defaultQuorum) : defaultQuorum;

        let foundDateKey = null;
        let foundDateObj = null;
        let confTitulares = [];
        let confReservas = [];
        let lateTitulares = [];
        let lateReservas = [];

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

            let tAvail = [];
            let tLate  = [];
            let rAvail = [];
            let rLate  = [];

            progTitulares.forEach(p => {
                const sVal = p.monthlySchedule ? p.monthlySchedule[dateKey] : "";
                if (sVal === "avail")     tAvail.push(p.name || "Sem Nick");
                else if (sVal === "late") tLate.push(p.name  || "Sem Nick");
            });

            progReservas.forEach(p => {
                const sVal = p.monthlySchedule ? p.monthlySchedule[dateKey] : "";
                if (sVal === "avail")     rAvail.push(p.name || "Sem Nick");
                else if (sVal === "late") rLate.push(p.name  || "Sem Nick");
            });

            foundDateKey   = dateKey;
            foundDateObj   = dObj;
            confTitulares  = tAvail;
            confReservas   = rAvail;
            lateTitulares  = tLate;
            lateReservas   = rLate;
            break;
        }

        const raidBlock = document.createElement("div");
        raidBlock.className = "next-raid-prog-block";
        raidBlock.style.background = "rgba(0,0,0,0.3)";
        raidBlock.style.border = "1px solid rgba(255,255,255,0.05)";
        raidBlock.style.borderRadius = "var(--radius-sm)";
        raidBlock.style.padding = "12px";
        raidBlock.style.marginBottom = "10px";

        const headerHtml = `<div style="font-weight: 700; color: var(--gold-bright); font-size: 0.95rem; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">${progObj.name.split(" (")[0]}</div>`;

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
                    alertsHtml += `<div style="background: rgba(234,179,8,0.2); border: 1px solid var(--color-late); color: var(--gold-bright); font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: bold; margin-top: 4px;">Status incerto (Talvez/Atraso) — não confirmados: ${lateAll.join(", ")}</div>`;
                }
                if (confReservas.length > 0) {
                    alertsHtml += `<div style="background: rgba(59,130,246,0.2); border: 1px solid #3b82f6; color: #93c5fd; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; font-weight: bold; margin-top: 4px;">Banco disponível: ${confReservas.join(", ")}</div>`;
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
                        <span style="font-weight: 600; font-size: 0.9rem;">Proxima Sessao: ${dateFormatted}${postponedNote}</span>
                        ${quorumBadge}
                    </div>
                    <div style="margin-top: 2px;">${alertsHtml}</div>
                    ${nicksListHtml}
                </div>
            `;
        } else {
            const noEvtMsg = raidEvt
                ? `Evento agendado para ${(raidEvt.postponedTo || raidEvt.date).split("-").reverse().join("/")} — sem confirmações ainda.`
                : "Nenhuma data de raid agendada para este conteúdo.";
            raidBlock.innerHTML = `
                ${headerHtml}
                <div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">${noEvtMsg}</div>
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
    const expEl  = document.getElementById("inp-cc-expansion");
    if (nameEl) nameEl.value = "";
    if (expEl)  expEl.value  = "";
    const fullRadio = modal.querySelector('input[name="cc-party-mode"][value="full"]');
    if (fullRadio) fullRadio.checked = true;
    renderContentManagerList();
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
        const inUse = (state.activeProgs || []).includes(c.id);
        const row = document.createElement("div");
        row.className = `content-manager-row mode-${mode}${inUse ? ' in-use' : ''}`;
        row.innerHTML = `
            <div class="content-manager-row-info">
                <span class="content-manager-row-name">${escapeHtml(c.name || c.id)}</span>
                <div class="content-manager-row-meta">
                    <span class="pill mode-${mode}">${modeLabel[mode]} · ${partySize}</span>
                    ${c.expansion ? `<span>${escapeHtml(c.expansion)}</span>` : ''}
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
    const expEl  = document.getElementById("inp-cc-expansion");
    const modeEl = document.querySelector('input[name="cc-party-mode"]:checked');

    const name = (nameEl?.value || "").trim();
    const expansion = (expEl?.value || "").trim();
    const partyMode = modeEl?.value || "full";

    if (!name) { showErr("Informe um nome para o conteúdo."); return; }
    if (name.length > 80) { showErr("Nome muito longo (máx 80 caracteres)."); return; }
    if (!["full", "light", "dynamic"].includes(partyMode)) { showErr("Modo de party inválido."); return; }

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
    if (expansion) newContent.expansion = expansion;

    if (!Array.isArray(state.customContents)) state.customContents = [];
    state.customContents.push(newContent);
    saveState();

    if (nameEl) nameEl.value = "";
    if (expEl)  expEl.value  = "";
    const fullRadio = document.querySelector('input[name="cc-party-mode"][value="full"]');
    if (fullRadio) fullRadio.checked = true;

    renderContentManagerList();
    renderActiveProgsPanel();
    playSfx('success');
    showToast(`Conteúdo "${name}" criado.`, { type: "success", title: "Conteúdo adicionado" });
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
    renderAllAfterLoad();
    startPolling();
}

function renderAllAfterLoad() {
    renderActiveProgsPanel();
    renderProgTabsBar();
    renderRosterTables();
    renderEquipmentPanel();

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
        });
    });

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
    const inpCcName = document.getElementById("inp-cc-name");
    if (inpCcName) {
        inpCcName.addEventListener("keydown", e => {
            if (e.key === "Enter") { e.preventDefault(); handleCreateCustomContent(); }
        });
    }

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
