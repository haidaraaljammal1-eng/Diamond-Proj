/**
 * Development entry: ensure local Document Engine HTTP services (Passport + Licence)
 * are up, then start the backend. Processes remain independent.
 */
import "dotenv/config";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureLocalPostgres } from "./ensure-local-postgres";

const backendRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendRoot, "..", "..");
const passportRoot = path.join(repoRoot, "DOCUMENT-ENGINE", "PASSPORT");
const licenseRoot = path.join(repoRoot, "DOCUMENT-ENGINE", "LICENSE");

const HEALTH_PATH = "/health";
const HEALTH_POLL_MS = 400;
const HEALTH_TIMEOUT_MS = 120_000;

let passportChild: ChildProcess | undefined;
let licenseChild: ChildProcess | undefined;
let backendChild: ChildProcess | undefined;
let shuttingDown = false;

function parseLocalApiTarget(
  envKey: string,
  defaultPort: number,
): { host: string; port: number; baseUrl: string } | null {
  const raw = process.env[envKey]?.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname;
  if (host !== "127.0.0.1" && host !== "localhost") return null;
  const port = url.port ? Number(url.port) : defaultPort;
  if (!Number.isFinite(port) || port <= 0) return null;
  return { host, port, baseUrl: `${url.protocol}//${host}:${port}` };
}

function shouldOrchestratePassport(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.PASSPORT_NUMBER_API_ORCHESTRATE === "false") return false;
  return parseLocalApiTarget("PASSPORT_NUMBER_API_URL", 8010) !== null;
}

function shouldOrchestrateLicense(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.UAE_DRIVING_LICENSE_API_ORCHESTRATE === "false") return false;
  return parseLocalApiTarget("UAE_DRIVING_LICENSE_API_URL", 8020) !== null;
}

function shouldOrchestratePostgres(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.DEV_POSTGRES_ORCHESTRATE === "false") return false;
  return true;
}

function resolvePython(venvRoot: string): string {
  const win = path.join(venvRoot, ".venv", "Scripts", "python.exe");
  const unix = path.join(venvRoot, ".venv", "bin", "python");
  if (fs.existsSync(win)) return win;
  if (fs.existsSync(unix)) return unix;
  throw new Error(`Python .venv not found under ${venvRoot}`);
}

async function fetchPassportHealth(baseUrl: string): Promise<boolean> {
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

async function fetchLicenseHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}${HEALTH_PATH}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { status?: string; service?: string };
    return body.status === "READY" && body.service === "uae-license-api";
  } catch {
    return false;
  }
}

async function waitForHealth(
  probe: () => Promise<boolean>,
  baseUrl: string,
  label: string,
): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await probe()) {
      console.log(`[dev] ${label} healthy at ${baseUrl}${HEALTH_PATH}`);
      return;
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  throw new Error(`[dev] ${label} did not become healthy within ${HEALTH_TIMEOUT_MS}ms`);
}

function spawnPassportApi(host: string, port: number): ChildProcess {
  const python = resolvePython(passportRoot);
  console.log(`[dev] Starting Passport Number API on ${host}:${port}…`);
  return spawn(
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
    { cwd: passportRoot, env: { ...process.env }, stdio: "inherit", windowsHide: true },
  );
}

function spawnLicenseApi(host: string, port: number): ChildProcess {
  const python = resolvePython(licenseRoot);
  console.log(`[dev] Starting UAE Driving Licence API on ${host}:${port}…`);
  return spawn(
    python,
    [
      "-m",
      "uvicorn",
      "services.uae_license_api.main:app",
      "--host",
      host,
      "--port",
      String(port),
    ],
    { cwd: licenseRoot, env: { ...process.env }, stdio: "inherit", windowsHide: true },
  );
}

async function ensurePassportApi(): Promise<void> {
  const target = parseLocalApiTarget("PASSPORT_NUMBER_API_URL", 8010);
  if (!target) return;
  if (await fetchPassportHealth(target.baseUrl)) {
    console.log(`[dev] Reusing healthy Passport API at ${target.baseUrl}`);
    return;
  }
  passportChild = spawnPassportApi(target.host, target.port);
  await waitForHealth(() => fetchPassportHealth(target.baseUrl), target.baseUrl, "Passport API");
}

async function ensureLicenseApi(): Promise<void> {
  const target = parseLocalApiTarget("UAE_DRIVING_LICENSE_API_URL", 8020);
  if (!target) return;
  if (await fetchLicenseHealth(target.baseUrl)) {
    console.log(`[dev] Reusing healthy Licence API at ${target.baseUrl}`);
    return;
  }
  licenseChild = spawnLicenseApi(target.host, target.port);
  await waitForHealth(() => fetchLicenseHealth(target.baseUrl), target.baseUrl, "Licence API");
}

function spawnBackend(): ChildProcess {
  const tsxCli = path.join(backendRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const entry = path.join(backendRoot, "src", "server.ts");
  return spawn(process.execPath, [tsxCli, "watch", entry], {
    cwd: backendRoot,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
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
  killTree(licenseChild);
  process.exit(code);
}

async function main(): Promise<void> {
  process.chdir(backendRoot);
  if (shouldOrchestratePostgres()) {
    await ensureLocalPostgres();
  }
  if (shouldOrchestratePassport()) {
    await ensurePassportApi();
  }
  if (shouldOrchestrateLicense()) {
    await ensureLicenseApi();
  }
  backendChild = spawnBackend();
  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));
  backendChild.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (signal) shutdown(1);
    shutdown(code ?? 0);
  });
  for (const [label, child] of [
    ["Passport API", passportChild],
    ["Licence API", licenseChild],
  ] as const) {
    if (!child) continue;
    child.on("exit", (code, signal) => {
      if (shuttingDown) return;
      console.error(
        `[dev] ${label} exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"})`,
      );
      shutdown(code ?? 1);
    });
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  shutdown(1);
});
