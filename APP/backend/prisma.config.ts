import path from "node:path";
import { defineConfig } from "prisma/config";

// Load .env for DATABASE_URL etc.
import "dotenv/config";

export default defineConfig({
  // Multi-file schema: every prisma/schema/*.prisma is merged.
  schema: path.join("prisma", "schema"),

  migrations: {
    path: path.join("prisma", "migrations"),
    // Plain `node` entry: works with dev deps (runs the TS sources via tsx) and in
    // a production image with only dist/ (runs the compiled seed). See seed.cjs.
    seed: "node prisma/seed.cjs",
  },

  datasource: {
    url: process.env.DATABASE_URL,
  },
});
