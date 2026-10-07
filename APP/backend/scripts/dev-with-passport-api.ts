/**
 * Development entry: ensure local Passport Number API is up, then start the backend.
 *
 * Production uses `npm start` (no Python orchestration).
 * Opt out: PASSPORT_NUMBER_API_ORCHESTRATE=false
 */
import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..", "..");
const passportRoot = path.join(repoRoot, "DOCUMENT-ENGINE", "PASSPORT");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8010;
const HEALTH_PATH = "/health";
const HEALTH_POLL_MS = 400;
const HEALTH_TIMEOUT_MS = 120_000;

let passportChild: ChildProcess | undefined;
let backendChild: ChildProcess | undefined;
let shuttingDown = false;

function parseLocalPassportApiTarget(): { host: string; port: number; baseUrl: string } | null {
  const raw = process.env.PASSPORT_NUMBER_API_URL?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname;
  if (host !== "127.0.0.1" && host !== "localhost") return null;
  const port = url.port ? Number(url.port) : DEFAULT_PORT;
  if (!Number.isFinite(port) || port <= 0) return null;
  const baseUrl = `${url.protocol}//${host}:${port}`;
  return { host, port, baseUrl };
}

function shouldOrchestrate(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.PASSPORT_NUMBER_API_ORCHESTRATE === "false") return false;
  return parseLocalPassportApiTarget() !== null;
}

function resolvePassportPython(): string {
  const win = path.join(passportRoot, ".venv", "Scripts", "python.exe");
  const unix = path.join(passportRoot, ".venv", "bin", "python");
  if (fs.existsSync(win)) return win;
  if (fs.existsSync(unix)) return unix;
  throw new Error(
    `Passport .venv not found under ${passportRoot}. Create it per DOCUMENT-ENGINE/README.md`,
  );
}

async function fetchHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as {
      status?: string;
      service?: string;
      engine?: string;
    };
    return (
      body.status === "ok" &&
      body.service === "passport-number-api" &&
      body.engine === "passport_number_frozen"
    );
  } catch {
    return false;
  }
}

async function waitForHealth(baseUrl: string, label: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await fetchHealth(baseUrl)) {
      console.log(`[dev] ${label} healthy at ${baseUrl}${HEALTH_PATH}`);
      return;
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  throw new Error(`[dev] Passport API did not become healthy within ${HEALTH_TIMEOUT_MS}ms`);
}

function spawnPassportApi(host: string, port: number): ChildProcess {
  const python = resolvePassportPython();
  if (!fs.existsSync(path.join(passportRoot, "services", "passport_number_api", "main.py"))) {
    throw new Error(`Passport API package missing under ${passportRoot}`);
  }
  console.log(`[dev] Starting Passport Number API on ${host}:${port}…`);
  const child = spawn(
    python,
    [
      "-m",
      "uvicorn",
      "services.passport_number_api.main:app",
      "--host",
      host,
      "--port",
      String(port),
    ],
    {
      cwd: passportRoot,
      env: { ...process.env },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  child.on("error", (err) => {
    console.error("[dev] Passport API process error:", err);
  });
  return child;
}

async function ensurePassportApi(): Promise<void> {
  const target = parseLocalPassportApiTarget();
  if (!target) return;

  if (await fetchHealth(target.baseUrl)) {
    console.log(`[dev] Reusing healthy Passport API at ${target.baseUrl}`);
    return;
  }

  passportChild = spawnPassportApi(target.host, target.port);
  await waitForHealth(target.baseUrl, "Passport API");
}

function spawnBackend(): ChildProcess {
  const tsxCli = path.join(backendRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const entry = path.join(backendRoot, "src", "server.ts");
  const child = spawn(process.execPath, [tsxCli, "watch", entry], {
    cwd: backendRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("error", (err) => {
    console.error("[dev] Backend process error:", err);
  });
  return child;
}

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  const killTree = (proc: ChildProcess | undefined) => {
    if (!proc?.pid) return;
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } else {
        proc.kill("SIGTERM");
      }
    } catch {
      /* ignore */
    }
  };
  killTree(backendChild);
  killTree(passportChild);
  process.exit(code);
}

async function main(): Promise<void> {
  process.chdir(backendRoot);

  if (shouldOrchestrate()) {
    await ensurePassportApi();
  } else if (process.env.PASSPORT_NUMBER_API_URL?.trim()) {
    console.log(
      "[dev] Passport API orchestration skipped (non-local URL, production, or PASSPORT_NUMBER_API_ORCHESTRATE=false)",
    );
  }

  backendChild = spawnBackend();

  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));
  backendChild.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (signal) shutdown(1);
    shutdown(code ?? 0);
  });
  if (passportChild) {
    passportChild.on("exit", (code, signal) => {
      if (shuttingDown) return;
      console.error(
        `[dev] Passport API exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"})`,
      );
      shutdown(code ?? 1);
    });
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  shutdown(1);
});
