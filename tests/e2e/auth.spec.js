// auth.spec.js — Registration of the first user auto-promotes to admin.
// This spec runs first (alphabetically) so it creates the shared admin account.
const { test, expect } = require("@playwright/test");
const { register, waitForLoggedIn, SHARED_ADMIN } = require("./helpers");

test("first registered user becomes admin and sees admin-only UI", async ({ page }) => {
  await page.goto("/");

  // Register with the shared admin credentials so other specs can log in with them.
  const res = await register(page, SHARED_ADMIN.username, SHARED_ADMIN.password);

  // Registration should succeed (200) — this is the first user so it becomes admin.
  expect(res.status()).toBe(200);

  // After registration, modal should close and user pill should appear
  await waitForLoggedIn(page);

  // User pill shows the username
  const pillName = await page.textContent("#user-pill-name");
  expect(pillName).toContain(SHARED_ADMIN.username);

  // Admin-only "Membros" button must be visible
  await expect(page.locator("#btn-manage-members")).toBeVisible();

  // Officer+ "Conteúdos" button must be visible
  await expect(page.locator("#btn-manage-contents")).toBeVisible();

  // Logout button must be visible
  await expect(page.locator("#btn-logout")).toBeVisible();
});
