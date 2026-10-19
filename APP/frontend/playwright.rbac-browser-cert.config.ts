import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /rbac-browser-cert\.spec\.ts/,
  timeout: 300_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3111",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "msedge-en",
      use: {
        ...devices["Desktop Edge"],
        channel: "msedge",
        locale: "en-GB",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
