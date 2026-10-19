/**
 * Starts `next dev` on :3100 with API URL from `.env.development`.
 * Windows user-level NEXT_PUBLIC_API_URL often overrides Next `.env` files;
 * this script and `next.config.ts` both pin the repo file value for local dev.
 */
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function readEnvDevelopmentValue(key) {
  try {
    const raw = readFileSync(path.join(frontendRoot, ".env.development"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      if (trimmed.slice(0, eq).trim() !== key) continue;
      return trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

const env = { ...process.env };
const e2ePort = env.RBAC_E2E_API_PORT?.trim();
if (e2ePort) {
  env.NEXT_PUBLIC_API_URL = `http://127.0.0.1:${e2ePort}`;
} else {
  env.NEXT_PUBLIC_API_URL =
    readEnvDevelopmentValue("NEXT_PUBLIC_API_URL") ?? "http://localhost:8000";
}

const child = spawn("npx", ["next", "dev", "-p", "3100"], {
  stdio: "inherit",
  env,
  shell: true,
  cwd: frontendRoot,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
