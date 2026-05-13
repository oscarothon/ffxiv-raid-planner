// Catálogo de Dados para o FFXIV Raid Planner

const FFXIV_ROLES = {
    tank: { name: "Tank", color: "#2d5a9b", icon: "🛡️" },
    healer: { name: "Healer", color: "#3e8a4f", icon: "🌿" },
    melee: { name: "Melee DPS", color: "#a53535", icon: "⚔️" },
    ranged: { name: "Ranged Physical", color: "#b66e38", icon: "🏹" },
    caster: { name: "Magical Ranged", color: "#7a38b6", icon: "🔮" }
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
    { id: "PCT", name: "Pictomancer", role: "caster", icon: "🎨", iconUrl: "https://raw.githubusercontent.com/xivapi/classjob-icons/master/companion/pct.png" }
];

const FFXIV_ULTIMATES = [
    { id: "UCOB", name: "The Unending Coil of Bahamut (UCOB)", expansion: "Stormblood" },
    { id: "UWU", name: "The Weapon's Refrain (UWU)", expansion: "Stormblood" },
    { id: "TEA", name: "The Epic of Alexander (TEA)", expansion: "Shadowbringers" },
    { id: "DSR", name: "Dragonsong's Reprise (DSR)", expansion: "Endwalker" },
    { id: "TOP", name: "The Omega Protocol (TOP)", expansion: "Endwalker" },
    { id: "FRU", name: "Futures Rewritten (FRU)", expansion: "Dawntrail" }
];

const FFXIV_RAIDS = [
    // Dawntrail
    { id: "arcadion_lh", name: "AAC Light-heavyweight (Savage)", expansion: "Dawntrail", encounters: ["M1S", "M2S", "M3S", "M4S"] },
    
    // Endwalker
    { id: "anabaseios", name: "Pandæmonium: Anabaseios (Savage)", expansion: "Endwalker", encounters: ["P9S", "P10S", "P11S", "P12S"] },
    { id: "abyssos", name: "Pandæmonium: Abyssos (Savage)", expansion: "Endwalker", encounters: ["P5S", "P6S", "P7S", "P8S"] },
    { id: "asphodelos", name: "Pandæmonium: Asphodelos (Savage)", expansion: "Endwalker", encounters: ["P1S", "P2S", "P3S", "P4S"] },

    // Shadowbringers
    { id: "eden_promise", name: "Eden's Promise (Savage)", expansion: "Shadowbringers", encounters: ["E9S", "E10S", "E11S", "E12S"] },
    { id: "eden_verse", name: "Eden's Verse (Savage)", expansion: "Shadowbringers", encounters: ["E5S", "E6S", "E7S", "E8S"] },
    { id: "eden_gate", name: "Eden's Gate (Savage)", expansion: "Shadowbringers", encounters: ["E1S", "E2S", "E3S", "E4S"] },

    // Stormblood
    { id: "omega_alpha", name: "Omega: Alphascape (Savage)", expansion: "Stormblood", encounters: ["O9S", "O10S", "O11S", "O12S"] },
    { id: "omega_sigma", name: "Omega: Sigmascape (Savage)", expansion: "Stormblood", encounters: ["O5S", "O6S", "O7S", "O8S"] },
    { id: "omega_delta", name: "Omega: Deltascape (Savage)", expansion: "Stormblood", encounters: ["O1S", "O2S", "O3S", "O4S"] },

    // Heavensward
    { id: "alex_creator", name: "Alexander: The Creator (Savage)", expansion: "Heavensward", encounters: ["A9S", "A10S", "A11S", "A12S"] },
    { id: "alex_midas", name: "Alexander: Midas (Savage)", expansion: "Heavensward", encounters: ["A5S", "A6S", "A7S", "A8S"] },
    { id: "alex_gordias", name: "Alexander: Gordias (Savage)", expansion: "Heavensward", encounters: ["A1S", "A2S", "A3S", "A4S"] },

    // A Realm Reborn
    { id: "coil_final", name: "Final Coil of Bahamut", expansion: "A Realm Reborn", encounters: ["T10", "T11", "T12", "T13"] },
    { id: "coil_second", name: "Second Coil of Bahamut (Savage)", expansion: "A Realm Reborn", encounters: ["T6S", "T7S", "T8S", "T9S"] },
    { id: "coil_binding", name: "Binding Coil of Bahamut", expansion: "A Realm Reborn", encounters: ["T1", "T2", "T3", "T4", "T5"] }
];

// Tipos de conteúdo suportados — extensível para futuros conteúdos
const CONTENT_TYPES = [
    { id: "raid",     label: "Savage",   icon: "⚔️", getList: () => FFXIV_RAIDS },
    { id: "ultimate", label: "Ultimate", icon: "🌀", getList: () => FFXIV_ULTIMATES }
];
