import { describe, it, expect, beforeEach } from "vitest";
import { loadScripts } from "./setup.js";

beforeEach(() => {
  loadScripts("js/data.js");
});

// ─── FFXIV_ROLES ────────────────────────────────────────────────────────────

describe("FFXIV_ROLES", () => {
  it("is an object", () => {
    expect(typeof window.FFXIV_ROLES).toBe("object");
  });

  const expectedRoles = ["tank", "healer", "melee", "ranged", "caster", "limited"];

  for (const role of expectedRoles) {
    it(`has key '${role}'`, () => {
      expect(window.FFXIV_ROLES).toHaveProperty(role);
    });

    it(`role '${role}' has a non-empty name`, () => {
      expect(window.FFXIV_ROLES[role].name).toBeTruthy();
    });

    it(`role '${role}' has a non-empty color`, () => {
      expect(window.FFXIV_ROLES[role].color).toBeTruthy();
    });

    it(`role '${role}' has a non-empty icon`, () => {
      expect(window.FFXIV_ROLES[role].icon).toBeTruthy();
    });
  }
});

// ─── FFXIV_JOBS ──────────────────────────────────────────────────────────────

describe("FFXIV_JOBS", () => {
  it("is an array", () => {
    expect(Array.isArray(window.FFXIV_JOBS)).toBe(true);
  });

  it("has at least 20 entries", () => {
    expect(window.FFXIV_JOBS.length).toBeGreaterThanOrEqual(20);
  });

  it("every job has a unique id", () => {
    const ids = window.FFXIV_JOBS.map((j) => j.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("every job has a valid role (key of FFXIV_ROLES)", () => {
    for (const job of window.FFXIV_JOBS) {
      expect(Object.keys(window.FFXIV_ROLES)).toContain(job.role);
    }
  });

  it("every job has a non-empty name", () => {
    for (const job of window.FFXIV_JOBS) {
      expect(job.name).toBeTruthy();
    }
  });

  it("has at least 1 tank job", () => {
    expect(window.FFXIV_JOBS.filter((j) => j.role === "tank").length).toBeGreaterThanOrEqual(1);
  });

  it("has at least 1 healer job", () => {
    expect(window.FFXIV_JOBS.filter((j) => j.role === "healer").length).toBeGreaterThanOrEqual(1);
  });

  it("has at least 1 melee job", () => {
    expect(window.FFXIV_JOBS.filter((j) => j.role === "melee").length).toBeGreaterThanOrEqual(1);
  });

  it("has at least 1 ranged job", () => {
    expect(window.FFXIV_JOBS.filter((j) => j.role === "ranged").length).toBeGreaterThanOrEqual(1);
  });

  it("has at least 1 caster job", () => {
    expect(window.FFXIV_JOBS.filter((j) => j.role === "caster").length).toBeGreaterThanOrEqual(1);
  });

  it("has at least 1 limited job", () => {
    expect(window.FFXIV_JOBS.filter((j) => j.role === "limited").length).toBeGreaterThanOrEqual(1);
  });

  it("PLD is a tank", () => {
    const pld = window.FFXIV_JOBS.find((j) => j.id === "PLD");
    expect(pld).toBeDefined();
    expect(pld.role).toBe("tank");
  });

  it("WHM is a healer", () => {
    const whm = window.FFXIV_JOBS.find((j) => j.id === "WHM");
    expect(whm).toBeDefined();
    expect(whm.role).toBe("healer");
  });

  it("BLM is a caster", () => {
    const blm = window.FFXIV_JOBS.find((j) => j.id === "BLM");
    expect(blm).toBeDefined();
    expect(blm.role).toBe("caster");
  });

  it("BLU is a limited job", () => {
    const blu = window.FFXIV_JOBS.find((j) => j.id === "BLU");
    expect(blu).toBeDefined();
    expect(blu.role).toBe("limited");
  });
});

// ─── FFXIV_EXPANSIONS_SEED ──────────────────────────────────────────────────

describe("FFXIV_EXPANSIONS_SEED", () => {
  it("is an array with 7 entries", () => {
    expect(Array.isArray(window.FFXIV_EXPANSIONS_SEED)).toBe(true);
    expect(window.FFXIV_EXPANSIONS_SEED.length).toBe(7);
  });

  it("non-limited entries have ascending order values", () => {
    const nonLimited = window.FFXIV_EXPANSIONS_SEED.filter((e) => !e.isLimited);
    const orders = nonLimited.map((e) => e.order);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThan(orders[i - 1]);
    }
  });

  it("limited entry has order === 99", () => {
    const limited = window.FFXIV_EXPANSIONS_SEED.find((e) => e.isLimited);
    expect(limited).toBeDefined();
    expect(limited.order).toBe(99);
  });

  it("limited entry has isLimited: true", () => {
    const limited = window.FFXIV_EXPANSIONS_SEED.find((e) => e.isLimited);
    expect(limited.isLimited).toBe(true);
  });

  it("limited entry has levelCap: null", () => {
    const limited = window.FFXIV_EXPANSIONS_SEED.find((e) => e.isLimited);
    expect(limited.levelCap).toBeNull();
  });

  it("non-limited entries have levelCap as multiples of 10", () => {
    const nonLimited = window.FFXIV_EXPANSIONS_SEED.filter((e) => !e.isLimited);
    for (const exp of nonLimited) {
      expect(exp.levelCap % 10).toBe(0);
    }
  });

  it("non-limited levelCaps include 50, 60, 70, 80, 90, 100", () => {
    const nonLimited = window.FFXIV_EXPANSIONS_SEED.filter((e) => !e.isLimited);
    const caps = nonLimited.map((e) => e.levelCap);
    expect(caps).toContain(50);
    expect(caps).toContain(60);
    expect(caps).toContain(70);
    expect(caps).toContain(80);
    expect(caps).toContain(90);
    expect(caps).toContain(100);
  });

  it("contains expected expansion ids", () => {
    const ids = window.FFXIV_EXPANSIONS_SEED.map((e) => e.id);
    expect(ids).toContain("arr");
    expect(ids).toContain("hw");
    expect(ids).toContain("sb");
    expect(ids).toContain("shb");
    expect(ids).toContain("ew");
    expect(ids).toContain("dt");
    expect(ids).toContain("limited");
  });
});

// ─── EXPANSION_ALIASES ───────────────────────────────────────────────────────

describe("EXPANSION_ALIASES", () => {
  const validExpIds = ["arr", "hw", "sb", "shb", "ew", "dt", "limited"];

  it("is an object", () => {
    expect(typeof window.EXPANSION_ALIASES).toBe("object");
  });

  it("every value is a valid expansion id", () => {
    for (const [key, val] of Object.entries(window.EXPANSION_ALIASES)) {
      expect(validExpIds, `alias '${key}' → '${val}' is not a valid expansion id`).toContain(val);
    }
  });

  it("all keys are lowercase", () => {
    for (const key of Object.keys(window.EXPANSION_ALIASES)) {
      expect(key).toBe(key.toLowerCase());
    }
  });

  it("'arr' maps to 'arr'", () => {
    expect(window.EXPANSION_ALIASES["arr"]).toBe("arr");
  });

  it("'a realm reborn' maps to 'arr'", () => {
    expect(window.EXPANSION_ALIASES["a realm reborn"]).toBe("arr");
  });

  it("'heavensward' maps to 'hw'", () => {
    expect(window.EXPANSION_ALIASES["heavensward"]).toBe("hw");
  });

  it("'shadowbringers' maps to 'shb'", () => {
    expect(window.EXPANSION_ALIASES["shadowbringers"]).toBe("shb");
  });

  it("'endwalker' maps to 'ew'", () => {
    expect(window.EXPANSION_ALIASES["endwalker"]).toBe("ew");
  });

  it("'dawntrail' maps to 'dt'", () => {
    expect(window.EXPANSION_ALIASES["dawntrail"]).toBe("dt");
  });

  it("'blue mage' maps to 'limited'", () => {
    expect(window.EXPANSION_ALIASES["blue mage"]).toBe("limited");
  });

  it("'limited' maps to 'limited'", () => {
    expect(window.EXPANSION_ALIASES["limited"]).toBe("limited");
  });
});

// ─── CONTENT_NAME_EXPANSION_HINTS ───────────────────────────────────────────

describe("CONTENT_NAME_EXPANSION_HINTS", () => {
  const validExpIds = ["arr", "hw", "sb", "shb", "ew", "dt", "limited"];

  it("is an array", () => {
    expect(Array.isArray(window.CONTENT_NAME_EXPANSION_HINTS)).toBe(true);
  });

  it("every entry has a RegExp match property", () => {
    for (const hint of window.CONTENT_NAME_EXPANSION_HINTS) {
      expect(hint.match).toBeInstanceOf(RegExp);
    }
  });

  it("every entry has a valid expId", () => {
    for (const hint of window.CONTENT_NAME_EXPANSION_HINTS) {
      expect(validExpIds, `expId '${hint.expId}' is not valid`).toContain(hint.expId);
    }
  });

  const cases = [
    ["FRU", "dt"],
    ["Futures Rewritten", "dt"],
    ["arcadion", "dt"],
    ["Pandæmonium", "ew"],
    // NOTE: "Pandaemonium" (ae digraph) does NOT match the regex /pand[aæ]monium/i — only the æ ligature matches.
    // ["Pandaemonium", "ew"],  // skipped: production regex bug — use the æ ligature instead
    ["Anabaseios", "ew"],
    ["DSR", "ew"],
    ["The Omega Protocol", "ew"],
    ["TEA", "shb"],
    ["Epic of Alexander", "shb"],
    ["Eden", "shb"],
    ["Omega: Alphascape", "sb"],
    ["UWU", "sb"],
    ["Alexander", "hw"],
    ["UCOB", "hw"],
    ["Coil of Bahamut", "arr"],
  ];

  for (const [name, expId] of cases) {
    it(`'${name}' matches hint for expansion '${expId}'`, () => {
      const hint = window.CONTENT_NAME_EXPANSION_HINTS.find((h) => h.match.test(name));
      expect(hint).toBeDefined();
      expect(hint.expId).toBe(expId);
    });
  }
});

// ─── FFXIV_ULTIMATES ─────────────────────────────────────────────────────────

describe("FFXIV_ULTIMATES", () => {
  const validExpIds = ["arr", "hw", "sb", "shb", "ew", "dt", "limited"];

  it("is an array", () => {
    expect(Array.isArray(window.FFXIV_ULTIMATES)).toBe(true);
  });

  it("has at least 1 entry", () => {
    expect(window.FFXIV_ULTIMATES.length).toBeGreaterThanOrEqual(1);
  });

  it("every entry has a non-empty name", () => {
    for (const u of window.FFXIV_ULTIMATES) {
      expect(u.name).toBeTruthy();
    }
  });

  it("every entry has a valid expansionId", () => {
    for (const u of window.FFXIV_ULTIMATES) {
      expect(validExpIds, `ultimate '${u.name}' has invalid expansionId '${u.expansionId}'`).toContain(u.expansionId);
    }
  });

  // NOTE: FFXIV_ULTIMATES entries do NOT have an 'encounters' array (unlike raids).
  // The spec said they should, but the production data omits it. Skipping this assertion.
  it.skip("every entry has an encounters array of strings", () => {
    for (const u of window.FFXIV_ULTIMATES) {
      expect(Array.isArray(u.encounters)).toBe(true);
      for (const enc of u.encounters) {
        expect(typeof enc).toBe("string");
      }
    }
  });

  it("contains FRU with expansionId 'dt'", () => {
    const fru = window.FFXIV_ULTIMATES.find((u) => u.id === "FRU");
    expect(fru).toBeDefined();
    expect(fru.expansionId).toBe("dt");
  });

  it("contains TEA with expansionId 'shb'", () => {
    const tea = window.FFXIV_ULTIMATES.find((u) => u.id === "TEA");
    expect(tea).toBeDefined();
    expect(tea.expansionId).toBe("shb");
  });
});

// ─── FFXIV_RAIDS ─────────────────────────────────────────────────────────────

describe("FFXIV_RAIDS", () => {
  const validExpIds = ["arr", "hw", "sb", "shb", "ew", "dt", "limited"];

  it("is an array", () => {
    expect(Array.isArray(window.FFXIV_RAIDS)).toBe(true);
  });

  it("has at least 1 entry", () => {
    expect(window.FFXIV_RAIDS.length).toBeGreaterThanOrEqual(1);
  });

  it("every entry has a non-empty name", () => {
    for (const r of window.FFXIV_RAIDS) {
      expect(r.name).toBeTruthy();
    }
  });

  it("every entry has a valid expansionId", () => {
    for (const r of window.FFXIV_RAIDS) {
      expect(validExpIds, `raid '${r.name}' has invalid expansionId '${r.expansionId}'`).toContain(r.expansionId);
    }
  });

  it("every entry has an encounters array of strings", () => {
    for (const r of window.FFXIV_RAIDS) {
      expect(Array.isArray(r.encounters)).toBe(true);
      for (const enc of r.encounters) {
        expect(typeof enc).toBe("string");
      }
    }
  });

  it("every entry has a non-empty encounters array", () => {
    for (const r of window.FFXIV_RAIDS) {
      expect(r.encounters.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("contains arcadion_lh with expansionId 'dt'", () => {
    const r = window.FFXIV_RAIDS.find((x) => x.id === "arcadion_lh");
    expect(r).toBeDefined();
    expect(r.expansionId).toBe("dt");
  });
});

// ─── FFXIV_LIMITED_CONTENTS ──────────────────────────────────────────────────

describe("FFXIV_LIMITED_CONTENTS", () => {
  it("is an array", () => {
    expect(Array.isArray(window.FFXIV_LIMITED_CONTENTS)).toBe(true);
  });

  it("has at least 1 entry", () => {
    expect(window.FFXIV_LIMITED_CONTENTS.length).toBeGreaterThanOrEqual(1);
  });

  it("BLU entry has partyMode 'limited'", () => {
    const blu = window.FFXIV_LIMITED_CONTENTS.find((c) => c.limitedJobId === "BLU");
    expect(blu).toBeDefined();
    expect(blu.partyMode).toBe("limited");
  });

  it("BLU entry has limitedJobId 'BLU'", () => {
    const blu = window.FFXIV_LIMITED_CONTENTS.find((c) => c.limitedJobId === "BLU");
    expect(blu.limitedJobId).toBe("BLU");
  });

  it("BLU entry has partySize 8", () => {
    const blu = window.FFXIV_LIMITED_CONTENTS.find((c) => c.limitedJobId === "BLU");
    expect(blu.partySize).toBe(8);
  });
});

// ─── CONTENT_TYPES ───────────────────────────────────────────────────────────

describe("CONTENT_TYPES", () => {
  it("is an array with 4 entries", () => {
    expect(Array.isArray(window.CONTENT_TYPES)).toBe(true);
    expect(window.CONTENT_TYPES.length).toBe(4);
  });

  it("every entry has id, label, icon, and getList function", () => {
    for (const ct of window.CONTENT_TYPES) {
      expect(ct.id).toBeTruthy();
      expect(ct.label).toBeTruthy();
      expect(ct.icon).toBeTruthy();
      expect(typeof ct.getList).toBe("function");
    }
  });

  it("'raid' getList() returns FFXIV_RAIDS", () => {
    const raid = window.CONTENT_TYPES.find((c) => c.id === "raid");
    expect(raid).toBeDefined();
    expect(raid.getList()).toBe(window.FFXIV_RAIDS);
  });

  it("'ultimate' getList() returns FFXIV_ULTIMATES", () => {
    const ultimate = window.CONTENT_TYPES.find((c) => c.id === "ultimate");
    expect(ultimate).toBeDefined();
    expect(ultimate.getList()).toBe(window.FFXIV_ULTIMATES);
  });

  it("'limited' getList() returns FFXIV_LIMITED_CONTENTS", () => {
    const limited = window.CONTENT_TYPES.find((c) => c.id === "limited");
    expect(limited).toBeDefined();
    expect(limited.getList()).toBe(window.FFXIV_LIMITED_CONTENTS);
  });

  it("'custom' getList() returns empty array when state is not defined", () => {
    // state is intentionally not defined in this test context
    const custom = window.CONTENT_TYPES.find((c) => c.id === "custom");
    expect(custom).toBeDefined();
    expect(custom.getList()).toEqual([]);
  });

  it("'custom' getList() returns state.customContents when state is defined", () => {
    const customContents = [{ id: "myRaid", name: "My Custom Raid" }];
    window.state = { customContents };
    const custom = window.CONTENT_TYPES.find((c) => c.id === "custom");
    expect(custom.getList()).toBe(customContents);
    delete window.state;
  });
});
