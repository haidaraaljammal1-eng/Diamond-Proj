/**
 * Ensures localhost:5432 is reachable — starts project-local cluster via pg_ctl when needed.
 * Used by `npm run dev` so PostgreSQL does not require a separate manual step after reboot.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const backendRoot = path.resolve(__dirname, "..");
const dataDir = path.join(backendRoot, ".local", "postgresql-data");
const logFile = path.join(backendRoot, ".local", "postgresql.log");

function pgBinForMajor(major: number): { pgCtl: string; initdb: string } | null {
  const pgCtl = `C:/Program Files/PostgreSQL/${major}/bin/pg_ctl.exe`;
  const initdb = `C:/Program Files/PostgreSQL/${major}/bin/initdb.exe`;
  if (fs.existsSync(pgCtl) && fs.existsSync(initdb)) {
    return { pgCtl, initdb };
  }
  return null;
}

function readDataMajorVersion(): number | null {
  const versionFile = path.join(dataDir, "PG_VERSION");
  if (!fs.existsSync(versionFile)) return null;
  const raw = fs.readFileSync(versionFile, "utf8").trim();
  const major = Number.parseInt(raw, 10);
  return Number.isFinite(major) ? major : null;
}

function resolvePgBin(): { pgCtl: string; initdb: string } {
  const pgCtlEnv = process.env.PG_CTL_PATH?.trim();
  const initdbEnv = process.env.PG_INITDB_PATH?.trim();
  if (pgCtlEnv && fs.existsSync(pgCtlEnv)) {
    const initdb =
      initdbEnv && fs.existsSync(initdbEnv)
        ? initdbEnv
        : path.join(path.dirname(pgCtlEnv), "initdb.exe");
    return { pgCtl: pgCtlEnv, initdb };
  }
  const existingMajor = readDataMajorVersion();
  if (existingMajor !== null) {
    const matched = pgBinForMajor(existingMajor);
    if (matched) return matched;
    throw new Error(
      `Local cluster is PostgreSQL ${existingMajor} but no matching install under Program Files. Set PG_CTL_PATH.`,
    );
  }
  for (const version of [18, 17, 16, 15]) {
    const bins = pgBinForMajor(version);
    if (bins) return bins;
  }
  throw new Error(
    "PostgreSQL pg_ctl not found. Install PostgreSQL 15+ or set PG_CTL_PATH in .env.",
  );
}

export function portOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port }, () => {
      socket.end();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(detail || `Command failed: ${command} ${args.join(" ")}`);
  }
}

/** Idempotent: no-op when something already listens on 5432. */
export async function ensureLocalPostgres(): Promise<void> {
  if (await portOpen(5432)) {
    return;
  }

  const { pgCtl, initdb } = resolvePgBin();

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log("[dev] Initializing local PostgreSQL data directory…");
    run(initdb, ["-D", dataDir, "-U", "postgres", "-A", "trust", "-E", "UTF8"]);
  }

  console.log("[dev] Starting local PostgreSQL on localhost:5432…");
  run(pgCtl, ["-D", dataDir, "-l", logFile, "-o", "-p 5432", "start"]);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await portOpen(5432)) {
      console.log("[dev] PostgreSQL ready on localhost:5432.");
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error(`PostgreSQL did not become ready on port 5432. See: ${logFile}`);
}
