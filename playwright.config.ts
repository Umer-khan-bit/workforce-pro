import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  reporter: "html",
  use: {
    baseURL: "http://localhost:7330",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npm run start:test",
    url: "http://localhost:7330",
    reuseExistingServer: !process.env.CI,
    // The test server must not run the scheduler (it would send reminders to the demo candidates) and uses its own address in links.
    env: { JOBS_AUTORUN: "false", APP_BASE_URL: "http://localhost:7330" },
    timeout: 120_000,
  },
});
