const { defineConfig, devices } = require("@playwright/test");
const path = require("node:path");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.js",

  // Give each test file enough time
  timeout: 30_000,
  expect: { timeout: 8_000 },

  // Run test files serially — they share the same SQLite DB
  workers: 1,
  fullyParallel: false,

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://127.0.0.1:5050",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    headless: true,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // Remove the stale DB before starting Flask so init_db() always runs on
    // a clean slate. The `rm -f` is safe — it silently does nothing if the
    // file does not exist.
    command: `rm -f ${path.resolve(__dirname, "tests/e2e/.tmp-e2e.db")} && .venv/bin/python -m flask --app server.app run --port 5050`,
    url: "http://127.0.0.1:5050",
    timeout: 30_000,
    reuseExistingServer: false,
    env: {
      DATABASE_PATH: path.resolve(__dirname, "tests/e2e/.tmp-e2e.db"),
      SECRET_KEY: "e2e-test-secret",
      FLASK_ENV: "development",
    },
    stderr: "pipe",
  },
});
