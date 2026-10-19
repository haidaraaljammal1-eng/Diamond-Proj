/**
 * Creates haidara_contamination_lab from a pg_dump custom backup (read-only on haidara).
 */
import { execSync } from "node:child_process";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { extractPostgresDatabaseName } from "../src/lib/db/integration-database-guard";

dotenv.config({ path: path.resolve(__dirname, "../.env") });
const dumpPath = process.argv[2];
if (!dumpPath || !fs.existsSync(dumpPath)) {
  console.error("Usage: tsx scripts/provision-contamination-lab.ts <path-to-haidara.dump>");
  process.exit(1);
}

const sourceUrl = process.env.DATABASE_URL ?? "";
if (extractPostgresDatabaseName(sourceUrl) !== "haidara") {
  console.error("Refusing: source DATABASE_URL must be haidara");
  process.exit(1);
}

const normalizedSource =
  sourceUrl.startsWith("postgres") ? sourceUrl : `postgresql://${sourceUrl}`;
const parsed = new URL(normalizedSource);
parsed.searchParams.delete("schema");
const labDb = "haidara_contamination_lab";
const host = parsed.hostname || "localhost";
const port = parsed.port || "5432";
const user = decodeURIComponent(parsed.username || "postgres");
const password = decodeURIComponent(parsed.password || "");

const pgEnv = { ...process.env, PGPASSWORD: password };

function run(cmd: string) {
  execSync(cmd, { shell: true, stdio: "inherit", env: pgEnv });
}

run(
  `dropdb --if-exists -h ${host} -p ${port} -U ${user} ${labDb}`,
);
run(`createdb -h ${host} -p ${port} -U ${user} ${labDb}`);

const labUrl = new URL(parsed.toString());
labUrl.pathname = `/${labDb}`;
run(`pg_restore --no-owner --no-acl --dbname="${labUrl.toString()}" "${dumpPath}"`);

console.log(JSON.stringify({ labDatabase: labDb, labUrl: labUrl.toString().replace(/:[^:@]+@/, ":***@") }));
