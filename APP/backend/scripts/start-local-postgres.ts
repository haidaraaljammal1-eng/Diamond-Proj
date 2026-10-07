/**
 * CLI: starts project-local PostgreSQL (same as ensureLocalPostgres).
 */
import { ensureLocalPostgres } from "./ensure-local-postgres";

async function main(): Promise<void> {
  await ensureLocalPostgres();
  console.log("Next (first time only): npm run dev:postgres:setup-db && npm run dev:bootstrap");
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
