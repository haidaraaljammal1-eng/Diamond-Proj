/**
 * Official development database bootstrap.
 *
 * Applies existing migrations, regenerates Prisma Client, runs the idempotent
 * core seed, then seeds the 20 Demo Fleet vehicles if missing.
 *
 * Never resets the database. Never deletes user-created vehicles.
 * Refuses to run against production / non-local databases.
 *
 * Run: npm run dev:bootstrap
 */
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import {
  assertDevelopmentDatabase,
  formatSafeDatabaseTarget,
} from "src/lib/dev/development-database";
import {
  assertBootstrappedState,
  collectDevelopmentHealth,
  printDevelopmentHealth,
  type DevelopmentHealth,
} from "src/lib/dev/development-health";

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`[dev:bootstrap] command failed: ${command} ${args.join(" ")}`);
  }
}

function readMigrationStatus(): DevelopmentHealth["migrations"] {
  const result = spawnSync("npx", ["prisma", "migrate", "status"], {
    encoding: "utf8",
    shell: true,
    cwd: process.cwd(),
    env: process.env,
  });
  const text = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (/up to date/i.test(text)) return "UP TO DATE";
  if (/not yet been applied|have not yet been applied|pending/i.test(text)) {
    return "PENDING";
  }
  return "UNKNOWN";
}

async function main(): Promise<void> {
  const target = assertDevelopmentDatabase({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL,
  });

  console.log("");
  console.log("Development database:");
  console.log(`  ${formatSafeDatabaseTarget(target)}`);
  console.log(`  Environment: ${env.NODE_ENV}`);
  console.log("");

  console.log("[1/5] Applying existing Prisma migrations (deploy only)…");
  run("npx", ["prisma", "migrate", "deploy"]);

  console.log("[2/5] Generating Prisma Client…");
  run("npm", ["run", "db:generate"]);

  console.log("[3/5] Core idempotent seed (permissions, system_admin, …)…");
  run("npm", ["run", "db:seed"]);

  console.log("[4/5] Demo Fleet seed (DEMO-FLEET-01..20, create-missing)…");
  run("npm", ["run", "db:seed:demo"]);

  console.log("[5/5] Verifying development state…");
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);
  try {
    const health = await collectDevelopmentHealth(
      prisma as unknown as PrismaClient,
      {
        host: `${target.host}:${target.port}`,
        database: target.database,
        environment: env.NODE_ENV,
      },
      readMigrationStatus(),
    );
    printDevelopmentHealth(health);
    assertBootstrappedState(health);
  } finally {
    await prisma.$disconnect();
  }

  console.log("");
  console.log("[dev:bootstrap] ready. User-created vehicles were not deleted.");
  console.log("Next: npm run dev");
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
