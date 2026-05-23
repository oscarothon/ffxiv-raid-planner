// Shared helpers for E2E tests (CommonJS)

// Fixed credentials for the shared admin account.
// auth.spec.js creates this account (first registration = admin).
// All other specs log in with these credentials.
const SHARED_ADMIN = { username: "e2e_admin", password: "e2e_password_123" };

/**
 * Open the auth modal's Register tab, fill the form, and submit.
 * Returns the API Response object.
 */
async function register(page, username, password = "secret123") {
  // Wait for the auth modal to be visible (app shows it on load when not logged in)
  await page.waitForSelector("#modal-auth:not([hidden])", { timeout: 8000 });

  // Switch to Register tab
  await page.click("#btn-show-register");
  await page.waitForSelector("#auth-register-area:not([hidden])");

  await page.fill("#reg-username", username);
  await page.fill("#reg-password", password);

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/register")),
    page.click("#btn-auth-register"),
  ]);

  return response;
}

/**
 * Switch to the Login tab and log in.
 * Assumes the auth modal is already visible or navigates to "/" to trigger it.
 */
async function login(page, username, password = "secret123") {
  // If the modal is hidden, navigate to get it back
  const isHidden = await page.$eval("#modal-auth", (el) => el.hidden).catch(() => true);
  if (isHidden) {
    await page.goto("/");
    await page.waitForSelector("#modal-auth:not([hidden])", { timeout: 8000 });
  }

  // Switch to Login tab
  await page.click("#btn-show-login");
  await page.waitForSelector("#auth-login-area:not([hidden])");

  await page.fill("#login-username", username);
  await page.fill("#login-password", password);

  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/login")),
    page.click("#btn-auth-login"),
  ]);

  return response;
}

/**
 * Logout via the user pill button.
 */
async function logout(page) {
  await page.waitForSelector("#user-pill:not([hidden])", { timeout: 8000 });
  await page.click("#btn-logout");
  // Wait for the auth modal to reappear
  await page.waitForSelector("#modal-auth:not([hidden])", { timeout: 8000 });
}

/**
 * Wait until the user pill (logged-in indicator) is visible.
 */
async function waitForLoggedIn(page) {
  await page.waitForSelector("#user-pill:not([hidden])", { timeout: 8000 });
}

/**
 * Login as the shared admin account. If the account is not created yet,
 * register it (first user = admin). If the account already exists, just log in.
 */
async function loginAsAdmin(page) {
  await page.goto("/");
  await page.waitForSelector("#modal-auth:not([hidden])", { timeout: 8000 });

  // Try to log in first (account may already exist from a previous test)
  const loginRes = await login(page, SHARED_ADMIN.username, SHARED_ADMIN.password);
  if (loginRes.status() === 200) {
    await waitForLoggedIn(page);
    return loginRes;
  }

  // Login failed — might not be registered yet; try registering
  await page.goto("/");
  await page.waitForSelector("#modal-auth:not([hidden])", { timeout: 8000 });
  const regRes = await register(page, SHARED_ADMIN.username, SHARED_ADMIN.password);
  if (regRes.status() === 200) {
    await waitForLoggedIn(page);
    return regRes;
  }

  throw new Error(
    `Could not set up admin account. register=${regRes.status()}`
  );
}

module.exports = { register, login, logout, waitForLoggedIn, loginAsAdmin, SHARED_ADMIN };
