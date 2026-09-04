/**
 * prisma/seed.ts — the `npx prisma db seed` entry point.
 *
 * Seeds the generic foundation only: permissions, the system_admin role,
 * notification definitions, complaint categories/SLA/routing templates and
 * integration catalog rows. It carries NO business demo data, so it is safe to
 * run in every environment, including production.
 */

import { runBaseSeed } from "./seed/index";

async function main() {
  console.log("[seed] base foundation…");
  await runBaseSeed();
  console.log("[seed] done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
