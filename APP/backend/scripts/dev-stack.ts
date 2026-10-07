/**
 * One command: local PostgreSQL + backend (document engines) + frontend.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { ensureLocalPostgres } from "./ensure-local-postgres";

const backendRoot = path.resolve(__dirname, "..");
const frontendRoot = path.resolve(backendRoot, "..", "frontend");

let backendChild: ChildProcess | undefined;
let frontendChild: ChildProcess | undefined;
let shuttingDown = false;

function killTree(proc: ChildProcess | undefined): void {
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
}

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  killTree(frontendChild);
  killTree(backendChild);
  process.exit(code);
}

async function main(): Promise<void> {
  await ensureLocalPostgres();

  const npmArgs = (script: string) =>
    process.platform === "win32"
      ? { command: "npm.cmd", args: ["run", script] }
      : { command: "npm", args: ["run", script] };

  const backendNpm = npmArgs("dev");
  backendChild = spawn(backendNpm.command, backendNpm.args, {
    cwd: backendRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, DEV_POSTGRES_ORCHESTRATE: "false" },
  });
  const frontendNpm = npmArgs("dev");
  frontendChild = spawn(frontendNpm.command, frontendNpm.args, {
    cwd: frontendRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));

  backendChild.on("exit", (code) => {
    if (!shuttingDown) shutdown(code ?? 1);
  });
  frontendChild.on("exit", (code) => {
    if (!shuttingDown) shutdown(code ?? 1);
  });
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  shutdown(1);
});
