import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
const apiURL = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-en-desktop",
      testMatch: /driving-license-ocr\.spec\.ts/,
      timeout: 180_000,
      use: {
        ...devices["Desktop Chrome"],
        locale: "en-GB",
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-ar-desktop",
      testIgnore: /driving-license-ocr\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        locale: "ar-AE",
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  metadata: {
    playwrightApiUrl: apiURL,
  },
});
