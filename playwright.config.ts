import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
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
    timeout: 120_000,
  },
});
