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
    scheduledProgs: {}, // Mapeia "YYYY-MM-DD" -> "progId" alvo daquele dia
    pendingNotifications: [], // [{id, date, progId, createdBy, createdAt}]
    lootPriorities: {}, // Mapeia "progId" -> [memberId em ordem de prioridade]
    roster: [],
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
const POLL_INTERVAL_MS = 15000;
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
    if (state.theme === 'classic')   document.body.classList.add('theme-classic');
    else if (state.theme === 'darkness') document.body.classList.add('theme-darkness');

    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
        const labels = { dark: 'Crystal Blue', classic: 'Classic Dark', darkness: 'Darkness' };
        const span = btn.querySelector('.txt');
        if (span) span.textContent = labels[state.theme] || 'Tema';
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

function renderActiveProgsPanel() {
    const container = document.getElementById("active-progs-list");

    const canManage = canManageContent();

    if (container) {
        container.innerHTML = "";
        if (!state.activeProgs || state.activeProgs.length === 0) {
            container.innerHTML = `<span style="color: var(--text-muted); font-style: italic; font-size: 0.85rem;">Nenhum conteúdo em progresso cadastrado.${canManage ? ' Utilize os seletores abaixo.' : ''}</span>`;
        } else {
            state.activeProgs.forEach(progId => {
                const progObj = getProgObj(progId);
                const isUlt = FFXIV_ULTIMATES.some(u => u.id === progId);
                const chip = document.createElement("div");
                chip.className = "prog-chip";
                const closeBtn = canManage
                    ? `<button class="prog-chip-close" data-id="${progId}" title="Remover Progresso">&times;</button>`
                    : "";
                chip.innerHTML = `
                    <span class="prog-chip-type" style="color: ${isUlt ? '#e17a47' : 'var(--gold-bright)'}">${isUlt ? 'Ultimate' : 'Savage'}</span>
                    <span style="font-weight: 600;">${progObj.name.split(" (")[0].split(":")[0]}</span>
                    ${closeBtn}
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

    // Esconde a área de adicionar conteúdo para members
    const addControls = document.querySelector(".add-prog-controls-enhanced");
    if (addControls) addControls.style.display = canManage ? "" : "none";

    // Render content type buttons
    const typeSelector = document.getElementById("content-type-selector");
    if (typeSelector) {
        typeSelector.innerHTML = "";
        CONTENT_TYPES.forEach(ct => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `btn-content-type ${ct.id === activeContentTypeId ? 'active' : ''}`;
            btn.innerHTML = ct.label;
            btn.addEventListener("click", () => {
                playSfx('tab');
                activeContentTypeId = ct.id;
                renderActiveProgsPanel();
            });
            typeSelector.appendChild(btn);
        });
    }

    // Populate unified content select
    const selContent = document.getElementById("select-add-content");
    if (selContent) {
        selContent.innerHTML = '<option value="">-- Selecione --</option>';
        const currentType = CONTENT_TYPES.find(ct => ct.id === activeContentTypeId);
        if (currentType) {
            currentType.getList().forEach(item => {
                const opt = document.createElement("option");
                opt.value = item.id;
                opt.textContent = `${item.name} (${item.expansion})`;
                if (state.activeProgs && state.activeProgs.includes(item.id)) opt.disabled = true;
                selContent.appendChild(opt);
            });
        }
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

    if (activeCountText) {
        activeCountText.textContent = `${activeMembers.length} / 8`;
        activeCountText.style.color = activeMembers.length === 8 ? "var(--color-avail)" : "var(--gold-bright)";
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

            const poolBadgesHtml = player.jobsPool.map(jId => {
                const jObj = FFXIV_JOBS.find(j => j.id === jId);
                const roleData = jObj ? FFXIV_ROLES[jObj.role] : null;
                const color = roleData ? roleData.color : '#475569';
                const imgH = jObj && jObj.iconUrl ? `<img class="job-img-icon" src="${jObj.iconUrl}" alt="${jId}">` : (jObj ? jObj.icon : '');
                const isAssigned = jId === currentAssignedJob;
                const disabledStyle = canEdit ? '' : 'pointer-events:none; opacity:0.7;';
                return `<button type="button" class="job-badge direct-pool-job-btn" style="background-color: ${color}; ${isAssigned ? 'opacity:0.4; transform:none; cursor:default;' : ''} ${disabledStyle}" data-id="${player.id}" data-job="${jId}" title="Clique para definir ${jId} como principal neste conteúdo">${imgH || jId}</button>`;
            }).join(' ');

            tr.innerHTML = `
                <td style="font-weight: bold; color: var(--gold-muted);">#${idx + 1}</td>
                <td>
                    <input type="text" class="ff-input inp-roster-name" value="${player.name}" data-id="${player.id}" placeholder="Nome / Nick" ${canEdit ? '' : 'disabled'}>${ownTag}
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
                        <input type="number" class="ff-input inp-roster-ilvl" value="${player.ilvl}" min="1" max="999" data-id="${player.id}" style="width: 65px; padding: 6px;" ${canEdit ? '' : 'disabled'}>
                        <label title="BiS (Best in Slot)"><input type="checkbox" class="ff-checkbox chk-roster-bis" data-id="${player.id}" ${player.bis ? 'checked' : ''} ${canEdit ? '' : 'disabled'}></label>
                    </div>
                </td>
                <td>
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
            const currentAssignedJob = getAssignedJobForProg(player, activeProgId);
            const canEdit = canEditPlayer(player);
            const ownTag = isOwnSlot(player) ? '<span style="font-size:0.7rem;color:var(--gold-bright);margin-left:4px;font-style:italic;">(você)</span>' : '';

            const poolBadgesHtml = player.jobsPool.map(jId => {
                const jObj = FFXIV_JOBS.find(j => j.id === jId);
                const roleData = jObj ? FFXIV_ROLES[jObj.role] : null;
                const color = roleData ? roleData.color : '#475569';
                const imgH = jObj && jObj.iconUrl ? `<img class="job-img-icon" src="${jObj.iconUrl}" alt="${jId}">` : (jObj ? jObj.icon : '');
                const isAssigned = jId === currentAssignedJob;
                const disabledStyle = canEdit ? '' : 'pointer-events:none; opacity:0.7;';
                return `<button type="button" class="job-badge direct-pool-job-btn" style="background-color: ${color}; ${isAssigned ? 'opacity:0.4; transform:none; cursor:default;' : ''} ${disabledStyle}" data-id="${player.id}" data-job="${jId}" title="Clique para definir ${jId} como principal neste conteúdo">${imgH || jId}</button>`;
            }).join(' ');

            tr.innerHTML = `
                <td>
                    <input type="text" class="ff-input inp-roster-name" value="${player.name}" data-id="${player.id}" placeholder="Nome / Nick" ${canEdit ? '' : 'disabled'}>${ownTag}
                </td>
                <td>
                    <div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
                        ${poolBadgesHtml}
                    </div>
                </td>
                <td>
                    <input type="number" class="ff-input inp-roster-ilvl" value="${player.ilvl}" min="1" max="999" data-id="${player.id}" style="width: 70px; padding: 6px;" ${canEdit ? '' : 'disabled'}>
                </td>
                <td>
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
            if (activeCount >= 8) {
                showToast("A Party Principal desta Raid já atingiu o limite máximo de 8 jogadores. Mova alguém para o banco primeiro.", { type: "warning", title: "Party Cheia" });
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
// Modal de Agendamento de Dia (Fase 2A)
// ==========================================================================

function openScheduleModal(dateKey) {
    const modal = document.getElementById("modal-schedule-date");
    const title = document.getElementById("modal-sched-title");
    const body  = document.getElementById("modal-sched-body");
    if (!modal || !title || !body) return;

    const [y, m, d] = dateKey.split("-");
    const label = `${d}/${m}/${y}`;
    title.textContent = `Agendar — ${label}`;

    const current = (state.scheduledProgs || {})[dateKey];
    const progs = state.activeProgs || [];

    let html = `<p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;">Selecione o conteúdo a ser progredido neste dia.</p>`;
    html += `<div class="sched-prog-options">`;
    progs.forEach(progId => {
        const pObj = getProgObj(progId);
        const name = pObj.name.split(" (")[0].split(":")[0];
        const active = progId === current ? " sched-opt-active" : "";
        html += `<button class="ff-btn-action sched-opt-btn${active}" data-prog="${progId}">${name}</button>`;
    });
    html += `</div>`;
    if (current) {
        html += `<button id="btn-sched-clear" class="ff-btn-small" style="margin-top:12px;width:100%;justify-content:center;color:var(--text-muted);">Limpar Agendamento</button>`;
    }

    body.innerHTML = html;

    body.querySelectorAll(".sched-opt-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const progId = btn.dataset.prog;
            if (!state.scheduledProgs) state.scheduledProgs = {};
            state.scheduledProgs[dateKey] = progId;
            addScheduleNotification(dateKey, progId);
            saveState();
            renderScheduleTable();
            renderQuickSchedule();
            renderNotificationBanner();
            modal.hidden = true;
            playSfx('success');
        });
    });

    const clearBtn = body.querySelector("#btn-sched-clear");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            delete state.scheduledProgs[dateKey];
            removeScheduleNotification(dateKey);
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

        const scheduledProgId = scheduledProgs[dateKey];
        const scheduledProgObj = scheduledProgId ? getProgObj(scheduledProgId) : null;
        const progLabel = scheduledProgObj
            ? scheduledProgObj.name.split(" (")[0].split(":")[0]
            : "";
        const canSched = canScheduleDate();
        const thTitle = canSched
            ? (scheduledProgId ? `Agendado: ${progLabel} — clique para alterar` : "Clique para agendar")
            : (scheduledProgId ? `Agendado: ${progLabel}` : "");

        if (scheduledProgId) th.classList.add("day-scheduled");

        th.innerHTML = `
            <div class="cell-day-num">${d}</div>
            <div class="cell-day-wk">${wkDay}</div>
        `;
        if (canSched) {
            th.style.cursor = "pointer";
            if (thTitle) th.title = thTitle;
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

    sortedRoster.forEach(player => {
        const playerStatusInProg = getPlayerStatusForProg(player, activeProgId);
        if (playerStatusInProg === "bench" && !renderedBenchHeader) {
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
        const statusTag = playerStatusInProg === "bench" ? `<span style="font-size:0.7rem;color:#fca5a5;">(Reserva)</span>` : '';
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

        const headerHtml = `<div style="font-weight: 700; color: var(--gold-bright); font-size: 0.95rem; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 4px;">${progObj.name.split(" (")[0]}</div>`;

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
    if (btnSoundToggle) btnSoundToggle.classList.toggle("active", !!state.sfx);
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
                if (activeCount >= 8) {
                    showToast("Party Principal já está completa com 8 jogadores. O novo jogador entrará como Reserva neste conteúdo.", { type: "warning", title: "Party Cheia" });
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

    const btnAddProg = document.getElementById("btn-add-prog");
    if (btnAddProg) {
        btnAddProg.addEventListener("click", () => {
            const selContent = document.getElementById("select-add-content");
            if (!selContent || !selContent.value) return;
            const selectedId = selContent.value;
            if (state.activeProgs && state.activeProgs.includes(selectedId)) {
                showToast("Este conteúdo já está na lista de progressos ativos.", { type: "warning", title: "Já cadastrado" });
                return;
            }
            playSfx('success');
            if (!state.activeProgs) state.activeProgs = [];
            state.activeProgs.push(selectedId);
            state.roster.forEach(player => {
                if (!player.statusByProg) player.statusByProg = {};
                if (!player.statusByProg[selectedId]) {
                    player.statusByProg[selectedId] = player.status === "bench" ? "bench" : "active";
                }
            });
            saveState();
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

    const btnThemeToggle = document.getElementById("btn-theme-toggle");
    if (btnThemeToggle) {
        btnThemeToggle.addEventListener("click", () => {
            playSfx('click');
            const themes = ['dark', 'classic', 'darkness'];
            const idx = themes.indexOf(state.theme);
            state.theme = themes[(idx + 1) % themes.length];
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
                currentUser = await API.register(u, p);
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
