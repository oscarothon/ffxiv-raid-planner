// pending-approval.spec.js — Second user is placed in pending; admin approves;
// then the second user can log in successfully.
const { test, expect } = require("@playwright/test");
const { register, login, logout, waitForLoggedIn, loginAsAdmin, SHARED_ADMIN } = require("./helpers");

test("second user goes pending, admin approves, second user can log in", async ({ page }) => {
  // Use a unique suffix for the member so this test is idempotent
  const suffix = Date.now();
  const memberName = `member_pa_${suffix}`;

  // --- 1. Log in as admin (shared account created by auth.spec.js) ---
  await loginAsAdmin(page);
  await logout(page);

  // --- 2. Register second user — should return 202 pending ---
  // (admin already exists, so this user goes to pending)
  const memberRes = await register(page, memberName);
  expect(memberRes.status()).toBe(202);

  // App shows a "Solicitação enviada! Aguarde aprovação..." message
  const authErr = page.locator("#auth-error");
  await expect(authErr).toBeVisible();
  const errText = await authErr.textContent();
  expect(errText).toMatch(/aguard|solicitação/i);

  // --- 3. Login as admin ---
  const adminLoginRes = await login(page, SHARED_ADMIN.username, SHARED_ADMIN.password);
  expect(adminLoginRes.status()).toBe(200);
  await waitForLoggedIn(page);

  // --- 4. Open the members modal to find and approve the pending user ---
  await page.waitForSelector("#btn-manage-members:not([hidden])");
  await page.click("#btn-manage-members");

  // Members modal should open
  await page.waitForSelector("#modal-members:not([hidden])");

  // pending-approve button for the member should exist
  const approveBtn = page.locator(`.pending-approve[data-name="${memberName}"]`);
  await expect(approveBtn).toBeVisible({ timeout: 8000 });

  // Click Approve and wait for the API call
  const [approveRes] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/pending/") && r.url().includes("/approve")
    ),
    approveBtn.click(),
  ]);
  expect(approveRes.status()).toBe(200);

  // The approve button should disappear after approval
  await expect(approveBtn).not.toBeVisible({ timeout: 6000 });

  // Close the members modal
  await page.click(".btn-close-modal[data-target='modal-members']");

  // --- 5. Logout admin ---
  await logout(page);

  // --- 6. Login as the now-approved second user ---
  const memberLoginRes = await login(page, memberName);
  expect(memberLoginRes.status()).toBe(200);
  await waitForLoggedIn(page);

  const pillName = await page.textContent("#user-pill-name");
  expect(pillName).toContain(memberName);

  // A plain member's role pill shows "Membro" (not "Administrador")
  // We use the role label element which is not affected by the CSS display override
  // that affects .ff-btn-small buttons.
  await page.waitForSelector("#user-pill-role:not([hidden])", { timeout: 5000 });
  const roleText = await page.textContent("#user-pill-role");
  expect(roleText).toBe("Membro");
  // Also verify the admin-manage-members button is NOT the admin role
  expect(roleText).not.toBe("Administrador");
});
