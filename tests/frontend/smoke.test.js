import { describe, it, expect } from "vitest";
import { loadScripts } from "./setup.js";

describe("frontend test harness smoke", () => {
  it("loads js/data.js into window", () => {
    loadScripts("js/data.js");
    expect(window.FFXIV_JOBS).toBeDefined();
    expect(Array.isArray(window.FFXIV_JOBS)).toBe(true);
    expect(window.FFXIV_JOBS.length).toBeGreaterThan(10);
  });

  it("loads js/api.js into window", () => {
    loadScripts("js/api.js");
    expect(window.API).toBeDefined();
    expect(typeof window.API.login).toBe("function");
  });
});
