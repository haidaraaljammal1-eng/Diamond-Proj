import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: /rbac-closure-page-guards\.spec\.ts/,
  use: {
    ...base.use,
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3111",
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
