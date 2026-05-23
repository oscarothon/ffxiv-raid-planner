import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/frontend/**/*.test.js"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    setupFiles: ["tests/frontend/setup.js"],
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["js/**/*.js"],
    },
  },
});
