// Catálogo de Dados para o FFXIV Raid Planner

const FFXIV_ROLES = {
    tank: { name: "Tank", color: "#2d5a9b", icon: "🛡️" },
    healer: { name: "Healer", color: "#3e8a4f", icon: "🌿" },
    melee: { name: "Melee DPS", color: "#a53535", icon: "⚔️" },
    ranged: { name: "Ranged Physical", color: "#b66e38", icon: "🏹" },
    caster: { name: "Magical Ranged", color: "#7a38b6", icon: "🔮" },
    limited: { name: "Limited Job", color: "#06b6d4", icon: "🔒" }
};

const FFXIV_JOBS = [
    // Tanks
    { id: "PLD", name: "Paladin", role: "tank", icon: "🛡️", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/paladin.png" },
    { id: "WAR", name: "Warrior", role: "tank", icon: "🪓", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/warrior.png" },
    { id: "DRK", name: "Dark Knight", role: "tank", icon: "🗡️", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/darkknight.png" },
    { id: "GNB", name: "Gunbreaker", role: "tank", icon: "🔫", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/gunbreaker.png" },

    // Healers
    { id: "WHM", name: "White Mage", role: "healer", icon: "🪄", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/whitemage.png" },
    { id: "SCH", name: "Scholar", role: "healer", icon: "📖", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/scholar.png" },
    { id: "AST", name: "Astrologian", role: "healer", icon: "🃏", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/astrologian.png" },
    { id: "SGE", name: "Sage", role: "healer", icon: "🛰️", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/sage.png" },

    // Melee DPS
    { id: "MNK", name: "Monk", role: "melee", icon: "🥊", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/monk.png" },
    { id: "DRG", name: "Dragoon", role: "melee", icon: "🐉", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/dragoon.png" },
    { id: "NIN", name: "Ninja", role: "melee", icon: "🥷", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/ninja.png" },
    { id: "SAM", name: "Samurai", role: "melee", icon: "⛩️", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/samurai.png" },
    { id: "RPR", name: "Reaper", role: "melee", icon: "☠️", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/reaper.png" },
    { id: "VPR", name: "Viper", role: "melee", icon: "🐍", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/vpr.png" },

    // Ranged Physical DPS
    { id: "BRD", name: "Bard", role: "ranged", icon: "🏹", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/bard.png" },
    { id: "MCH", name: "Machinist", role: "ranged", icon: "⚙️", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/machinist.png" },
    { id: "DNC", name: "Dancer", role: "ranged", icon: "💃", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/dancer.png" },

    // Magical Ranged DPS (Casters)
    { id: "BLM", name: "Black Mage", role: "caster", icon: "☄️", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/blackmage.png" },
    { id: "SMN", name: "Summoner", role: "caster", icon: "🐲", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/summoner.png" },
    { id: "RDM", name: "Red Mage", role: "caster", icon: "🌹", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/redmage.png" },
    { id: "PCT", name: "Pictomancer", role: "caster", icon: "🎨", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/pct.png" },

    // Limited Jobs (Fase 14) — só aparecem em conteúdos do tipo "limited"
    { id: "BLU", name: "Blue Mage", role: "limited", icon: "🔵", iconUrl: "assets/icons/dictionary/blue_mage_v11.png" }
];

// Fase N — Catálogo de Expansões (seed). state.expansions é o catálogo runtime
// (editável por admin/officer no modal de gerenciamento). Este array fica como
// fonte da verdade para o seed inicial em hydrateState.
const FFXIV_EXPANSIONS_SEED = [
    { id: "arr", name: "A Realm Reborn", levelCap: 50,  order: 1 },
    { id: "hw",  name: "Heavensward",    levelCap: 60,  order: 2 },
    { id: "sb",  name: "Stormblood",     levelCap: 70,  order: 3 },
    { id: "shb", name: "Shadowbringers", levelCap: 80,  order: 4 },
    { id: "ew",  name: "Endwalker",      levelCap: 90,  order: 5 },
    { id: "dt",  name: "Dawntrail",      levelCap: 100, order: 6 },
    { id: "limited", name: "Limited Job", levelCap: null, order: 99, isLimited: true }
];

// Fase N — Aliases para retrocompat. Chaves são nomes normalizados (lowercase, trim).
const EXPANSION_ALIASES = {
    "arr": "arr", "a realm reborn": "arr", "realm reborn": "arr",
    "hw":  "hw",  "heavensward": "hw",
    "sb":  "sb",  "stormblood": "sb",
    "shb": "shb", "shadowbringers": "shb", "shadow bringers": "shb",
    "ew":  "ew",  "endwalker": "ew", "end walker": "ew",
    "dt":  "dt",  "dawntrail": "dt", "dawn trail": "dt",
    "blu": "limited", "blue mage": "limited", "limited": "limited", "limited job": "limited"
};

// Fase N — Heurística por nome do conteúdo quando o campo `expansion` está ausente
// ou ininteligível. Avaliado em ordem; primeiro match vence.
const CONTENT_NAME_EXPANSION_HINTS = [
    { match: /arcadion|light[-\s]?heavyweight|cruiserweight|fru|futures rewritten/i, expId: "dt" },
    { match: /pand[aæ]monium|anabaseios|abyssos|asphodelos|dsr|dragonsong|\btop\b|omega protocol/i, expId: "ew" },
    { match: /\beden\b|\btea\b|epic of alexander/i, expId: "shb" },
    { match: /omega:?\s*(alpha|sigma|delta)scape|\buwu\b|weapon'?s refrain/i, expId: "sb" },
    { match: /alexander|\bucob\b|unending coil/i, expId: "hw" },
    { match: /coil of bahamut/i, expId: "arr" }
];

const FFXIV_ULTIMATES = [
    { id: "UCOB", name: "The Unending Coil of Bahamut (UCOB)", expansionId: "sb" },
    { id: "UWU", name: "The Weapon's Refrain (UWU)", expansionId: "sb" },
    { id: "TEA", name: "The Epic of Alexander (TEA)", expansionId: "shb" },
    { id: "DSR", name: "Dragonsong's Reprise (DSR)", expansionId: "ew" },
    { id: "TOP", name: "The Omega Protocol (TOP)", expansionId: "ew" },
    { id: "FRU", name: "Futures Rewritten (FRU)", expansionId: "dt" }
];

const FFXIV_RAIDS = [
    // Dawntrail
    { id: "arcadion_lh", name: "AAC Light-heavyweight (Savage)", expansionId: "dt", encounters: ["M1S", "M2S", "M3S", "M4S"] },

    // Endwalker
    { id: "anabaseios", name: "Pandæmonium: Anabaseios (Savage)", expansionId: "ew", encounters: ["P9S", "P10S", "P11S", "P12S"] },
    { id: "abyssos", name: "Pandæmonium: Abyssos (Savage)", expansionId: "ew", encounters: ["P5S", "P6S", "P7S", "P8S"] },
    { id: "asphodelos", name: "Pandæmonium: Asphodelos (Savage)", expansionId: "ew", encounters: ["P1S", "P2S", "P3S", "P4S"] },

    // Shadowbringers
    { id: "eden_promise", name: "Eden's Promise (Savage)", expansionId: "shb", encounters: ["E9S", "E10S", "E11S", "E12S"] },
    { id: "eden_verse", name: "Eden's Verse (Savage)", expansionId: "shb", encounters: ["E5S", "E6S", "E7S", "E8S"] },
    { id: "eden_gate", name: "Eden's Gate (Savage)", expansionId: "shb", encounters: ["E1S", "E2S", "E3S", "E4S"] },

    // Stormblood
    { id: "omega_alpha", name: "Omega: Alphascape (Savage)", expansionId: "sb", encounters: ["O9S", "O10S", "O11S", "O12S"] },
    { id: "omega_sigma", name: "Omega: Sigmascape (Savage)", expansionId: "sb", encounters: ["O5S", "O6S", "O7S", "O8S"] },
    { id: "omega_delta", name: "Omega: Deltascape (Savage)", expansionId: "sb", encounters: ["O1S", "O2S", "O3S", "O4S"] },

    // Heavensward
    { id: "alex_creator", name: "Alexander: The Creator (Savage)", expansionId: "hw", encounters: ["A9S", "A10S", "A11S", "A12S"] },
    { id: "alex_midas", name: "Alexander: Midas (Savage)", expansionId: "hw", encounters: ["A5S", "A6S", "A7S", "A8S"] },
    { id: "alex_gordias", name: "Alexander: Gordias (Savage)", expansionId: "hw", encounters: ["A1S", "A2S", "A3S", "A4S"] },

    // A Realm Reborn
    { id: "coil_final", name: "Final Coil of Bahamut", expansionId: "arr", encounters: ["T10", "T11", "T12", "T13"] },
    { id: "coil_second", name: "Second Coil of Bahamut (Savage)", expansionId: "arr", encounters: ["T6S", "T7S", "T8S", "T9S"] },
    { id: "coil_binding", name: "Binding Coil of Bahamut", expansionId: "arr", encounters: ["T1", "T2", "T3", "T4", "T5"] }
];

// Fase 14 — Conteúdos de Limited Job (hardcoded, não editáveis pelo usuário)
// Limited NÃO usa a ordem de expansão para validação — cada EVENTO carrega o
// próprio `limitedJobMinLevel` (definido pelo officer no agendamento). Aqui
// só guardamos o job referência (`limitedJobId`).
const FFXIV_LIMITED_CONTENTS = [
    { id: "blue_mage_raid", name: "Blue Mage", expansionId: "limited", partyMode: "limited", limitedJobId: "BLU", partySize: 8 }
    // Beastmaster será adicionado quando o job for lançado pela Square Enix.
];

// Tipos de conteúdo suportados — extensível para futuros conteúdos
const CONTENT_TYPES = [
    { id: "raid",     label: "Savage",       icon: "⚔️", getList: () => FFXIV_RAIDS },
    { id: "ultimate", label: "Ultimate",     icon: "🌀", getList: () => FFXIV_ULTIMATES },
    { id: "limited",  label: "Limited Jobs", icon: "🔒", getList: () => FFXIV_LIMITED_CONTENTS },
    { id: "custom",   label: "Customizados", icon: "✨", getList: () => (typeof state !== "undefined" && Array.isArray(state.customContents) ? state.customContents : []) }
];
