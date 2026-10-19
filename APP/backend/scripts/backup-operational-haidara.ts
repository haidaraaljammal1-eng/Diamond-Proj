/**
 * Read-only pg_dump of operational haidara. Never targets haidara_test.
 */
import dotenv from "dotenv";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { extractPostgresDatabaseName } from "../src/lib/db/integration-database-guard";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const databaseUrl = process.env.DATABASE_URL ?? "";
const dbName = extractPostgresDatabaseName(databaseUrl);
if (dbName !== "haidara") {
  console.error(`Refusing backup: expected operational haidara, got ${dbName}`);
  process.exit(1);
}

function pgCliDatabaseUrl(databaseUrl: string): string {
  const withScheme =
    databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")
      ? databaseUrl
      : `postgresql://${databaseUrl}`;
  const parsed = new URL(withScheme);
  parsed.searchParams.delete("schema");
  return parsed.toString();
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dir = path.resolve(__dirname, "../backups");
fs.mkdirSync(dir, { recursive: true });
const outFile = path.join(dir, `haidara-${stamp}.dump`);
const dumpUrl = pgCliDatabaseUrl(databaseUrl);

execSync(`pg_dump --format=custom --file="${outFile}" "${dumpUrl}"`, {
  stdio: "inherit",
  env: process.env,
});

const stat = fs.statSync(outFile);
console.log(JSON.stringify({ database: dbName, path: outFile, bytes: stat.size, verified: stat.size > 0 }));
