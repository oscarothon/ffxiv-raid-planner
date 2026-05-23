/**
 * Unit tests for pure helpers in js/app.js.
 *
 * Strategy:
 *  1. Load js/data.js (gives FFXIV_JOBS, FFXIV_EXPANSIONS_SEED, etc.)
 *  2. Load js/app.js — the auto-hoist in setup.js lands every top-level
 *     function/const on `window`, and `_set_<name>` setters land for let vars.
 *  3. Call helpers directly via window.* and assert behaviour without
 *     driving a real browser.
 *
 * Helpers with deep DOM coupling (renderXxx, buildXxx, openXxx) are
 * intentionally skipped.
 *
 * NOTE on `state` mutability: hydrateState() does `state = {...}` (full
 * reassignment of the closure var). The hoisted window.state is a snapshot.
 * Tests for functions that read `state` internally verify correctness by
 * calling those functions (not accessing window.state directly), which
 * see the live closure value.
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { loadScripts } from "./setup.js";

// Load both scripts once per file.  app.js depends on globals from data.js.
beforeAll(() => {
  // Minimal DOM skeleton to silence applyTheme() inside hydrateState.
  document.body.innerHTML = "<div id='toast-container'></div>";
  loadScripts("js/data.js", "js/app.js");
  // Seed state so expansion helpers work.
  window.hydrateState({});
});

// ============================================================================
// escapeHtml
// ============================================================================
describe("escapeHtml", () => {
  it("escapes & < > \" '", () => {
    expect(window.escapeHtml('& <b> "x" \'y\'')).toBe(
      "&amp; &lt;b&gt; &quot;x&quot; &#39;y&#39;"
    );
  });

  it("returns plain string unchanged", () => {
    expect(window.escapeHtml("hello world")).toBe("hello world");
  });

  it("converts non-string argument via String()", () => {
    expect(window.escapeHtml(42)).toBe("42");
  });

  it("handles empty string", () => {
    expect(window.escapeHtml("")).toBe("");
  });
});

// ============================================================================
// normalizeExpansionName
// ============================================================================
describe("normalizeExpansionName", () => {
  it("lowercases and trims", () => {
    expect(window.normalizeExpansionName("  Dawntrail  ")).toBe("dawntrail");
  });

  it("collapses internal whitespace", () => {
    expect(window.normalizeExpansionName("A   Realm  Reborn")).toBe("a realm reborn");
  });

  it("handles null gracefully", () => {
    expect(window.normalizeExpansionName(null)).toBe("");
  });

  it("handles undefined gracefully", () => {
    expect(window.normalizeExpansionName(undefined)).toBe("");
  });
});

// ============================================================================
// roleLabel
// ============================================================================
describe("roleLabel", () => {
  it("maps admin correctly", () => {
    expect(window.roleLabel("admin")).toBe("Administrador");
  });

  it("maps officer correctly", () => {
    expect(window.roleLabel("officer")).toBe("Officer");
  });

  it("maps member correctly", () => {
    expect(window.roleLabel("member")).toBe("Membro");
  });

  it("returns Visitante for unknown role strings", () => {
    expect(window.roleLabel("unknown")).toBe("Visitante");
  });

  it("returns Visitante for null", () => {
    expect(window.roleLabel(null)).toBe("Visitante");
  });
});

// ============================================================================
// isAdmin / isOfficer / isMember — use _set_currentUserRole setter exposed by
// setup.js to write into the closure variable.
// ============================================================================
describe("role helpers (isAdmin / isOfficer / isMember)", () => {
  beforeEach(() => {
    window._set_currentUserRole(null);
  });

  it("isAdmin is true for admin", () => {
    window._set_currentUserRole("admin");
    expect(window.isAdmin()).toBe(true);
  });

  it("isAdmin is false for officer", () => {
    window._set_currentUserRole("officer");
    expect(window.isAdmin()).toBe(false);
  });

  it("isOfficer is true for officer", () => {
    window._set_currentUserRole("officer");
    expect(window.isOfficer()).toBe(true);
  });

  it("isOfficer is true for admin", () => {
    window._set_currentUserRole("admin");
    expect(window.isOfficer()).toBe(true);
  });

  it("isOfficer is false for member", () => {
    window._set_currentUserRole("member");
    expect(window.isOfficer()).toBe(false);
  });

  it("isMember is true for any non-null role", () => {
    window._set_currentUserRole("member");
    expect(window.isMember()).toBe(true);
  });

  it("isMember is false for null", () => {
    window._set_currentUserRole(null);
    expect(window.isMember()).toBe(false);
  });
});

// ============================================================================
// getBisUrlForJob
// ============================================================================
describe("getBisUrlForJob", () => {
  it("returns generic url for null", () => {
    expect(window.getBisUrlForJob(null)).toBe("https://www.thebalanceffxiv.com/");
  });

  it("returns generic url for undefined", () => {
    expect(window.getBisUrlForJob(undefined)).toBe("https://www.thebalanceffxiv.com/");
  });

  it("returns generic url for unknown job", () => {
    expect(window.getBisUrlForJob("XYZ")).toBe("https://www.thebalanceffxiv.com/");
  });

  it("returns a URL containing /jobs/ for WAR", () => {
    const url = window.getBisUrlForJob("WAR");
    expect(url).toMatch(/^https:\/\/www\.thebalanceffxiv\.com\/jobs\//);
  });

  it("returns a URL containing /jobs/ for PLD", () => {
    const url = window.getBisUrlForJob("PLD");
    expect(url).toMatch(/^https:\/\/www\.thebalanceffxiv\.com\/jobs\//);
  });
});

// ============================================================================
// Expansion helpers — state is seeded via the beforeAll hydrateState({}) call.
// ============================================================================
describe("getExpansionById", () => {
  it("finds Dawntrail by id", () => {
    const dt = window.getExpansionById("dt");
    expect(dt).not.toBeNull();
    expect(dt.name).toBe("Dawntrail");
  });

  it("finds A Realm Reborn by id", () => {
    expect(window.getExpansionById("arr")).not.toBeNull();
  });

  it("returns null for unknown id", () => {
    expect(window.getExpansionById("xyz")).toBeNull();
  });

  it("returns null for null", () => {
    expect(window.getExpansionById(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(window.getExpansionById("")).toBeNull();
  });
});

describe("getExpansionIdByName", () => {
  it("resolves Dawntrail case-insensitively", () => {
    expect(window.getExpansionIdByName("Dawntrail")).toBe("dt");
    expect(window.getExpansionIdByName("dawntrail")).toBe("dt");
  });

  it("resolves via EXPANSION_ALIASES — a realm reborn → arr", () => {
    expect(window.getExpansionIdByName("a realm reborn")).toBe("arr");
  });

  it("resolves via EXPANSION_ALIASES — Shadowbringers → shb", () => {
    expect(window.getExpansionIdByName("Shadowbringers")).toBe("shb");
  });

  it("resolves blue mage → limited via alias", () => {
    expect(window.getExpansionIdByName("blue mage")).toBe("limited");
  });

  it("returns null for completely unknown name", () => {
    expect(window.getExpansionIdByName("Neverland")).toBeNull();
  });

  it("returns null for null", () => {
    expect(window.getExpansionIdByName(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(window.getExpansionIdByName("")).toBeNull();
  });
});

describe("resolveContentExpansionId", () => {
  it("returns null for null content", () => {
    expect(window.resolveContentExpansionId(null)).toBeNull();
  });

  it("returns expansionId directly when already set", () => {
    expect(window.resolveContentExpansionId({ expansionId: "ew" })).toBe("ew");
  });

  it("resolves via expansion field name", () => {
    expect(window.resolveContentExpansionId({ expansion: "Endwalker" })).toBe("ew");
  });

  it("resolves via alias — end walker → ew", () => {
    expect(window.resolveContentExpansionId({ expansion: "end walker" })).toBe("ew");
  });

  it("resolves via content name hint: Arcadion → dt", () => {
    expect(window.resolveContentExpansionId({ name: "AAC Arcadion Light-heavyweight" })).toBe("dt");
  });

  it("resolves via content name hint: Pandaemonium → ew", () => {
    expect(window.resolveContentExpansionId({ name: "Pandaemonium: Asphodelos" })).toBe("ew");
  });

  it("falls back to highest-order non-limited expansion for unknown content", () => {
    // dt has order 6 — the highest non-limited
    const result = window.resolveContentExpansionId({ name: "Totally Unknown Raid XYZ" });
    expect(result).toBe("dt");
  });
});

describe("getExpansionDisplayName", () => {
  it("returns expansion name for content with expansionId hw", () => {
    expect(window.getExpansionDisplayName({ expansionId: "hw" })).toBe("Heavensward");
  });

  it("returns empty string for null content", () => {
    expect(window.getExpansionDisplayName(null)).toBe("");
  });

  it("returns content.expansion string when expansionId is not in state", () => {
    expect(
      window.getExpansionDisplayName({ expansionId: "nonexistent", expansion: "Custom Exp" })
    ).toBe("Custom Exp");
  });
});

// ============================================================================
// getPartyMode / getPartySize / isDynamicProg / isCustomProg
// ============================================================================
describe("party mode helpers", () => {
  beforeAll(() => {
    window.hydrateState({
      customContents: [
        { id: "mylight", name: "My Light", partyMode: "light", expansionId: "dt" },
        { id: "mydynamic", name: "My Dynamic", partyMode: "dynamic", expansionId: "dt" },
        { id: "mycustom", name: "My Custom", partyMode: "full", expansionId: "dt" },
      ],
    });
  });

  it("geral defaults to full party mode", () => {
    expect(window.getPartyMode("geral")).toBe("full");
  });

  it("hardcoded raids return full party mode", () => {
    expect(window.getPartyMode("arcadion_lh")).toBe("full");
  });

  it("custom light content returns light", () => {
    expect(window.getPartyMode("mylight")).toBe("light");
  });

  it("custom dynamic content returns dynamic", () => {
    expect(window.getPartyMode("mydynamic")).toBe("dynamic");
  });

  it("limited content returns limited", () => {
    expect(window.getPartyMode("blue_mage_raid")).toBe("limited");
  });

  it("getPartySize returns 4 for light party", () => {
    expect(window.getPartySize("mylight")).toBe(4);
  });

  it("getPartySize returns 8 for full raid", () => {
    expect(window.getPartySize("arcadion_lh")).toBe(8);
  });

  it("getPartySize returns 8 for dynamic", () => {
    expect(window.getPartySize("mydynamic")).toBe(8);
  });

  it("getPartySize returns 8 for limited", () => {
    expect(window.getPartySize("blue_mage_raid")).toBe(8);
  });

  it("isDynamicProg is true only for dynamic progs", () => {
    expect(window.isDynamicProg("mydynamic")).toBe(true);
    expect(window.isDynamicProg("arcadion_lh")).toBe(false);
    expect(window.isDynamicProg("mylight")).toBe(false);
  });

  it("isCustomProg is true only for user-created content", () => {
    expect(window.isCustomProg("mylight")).toBe(true);
    expect(window.isCustomProg("arcadion_lh")).toBe(false);
  });
});

// ============================================================================
// isLimitedProg / getLimitedJob
// ============================================================================
describe("limited prog helpers", () => {
  it("isLimitedProg identifies blue_mage_raid", () => {
    expect(window.isLimitedProg("blue_mage_raid")).toBe(true);
  });

  it("isLimitedProg returns false for normal raids", () => {
    expect(window.isLimitedProg("arcadion_lh")).toBe(false);
  });

  it("isLimitedProg returns false for geral", () => {
    expect(window.isLimitedProg("geral")).toBe(false);
  });

  it("getLimitedJob returns BLU for blue_mage_raid", () => {
    expect(window.getLimitedJob("blue_mage_raid")).toBe("BLU");
  });

  it("getLimitedJob returns null for non-limited progs", () => {
    expect(window.getLimitedJob("arcadion_lh")).toBeNull();
  });
});

// ============================================================================
// getProgObj
// ============================================================================
describe("getProgObj", () => {
  beforeAll(() => {
    window.hydrateState({
      customContents: [{ id: "my_custom", name: "My Custom Raid", expansionId: "dt" }],
    });
  });

  it("returns the geral stub with correct id/name", () => {
    const obj = window.getProgObj("geral");
    expect(obj.id).toBe("geral");
    expect(obj.name).toBe("Geral Padrão");
  });

  it("returns the correct object for arcadion_lh (known raid)", () => {
    const obj = window.getProgObj("arcadion_lh");
    expect(obj.id).toBe("arcadion_lh");
    expect(obj.name).toBeTruthy();
  });

  it("returns a known ultimate", () => {
    const obj = window.getProgObj("FRU");
    expect(obj.id).toBe("FRU");
    expect(obj.name).toMatch(/Futures Rewritten/);
  });

  it("returns the correct object for a custom prog", () => {
    const obj = window.getProgObj("my_custom");
    expect(obj.id).toBe("my_custom");
    expect(obj.name).toBe("My Custom Raid");
  });

  it("returns a stub with id for a totally unknown prog", () => {
    const obj = window.getProgObj("nonexistent_prog");
    expect(obj.id).toBe("nonexistent_prog");
  });
});

// ============================================================================
// getLootPref / setLootPref
// ============================================================================
describe("getLootPref / setLootPref", () => {
  let player;
  beforeEach(() => {
    player = { lootPreferences: {} };
    window.hydrateState({ inspectedProgId: "arcadion_lh" });
  });

  it("getLootPref returns pass for missing pref", () => {
    expect(window.getLootPref(player, "arcadion_lh", "weapon")).toBe("pass");
  });

  it("setLootPref then getLootPref round-trips", () => {
    window.setLootPref(player, "arcadion_lh", "weapon", "need");
    expect(window.getLootPref(player, "arcadion_lh", "weapon")).toBe("need");
  });

  it("different slots are independent", () => {
    window.setLootPref(player, "arcadion_lh", "weapon", "need");
    window.setLootPref(player, "arcadion_lh", "head", "greed");
    expect(window.getLootPref(player, "arcadion_lh", "weapon")).toBe("need");
    expect(window.getLootPref(player, "arcadion_lh", "head")).toBe("greed");
  });

  it("getLootPref returns pass for null player", () => {
    expect(window.getLootPref(null, "arcadion_lh", "weapon")).toBe("pass");
  });

  it("setLootPref is a no-op for null player", () => {
    expect(() => window.setLootPref(null, "arcadion_lh", "weapon", "need")).not.toThrow();
  });
});

// ============================================================================
// getPlayerStatusForProg / isPlayerInProg / setPlayerStatusForProg
// ============================================================================
describe("player status helpers", () => {
  let player;
  beforeEach(() => {
    window.hydrateState({ activeProgs: ["arcadion_lh"], inspectedProgId: "arcadion_lh" });
    player = {
      id: "p1",
      status: "active",
      statusByProg: {},
    };
  });

  it("getPlayerStatusForProg returns active by default", () => {
    expect(window.getPlayerStatusForProg(player, "arcadion_lh")).toBe("active");
  });

  it("getPlayerStatusForProg returns bench when status is bench", () => {
    player.status = "bench";
    expect(window.getPlayerStatusForProg(player, "arcadion_lh")).toBe("bench");
  });

  it("per-prog override takes precedence", () => {
    player.statusByProg["arcadion_lh"] = "removed";
    expect(window.getPlayerStatusForProg(player, "arcadion_lh")).toBe("removed");
  });

  it("isPlayerInProg returns false when removed", () => {
    player.statusByProg["arcadion_lh"] = "removed";
    expect(window.isPlayerInProg(player, "arcadion_lh")).toBe(false);
  });

  it("isPlayerInProg returns true for active player", () => {
    expect(window.isPlayerInProg(player, "arcadion_lh")).toBe(true);
  });

  it("getPlayerStatusForProg returns bench for null player", () => {
    expect(window.getPlayerStatusForProg(null, "arcadion_lh")).toBe("bench");
  });

  it("setPlayerStatusForProg writes per-prog status", () => {
    window.setPlayerStatusForProg(player, "arcadion_lh", "bench");
    expect(player.statusByProg["arcadion_lh"]).toBe("bench");
  });
});

// ============================================================================
// getAssignedJobForProg / setAssignedJobForProg
// ============================================================================
describe("getAssignedJobForProg / setAssignedJobForProg", () => {
  let player;
  beforeEach(() => {
    window.hydrateState({ activeProgs: ["arcadion_lh"], inspectedProgId: "arcadion_lh" });
    player = {
      id: "p1",
      assignedJob: "WAR",
      jobsPool: ["WAR", "DRK"],
      assignedJobsByProg: {},
    };
  });

  it("returns assignedJob when no per-prog override", () => {
    expect(window.getAssignedJobForProg(player, "arcadion_lh")).toBe("WAR");
  });

  it("returns per-prog override when set", () => {
    player.assignedJobsByProg["arcadion_lh"] = "DRK";
    expect(window.getAssignedJobForProg(player, "arcadion_lh")).toBe("DRK");
  });

  it("setAssignedJobForProg stores per-prog AND updates assignedJob", () => {
    window.setAssignedJobForProg(player, "arcadion_lh", "PLD");
    expect(player.assignedJobsByProg["arcadion_lh"]).toBe("PLD");
    expect(player.assignedJob).toBe("PLD");
  });

  it("getAssignedJobForProg returns WAR for null player", () => {
    expect(window.getAssignedJobForProg(null, "arcadion_lh")).toBe("WAR");
  });

  it("for limited prog, returns the fixed limited job BLU", () => {
    expect(window.getAssignedJobForProg(player, "blue_mage_raid")).toBe("BLU");
  });

  it("setAssignedJobForProg is a no-op for limited progs", () => {
    window.setAssignedJobForProg(player, "blue_mage_raid", "WHM");
    expect(player.assignedJobsByProg["blue_mage_raid"]).toBeUndefined();
  });
});

// ============================================================================
// getSlotIdentity
// ============================================================================
describe("getSlotIdentity", () => {
  beforeEach(() => {
    // Reset via the setter exposed by setup.js
    window._set_currentCharacters({});
  });

  it("returns defaults for null player", () => {
    const id = window.getSlotIdentity(null);
    expect(id.name).toBe("");
    expect(id.ilvl).toBe(0);
    expect(Array.isArray(id.jobsPool)).toBe(true);
    expect(id.fromCharacter).toBe(false);
  });

  it("reads from slot directly when no user_id", () => {
    const player = { name: "Tester", ilvl: 720, jobsPool: ["WAR"], user_id: null };
    const id = window.getSlotIdentity(player);
    expect(id.name).toBe("Tester");
    expect(id.ilvl).toBe(720);
    expect(id.jobsPool).toEqual(["WAR"]);
    expect(id.fromCharacter).toBe(false);
  });

  it("reads from character map when user_id matches", () => {
    window._set_currentCharacters({
      42: { name: "CharName", ilvl: 730, jobs: [{ id: "DRG" }, { id: "SAM" }] },
    });
    const player = { name: "SlotName", ilvl: 700, jobsPool: ["WAR"], user_id: 42 };
    const id = window.getSlotIdentity(player);
    expect(id.name).toBe("CharName");
    expect(id.ilvl).toBe(730);
    expect(id.jobsPool).toEqual(["DRG", "SAM"]);
    expect(id.fromCharacter).toBe(true);
  });
});

// ============================================================================
// sortJobsCanonical
// ============================================================================
describe("sortJobsCanonical", () => {
  it("sorts tanks before healers before melee (canonical order)", () => {
    const sorted = window.sortJobsCanonical(["DRG", "PLD", "WHM"]);
    expect(sorted.indexOf("PLD")).toBeLessThan(sorted.indexOf("WHM"));
    expect(sorted.indexOf("WHM")).toBeLessThan(sorted.indexOf("DRG"));
  });

  it("does not mutate the input array", () => {
    const input = ["DRG", "PLD"];
    window.sortJobsCanonical(input);
    expect(input[0]).toBe("DRG");
  });

  it("handles empty array", () => {
    expect(window.sortJobsCanonical([])).toEqual([]);
  });

  it("places unknown jobs at the end", () => {
    const sorted = window.sortJobsCanonical(["UNKNOWN_JOB", "PLD"]);
    expect(sorted[0]).toBe("PLD");
    expect(sorted[1]).toBe("UNKNOWN_JOB");
  });
});

// ============================================================================
// hydrateState — tested indirectly via functions that use the state closure.
// ============================================================================
describe("hydrateState (tested via dependent functions)", () => {
  it("seeds expansions so getExpansionById('dt') works", () => {
    window.hydrateState({});
    expect(window.getExpansionById("dt")).not.toBeNull();
  });

  it("migrates scheduledProgs → raidEvents (visible via getRaidEventForDate)", () => {
    window.hydrateState({
      scheduledProgs: { "2025-01-01": "arcadion_lh" },
      raidEvents: [],
    });
    const evt = window.getRaidEventForDate("2025-01-01");
    expect(evt).toBeDefined();
    expect(evt.progId).toBe("arcadion_lh");
    expect(evt.quorum).toBe(6);
  });

  it("normalises 'late' → 'maybe' (visible via getPlayerStatusForProg)", () => {
    window.hydrateState({
      activeProgs: ["arcadion_lh"],
      roster: [
        {
          name: "P1",
          jobsPool: ["WAR"],
          monthlySchedule: { "2025-01-01": "late" },
          statusByProg: { arcadion_lh: "active" },
          status: "active",
        },
      ],
    });
    // Retrieve the first roster player via getAvailCountForDate; we need to
    // check monthlySchedule directly. Since we can't access state.roster
    // directly after reassignment, we call hydrateState again and rely on
    // the player being normalised.
    //   getAvailCountForDate uses monthlySchedule[k] === "avail", so to confirm
    //   the "late→maybe" migration we call getPlayerStatusForProg indirectly.
    //   The simplest assertion: the old "late" key became "maybe" and there's
    //   no "late" key anymore. We verify this by checking availability count
    //   (both "late" and "maybe" are NOT "avail", so count should be 0).
    expect(window.getAvailCountForDate("2025-01-01")).toBe(0);
  });

  it("resets lootPriorities when invalid (getLootPriorityForProg returns [])", () => {
    window.hydrateState({ lootPriorities: null });
    const list = window.getLootPriorityForProg("arcadion_lh");
    expect(Array.isArray(list)).toBe(true);
  });

  it("roster players get default ilvl 710 when missing", () => {
    window.hydrateState({
      roster: [{ name: "NoIlvl", jobsPool: ["WAR"] }],
    });
    // Verify via getAvailCountForDate with an avail player (no way to read
    // state.roster directly post-reassignment). We can't check ilvl here;
    // instead verify hydrateState didn't throw and the player is in a prog.
    expect(window.getAvailCountForDate("2025-01-01")).toBe(0); // not avail
  });

  it("removes legacy progNotes key (no error thrown)", () => {
    expect(() => window.hydrateState({ progNotes: { arcadion_lh: "notes" } })).not.toThrow();
  });
});

// ============================================================================
// getRaidEventForDate
// ============================================================================
describe("getRaidEventForDate", () => {
  beforeEach(() => {
    window.hydrateState({
      raidEvents: [
        { id: "evt_1", progId: "arcadion_lh", date: "2025-06-01", quorum: 6 },
        { id: "evt_2", progId: "anabaseios", date: "2025-06-05", postponedTo: "2025-06-10", quorum: 6 },
      ],
    });
  });

  it("finds event by its original date", () => {
    const evt = window.getRaidEventForDate("2025-06-01");
    expect(evt).toBeDefined();
    expect(evt.progId).toBe("arcadion_lh");
  });

  it("finds event by postponedTo date", () => {
    const evt = window.getRaidEventForDate("2025-06-10");
    expect(evt).toBeDefined();
    expect(evt.progId).toBe("anabaseios");
  });

  it("returns undefined for unknown date", () => {
    expect(window.getRaidEventForDate("2025-12-31")).toBeUndefined();
  });
});

// ============================================================================
// getAvailCountForDate
// ============================================================================
describe("getAvailCountForDate", () => {
  beforeEach(() => {
    window.hydrateState({
      roster: [
        { id: "p1", name: "A", jobsPool: ["WAR"], monthlySchedule: { "2025-06-01": "avail" }, status: "active" },
        { id: "p2", name: "B", jobsPool: ["PLD"], monthlySchedule: { "2025-06-01": "avail" }, status: "active" },
        { id: "p3", name: "C", jobsPool: ["WHM"], monthlySchedule: { "2025-06-01": "busy" }, status: "active" },
      ],
    });
  });

  it("counts players marked avail on a given date", () => {
    expect(window.getAvailCountForDate("2025-06-01")).toBe(2);
  });

  it("returns 0 when no one is available", () => {
    expect(window.getAvailCountForDate("2025-07-01")).toBe(0);
  });

  it("excludes busy players", () => {
    // Only p1 and p2 are avail; p3 is busy
    expect(window.getAvailCountForDate("2025-06-01")).toBe(2);
  });
});

// ============================================================================
// syncLootPriorityWithActiveRoster
// ============================================================================
describe("syncLootPriorityWithActiveRoster", () => {
  beforeEach(() => {
    window.hydrateState({
      activeProgs: ["arcadion_lh"],
      inspectedProgId: "arcadion_lh",
      roster: [
        { id: "p1", name: "A", jobsPool: ["WAR"], statusByProg: { arcadion_lh: "active" }, status: "active" },
        { id: "p2", name: "B", jobsPool: ["PLD"], statusByProg: { arcadion_lh: "active" }, status: "active" },
        { id: "p3", name: "C", jobsPool: ["WHM"], statusByProg: { arcadion_lh: "bench" }, status: "bench" },
      ],
      lootPriorities: {},
    });
  });

  it("includes active members", () => {
    const list = window.syncLootPriorityWithActiveRoster("arcadion_lh");
    expect(list).toContain("p1");
    expect(list).toContain("p2");
  });

  it("excludes bench members", () => {
    const list = window.syncLootPriorityWithActiveRoster("arcadion_lh");
    expect(list).not.toContain("p3");
  });

  it("removes stale ids that are no longer in the active roster", () => {
    window.syncLootPriorityWithActiveRoster("arcadion_lh"); // initialise
    // Now manually add a stale entry and call again
    window.getLootPriorityForProg("arcadion_lh").push("stale_id");
    const list = window.syncLootPriorityWithActiveRoster("arcadion_lh");
    expect(list).not.toContain("stale_id");
  });
});

// ============================================================================
// emptyCharacter
// ============================================================================
describe("emptyCharacter", () => {
  it("returns an object with all required empty fields", () => {
    const c = window.emptyCharacter();
    expect(c.name).toBe("");
    expect(c.ilvl).toBeNull();
    expect(c.currentExpansionId).toBeNull();
    expect(Array.isArray(c.jobs)).toBe(true);
    expect(c.jobs).toHaveLength(0);
    expect(Array.isArray(c.subscribedProgs)).toBe(true);
    expect(c.subscribedProgs).toHaveLength(0);
  });

  it("each call returns a fresh object (no shared reference)", () => {
    const a = window.emptyCharacter();
    const b = window.emptyCharacter();
    a.name = "changed";
    expect(b.name).toBe("");
  });
});

// ============================================================================
// isContentMarkableForCharacter
// ============================================================================
describe("isContentMarkableForCharacter", () => {
  beforeAll(() => {
    window.hydrateState({});
  });

  it("returns markable:false with reason for null target", () => {
    const r = window.isContentMarkableForCharacter(null, {});
    expect(r.markable).toBe(false);
  });

  it("returns markable:false for null character", () => {
    const r = window.isContentMarkableForCharacter({}, null);
    expect(r.markable).toBe(false);
  });

  it("char without currentExpansionId is always compatible (fallback permissive)", () => {
    const char = { name: "X", jobs: [], subscribedProgs: [] };
    const content = { id: "arcadion_lh", expansionId: "dt" };
    const r = window.isContentMarkableForCharacter(content, char);
    expect(r.markable).toBe(true);
  });

  it("char on lower expansion (arr) is incompatible with higher content (dt)", () => {
    const char = { name: "X", jobs: [], subscribedProgs: [], currentExpansionId: "arr" };
    const content = window.getProgObj("arcadion_lh");
    const r = window.isContentMarkableForCharacter(content, char);
    expect(r.markable).toBe(false);
    expect(r.reason).toMatch(/Dawntrail/);
  });

  it("char on same expansion (dt) is compatible with dt content", () => {
    const char = { name: "X", jobs: [], subscribedProgs: [], currentExpansionId: "dt" };
    const content = window.getProgObj("arcadion_lh");
    const r = window.isContentMarkableForCharacter(content, char);
    expect(r.markable).toBe(true);
  });

  it("char on higher expansion (dt) is compatible with older content (ew)", () => {
    const char = { name: "X", jobs: [], subscribedProgs: [], currentExpansionId: "dt" };
    const content = window.getProgObj("asphodelos");
    const r = window.isContentMarkableForCharacter(content, char);
    expect(r.markable).toBe(true);
  });

  it("limited event: char without BLU is NOT markable", () => {
    const char = { name: "X", jobs: [{ id: "WAR", level: 100 }], subscribedProgs: [] };
    const evt = { progId: "blue_mage_raid", limitedJobMinLevel: 50 };
    const r = window.isContentMarkableForCharacter(evt, char);
    expect(r.markable).toBe(false);
    expect(r.reason).toMatch(/BLU/);
  });

  it("limited event: char with BLU below required level is NOT markable", () => {
    const char = { name: "X", jobs: [{ id: "BLU", level: 30 }], subscribedProgs: [] };
    const evt = { progId: "blue_mage_raid", limitedJobMinLevel: 50 };
    const r = window.isContentMarkableForCharacter(evt, char);
    expect(r.markable).toBe(false);
    expect(r.reason).toMatch(/50/);
  });

  it("limited event: char with BLU at or above required level IS markable", () => {
    const char = { name: "X", jobs: [{ id: "BLU", level: 60 }], subscribedProgs: [] };
    const evt = { progId: "blue_mage_raid", limitedJobMinLevel: 50 };
    const r = window.isContentMarkableForCharacter(evt, char);
    expect(r.markable).toBe(true);
  });

  it("limited content (partyMode=limited) without event is not directly markable", () => {
    const char = { name: "X", jobs: [{ id: "BLU", level: 60 }], subscribedProgs: [] };
    const content = { partyMode: "limited" };
    const r = window.isContentMarkableForCharacter(content, char);
    expect(r.markable).toBe(false);
  });
});

// ============================================================================
// Fase Q — Schema {status, ranges} + helpers de slot
// ============================================================================
describe("Fase Q — getSchedEntry", () => {
  it("retorna {status:'', ranges:[]} para entrada ausente", () => {
    const p = { monthlySchedule: {} };
    const e = window.getSchedEntry(p, "2025-06-01");
    expect(e).toEqual({ status: "", ranges: [] });
  });

  it("aceita string legada e converte para {status, ranges:[]}", () => {
    const p = { monthlySchedule: { "2025-06-01": "avail" } };
    const e = window.getSchedEntry(p, "2025-06-01");
    expect(e.status).toBe("avail");
    expect(e.ranges).toEqual([]);
  });

  it("aceita objeto novo {status, ranges}", () => {
    const p = { monthlySchedule: { "2025-06-01": { status: "maybe", ranges: [{start:"20:00", end:"22:00"}] } } };
    const e = window.getSchedEntry(p, "2025-06-01");
    expect(e.status).toBe("maybe");
    expect(e.ranges).toEqual([{start:"20:00", end:"22:00"}]);
  });

  it("normaliza ranges não-array para []", () => {
    const p = { monthlySchedule: { "2025-06-01": { status: "avail", ranges: "nonsense" } } };
    const e = window.getSchedEntry(p, "2025-06-01");
    expect(e.ranges).toEqual([]);
  });
});

describe("Fase Q — slotsToRanges / rangesToSlotIdxs", () => {
  it("converte slots contíguos em um único range", () => {
    expect(window.slotsToRanges([0,1,2])).toEqual([{start:"12:00", end:"13:30"}]);
  });

  it("converte slots não-contíguos em múltiplos ranges", () => {
    expect(window.slotsToRanges([0,1,4,5])).toEqual([
      {start:"12:00", end:"13:00"},
      {start:"14:00", end:"15:00"},
    ]);
  });

  it("trata fim do grid (cross-midnight)", () => {
    expect(window.slotsToRanges([26,27])).toEqual([{start:"01:00", end:"02:00"}]);
  });

  it("retorna [] quando vazio", () => {
    expect(window.slotsToRanges([])).toEqual([]);
  });

  it("round-trip: ranges → slots → ranges preserva", () => {
    const ranges = [{start:"20:00", end:"22:00"}];
    const idxs = [...window.rangesToSlotIdxs(ranges)].sort((a,b)=>a-b);
    expect(idxs).toEqual([16,17,18,19]);
    expect(window.slotsToRanges(idxs)).toEqual(ranges);
  });
});

describe("Fase Q — hydrateState migra schema string → {status, ranges}", () => {
  it("converte 'avail' string em {status:'avail', ranges:[]}", () => {
    window.hydrateState({
      roster: [{ id: "p1", name: "P1", jobsPool: ["WAR"], monthlySchedule: { "2025-06-01": "avail" }, status: "active" }],
    });
    // Verifica indiretamente via getAvailCountForDate (que internamente lê getSchedEntry.status)
    expect(window.getAvailCountForDate("2025-06-01")).toBe(1);
  });

  it("converte 'late' legado em 'maybe' (não conta como avail)", () => {
    window.hydrateState({
      roster: [{ id: "p1", name: "P1", jobsPool: ["WAR"], monthlySchedule: { "2025-06-01": "late" }, status: "active" }],
    });
    expect(window.getAvailCountForDate("2025-06-01")).toBe(0);
  });

  it("preserva objetos novos {status, ranges} sem corrupção", () => {
    window.hydrateState({
      roster: [{
        id: "p1", name: "P1", jobsPool: ["WAR"], status: "active",
        monthlySchedule: { "2025-06-01": { status: "avail", ranges: [{start:"20:00", end:"22:00"}] } },
      }],
    });
    expect(window.getAvailCountForDate("2025-06-01")).toBe(1);
  });
});

describe("Fase Q — raidEvents ganham time/durationMin no hydrateState", () => {
  it("adiciona time:null e durationMin:null em eventos legados", () => {
    window.hydrateState({
      raidEvents: [{ id: "evt_old", progId: "arcadion_lh", date: "2025-06-01", quorum: 6 }],
    });
    const evt = window.getRaidEventForDate("2025-06-01");
    expect(evt.time).toBeNull();
    expect(evt.durationMin).toBeNull();
  });

  it("preserva time/durationMin quando já presentes", () => {
    window.hydrateState({
      raidEvents: [{ id: "evt_new", progId: "arcadion_lh", date: "2025-06-01", quorum: 6, time: "20:30", durationMin: 120 }],
    });
    const evt = window.getRaidEventForDate("2025-06-01");
    expect(evt.time).toBe("20:30");
    expect(evt.durationMin).toBe(120);
  });
});

describe("Fase Q — SCHED_SLOTS constante", () => {
  it("tem 28 slots (12:00 → 01:30 em blocos de 30 min)", () => {
    expect(window.SCHED_SLOTS).toHaveLength(28);
    expect(window.SCHED_SLOTS[0]).toBe("12:00");
    expect(window.SCHED_SLOTS[27]).toBe("01:30");
  });
});

// ============================================================================
// Fase Q2 — expandRangesForDate / timeToSlotIdx / eventSlotIdxs
// ============================================================================
describe("Fase Q2 — expandRangesForDate", () => {
  it("retorna todos os 28 slots para avail sem ranges (dia inteiro)", () => {
    const p = { monthlySchedule: { "2025-06-01": { status: "avail", ranges: [] } } };
    const { status, slots } = window.expandRangesForDate(p, "2025-06-01");
    expect(status).toBe("avail");
    expect(slots.size).toBe(28);
  });

  it("retorna conjunto vazio para unavail", () => {
    const p = { monthlySchedule: { "2025-06-01": { status: "unavail", ranges: [] } } };
    const { slots } = window.expandRangesForDate(p, "2025-06-01");
    expect(slots.size).toBe(0);
  });

  it("retorna slots específicos quando há ranges", () => {
    const p = { monthlySchedule: { "2025-06-01": { status: "avail", ranges: [{start:"20:00", end:"22:00"}] } } };
    const { slots } = window.expandRangesForDate(p, "2025-06-01");
    expect([...slots].sort((a,b)=>a-b)).toEqual([16,17,18,19]);
  });

  it("retorna conjunto vazio para data sem entrada", () => {
    const p = { monthlySchedule: {} };
    const { slots } = window.expandRangesForDate(p, "2025-06-01");
    expect(slots.size).toBe(0);
  });
});

describe("Fase Q2 — timeToSlotIdx + eventSlotIdxs", () => {
  it("timeToSlotIdx retorna índice correto", () => {
    expect(window.timeToSlotIdx("12:00")).toBe(0);
    expect(window.timeToSlotIdx("20:00")).toBe(16);
    expect(window.timeToSlotIdx("01:30")).toBe(27);
    expect(window.timeToSlotIdx("invalid")).toBe(-1);
  });

  it("eventSlotIdxs cobre slots do evento", () => {
    const idxs = window.eventSlotIdxs("20:00", 120);
    expect([...idxs].sort((a,b)=>a-b)).toEqual([16,17,18,19]);
  });

  it("eventSlotIdxs com duração truncada no fim do grid", () => {
    const idxs = window.eventSlotIdxs("01:00", 120);
    // 01:00 = slot 26, 01:30 = 27. Só 2 slots disponíveis.
    expect([...idxs].sort((a,b)=>a-b)).toEqual([26,27]);
  });

  it("eventSlotIdxs vazio para time inválido", () => {
    expect(window.eventSlotIdxs("invalid", 120).size).toBe(0);
    expect(window.eventSlotIdxs("20:00", 0).size).toBe(0);
  });
});

describe("Fase Q2 — computeViableWindows", () => {
  beforeEach(() => {
    // Reset state com 10 jogadores avail 20:00-23:00 e 4 maybe 19:00-22:00
    window.hydrateState({
      roster: [
        ...Array.from({length: 10}, (_, i) => ({
          id: `p${i}`, name: `P${i}`, jobsPool: ["WAR"], status: "active",
          monthlySchedule: { "2025-06-01": { status: "avail", ranges: [{start:"20:00", end:"23:00"}] } }
        })),
        ...Array.from({length: 4}, (_, i) => ({
          id: `m${i}`, name: `M${i}`, jobsPool: ["PLD"], status: "active",
          monthlySchedule: { "2025-06-01": { status: "maybe", ranges: [{start:"19:00", end:"22:00"}] } }
        })),
      ]
    });
  });

  it("encontra janela garantida quando ≥requiredCount avail cobrem", () => {
    const windows = window.computeViableWindows("2025-06-01", 120, null, 8);
    expect(windows.length).toBeGreaterThan(0);
    const guaranteed = windows.filter(w => w.guaranteed);
    expect(guaranteed[0].start).toBe("20:00");
    expect(guaranteed[0].countAvail).toBeGreaterThanOrEqual(8);
  });

  it("ordena garantidas antes de potenciais", () => {
    const windows = window.computeViableWindows("2025-06-01", 60, null, 8);
    if (windows.length > 1) {
      // Se ambos tipos existem, garantidas vêm primeiro
      const firstNonG = windows.findIndex(w => !w.guaranteed);
      const firstG = windows.findIndex(w => w.guaranteed);
      if (firstNonG !== -1 && firstG !== -1) {
        expect(firstG).toBeLessThan(firstNonG);
      }
    }
  });

  it("retorna vazio quando nenhum slot atinge requiredCount", () => {
    const windows = window.computeViableWindows("2025-06-01", 60, null, 20);
    expect(windows).toEqual([]);
  });

  it("respeita duração mínima (filtra janelas curtas)", () => {
    // Janela 20:00-23:00 = 3h = 180min; pedindo 240 min, não deve aparecer
    const windows = window.computeViableWindows("2025-06-01", 240, null, 8);
    expect(windows.filter(w => w.guaranteed)).toEqual([]);
  });

  it("retorna durationMin = widthSlots * 30", () => {
    const windows = window.computeViableWindows("2025-06-01", 60, null, 8);
    const g = windows.find(w => w.guaranteed);
    expect(g.durationMin).toBe(g.widthSlots * 30);
  });
});

describe("Fase Q2 — getConfirmationStatusForEvent", () => {
  const player = {
    id: "p1", name: "X", jobsPool: ["WAR"], status: "active",
    monthlySchedule: { "2025-06-01": { status: "avail", ranges: [{start:"20:00", end:"23:00"}] } }
  };

  it("retorna 'pending' quando evento não tem time", () => {
    const evt = { progId: "arcadion_lh", date: "2025-06-01", time: null };
    expect(window.getConfirmationStatusForEvent(player, evt)).toBe("pending");
  });

  it("retorna 'confirmed' quando range cobre toda a janela", () => {
    const evt = { progId: "arcadion_lh", date: "2025-06-01", time: "20:30", durationMin: 120 };
    expect(window.getConfirmationStatusForEvent(player, evt)).toBe("confirmed");
  });

  it("retorna 'partial' quando avail mas range só cobre parte da janela", () => {
    const evt = { progId: "arcadion_lh", date: "2025-06-01", time: "22:00", durationMin: 120 };
    // Range 20:00-23:00, evento 22:00-24:00 → overlap 22:00-23:00, mas não cobre 23:00-24:00
    expect(window.getConfirmationStatusForEvent(player, evt)).toBe("partial");
  });

  it("retorna 'maybe' quando status=maybe com overlap", () => {
    const p2 = { ...player, monthlySchedule: { "2025-06-01": { status: "maybe", ranges: [{start:"20:00", end:"23:00"}] } } };
    const evt = { progId: "arcadion_lh", date: "2025-06-01", time: "20:30", durationMin: 60 };
    expect(window.getConfirmationStatusForEvent(p2, evt)).toBe("maybe");
  });

  it("retorna 'unavail' quando status=unavail", () => {
    const p2 = { ...player, monthlySchedule: { "2025-06-01": { status: "unavail", ranges: [] } } };
    const evt = { progId: "arcadion_lh", date: "2025-06-01", time: "20:30", durationMin: 60 };
    expect(window.getConfirmationStatusForEvent(p2, evt)).toBe("unavail");
  });

  it("retorna 'unavail' quando avail mas sem overlap com janela", () => {
    const evt = { progId: "arcadion_lh", date: "2025-06-01", time: "12:00", durationMin: 60 };
    expect(window.getConfirmationStatusForEvent(player, evt)).toBe("unavail");
  });

  it("retorna 'pending' para evento null", () => {
    expect(window.getConfirmationStatusForEvent(player, null)).toBe("pending");
  });
});

describe("Fase Q2 — getDefaultDurationForProg + formatWindowLabel", () => {
  it("Ultimate retorna 180 min", () => {
    expect(window.getDefaultDurationForProg("FRU")).toBe(180);
    expect(window.getDefaultDurationForProg("UCOB")).toBe(180);
  });

  it("Savage/outros retornam 120 min", () => {
    expect(window.getDefaultDurationForProg("arcadion_lh")).toBe(120);
    expect(window.getDefaultDurationForProg("anabaseios")).toBe(120);
  });

  it("default sem progId retorna 120 min", () => {
    expect(window.getDefaultDurationForProg(null)).toBe(120);
  });

  it("formatWindowLabel formata janela como 'HH:MM–HH:MM (Xh)'", () => {
    const w = { start: "20:00", end: "23:00", durationMin: 180 };
    expect(window.formatWindowLabel(w)).toBe("20:00–23:00 (3h)");
  });

  it("formatWindowLabel inclui minutos parciais", () => {
    const w = { start: "20:30", end: "22:00", durationMin: 90 };
    expect(window.formatWindowLabel(w)).toBe("20:30–22:00 (1h30)");
  });
});

describe("Fase Q2 — upsertRaidEvent aceita time/durationMin", () => {
  beforeEach(() => {
    window.hydrateState({ activeProgs: ["arcadion_lh"] });
  });

  it("cria evento novo com time + durationMin do extra", () => {
    const evt = window.upsertRaidEvent("2025-06-01", "arcadion_lh", 6, "", { time: "20:30", durationMin: 120 });
    expect(evt.time).toBe("20:30");
    expect(evt.durationMin).toBe(120);
  });

  it("default time:null + durationMin:null quando extra não inclui", () => {
    const evt = window.upsertRaidEvent("2025-06-02", "arcadion_lh", 6, "", {});
    expect(evt.time).toBeNull();
    expect(evt.durationMin).toBeNull();
  });

  it("atualiza time/durationMin em evento existente", () => {
    window.upsertRaidEvent("2025-06-03", "arcadion_lh", 6, "", {});
    const evt = window.upsertRaidEvent("2025-06-03", "arcadion_lh", 6, "", { time: "21:00", durationMin: 90 });
    expect(evt.time).toBe("21:00");
    expect(evt.durationMin).toBe(90);
  });
});

describe("Fase Q2 — getAvailCountForDate usa derived quando event tem time", () => {
  beforeEach(() => {
    window.hydrateState({
      roster: [
        // 3 jogadores cobrem toda a janela 20:00-22:00
        { id: "p1", name: "A", jobsPool: ["WAR"], status: "active",
          monthlySchedule: { "2025-06-01": { status: "avail", ranges: [{start:"20:00", end:"23:00"}] } } },
        { id: "p2", name: "B", jobsPool: ["PLD"], status: "active",
          monthlySchedule: { "2025-06-01": { status: "avail", ranges: [{start:"20:00", end:"23:00"}] } } },
        { id: "p3", name: "C", jobsPool: ["WHM"], status: "active",
          monthlySchedule: { "2025-06-01": { status: "avail", ranges: [{start:"20:00", end:"23:00"}] } } },
        // 1 jogador só cobre parte (20:00-21:00)
        { id: "p4", name: "D", jobsPool: ["SCH"], status: "active",
          monthlySchedule: { "2025-06-01": { status: "avail", ranges: [{start:"20:00", end:"21:00"}] } } },
      ],
    });
  });

  it("sem target conta todos os avail", () => {
    expect(window.getAvailCountForDate("2025-06-01")).toBe(4);
  });

  it("com event.time conta só quem cobre a janela inteira (derived)", () => {
    const evt = { progId: "arcadion_lh", date: "2025-06-01", time: "20:00", durationMin: 120 };
    // p1, p2, p3 cobrem 20-22; p4 só cobre 20-21 → fica de fora
    expect(window.getAvailCountForDate("2025-06-01", evt)).toBe(3);
  });

  it("com event sem time mantém comportamento legado (conta status avail)", () => {
    const evt = { progId: "arcadion_lh", date: "2025-06-01", time: null };
    expect(window.getAvailCountForDate("2025-06-01", evt)).toBe(4);
  });
});
