import dotenv from "dotenv";

/** Keep Playwright-injected DATABASE_URL when E2E helper scripts spawn backend tooling. */
const injectedDatabaseUrl = process.env.DATABASE_URL;
dotenv.config({ override: true });
if (injectedDatabaseUrl) {
  process.env.DATABASE_URL = injectedDatabaseUrl;
}
