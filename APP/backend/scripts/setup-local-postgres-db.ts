/**
 * One-off local repair: ensure DATABASE_URL database exists on localhost Postgres.
 * Uses trust auth for first connection after fresh initdb.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL missing");
  process.exit(1);
}

const parsed = new URL(databaseUrl.replace(/^postgresql:/, "http:"));
const user = decodeURIComponent(parsed.username);
const pass = decodeURIComponent(parsed.password);
const db = decodeURIComponent(parsed.pathname.slice(1).split("?")[0] ?? "");

const psql = "C:/Program Files/PostgreSQL/15/bin/psql.exe";

function runPsql(sql: string, database = "postgres"): void {
  const result = spawnSync(
    psql,
    ["-h", "localhost", "-p", "5432", "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
}

const exists = spawnSync(
  psql,
  ["-h", "localhost", "-p", "5432", "-U", user, "-d", "postgres", "-tAc", `SELECT 1 FROM pg_database WHERE datname='${db.replace(/'/g, "''")}'`],
  { encoding: "utf8" },
);

if (!exists.stdout?.trim()) {
  runPsql(`CREATE DATABASE "${db.replace(/"/g, '""')}";`);
}

runPsql(`ALTER USER "${user.replace(/"/g, '""')}" WITH PASSWORD '${pass.replace(/'/g, "''")}';`);
console.log("Local PostgreSQL database is ready.");
