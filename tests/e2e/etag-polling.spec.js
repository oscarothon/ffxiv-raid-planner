// etag-polling.spec.js — Verify that subsequent /api/state polls return 304
// when the state hasn't changed (ETag round-trip works).
const { test, expect } = require("@playwright/test");
const { loginAsAdmin } = require("./helpers");

test("subsequent /api/state polls return 304 (ETag no-change)", async ({ page }) => {
  // Collect statuses of all GET /api/state responses
  const stateStatuses = [];
  page.on("response", (response) => {
    if (
      response.url().includes("/api/state") &&
      response.request().method() === "GET"
    ) {
      stateStatuses.push(response.status());
    }
  });

  // Log in as the shared admin account (created by auth.spec.js)
  await loginAsAdmin(page);

  // Wait for at least 2 full polling cycles (poll interval = 5 000 ms)
  // 11 s gives room for 2 polls after the initial load.
  await page.waitForTimeout(11_000);

  const initialLoads = stateStatuses.filter((s) => s === 200);
  const notModified = stateStatuses.filter((s) => s === 304);

  // Must have seen at least one successful initial load
  expect(initialLoads.length).toBeGreaterThanOrEqual(1);
  // Must have seen at least one 304 (ETag working)
  expect(notModified.length).toBeGreaterThanOrEqual(1);
});
