// Global setup — intentionally empty.
//
// DB cleanup is done in playwright.config.js webServer.command (rm -f) so that
// the SQLite file is wiped BEFORE Flask's init_db() runs, guaranteeing a fresh
// schema on every test run.  (Playwright starts webServer plugins *before*
// globalSetup, so doing the rm here would wipe the already-initialised DB.)
module.exports = async function globalSetup() {};
