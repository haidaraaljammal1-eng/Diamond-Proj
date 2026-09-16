/**
 * Read-only development database health check.
 *
 * Does not migrate, seed, generate, or delete anything.
 *
 * Run: npm run dev:check
 */
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "src/config/env";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";
import {
  formatSafeDatabaseTarget,
  parseDatabaseTarget,
} from "src/lib/dev/development-database";
import {
  collectDevelopmentHealth,
  printDevelopmentHealth,
  type DevelopmentHealth,
} from "src/lib/dev/development-health";

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
  const target = parseDatabaseTarget(env.DATABASE_URL);
  console.log("");
  console.log("Development database:");
  console.log(`  ${formatSafeDatabaseTarget(target)}`);
  console.log(`  Environment: ${env.NODE_ENV}`);
  console.log("");

  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter }).$extends(normalizedNameExtension);

  try {
    await prisma.$connect();
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

    if (health.demoFleet.found < health.demoFleet.expected) {
      console.log("");
      console.log("Development database is not fully bootstrapped.");
      console.log("Run:");
      console.log("  npm run dev:bootstrap");
    }
  } catch (err) {
    console.log("Database:            DISCONNECTED");
    console.log(`Environment:         ${env.NODE_ENV}`);
    console.log(`Development database: ${formatSafeDatabaseTarget(target)}`);
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main();
