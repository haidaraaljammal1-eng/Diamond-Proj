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
/** Sibling main checkout `.env.local` when integration worktree has no file (junctions break on files). */
const sharedEnvLocalPath = path.join(
  frontendRoot,
  "..",
  "..",
  "..",
  "Diamond-Proj",
  "APP",
  "frontend",
  ".env.local",
);

function readEnvFile(fileName, key) {
  try {
    const raw = readFileSync(path.join(frontendRoot, fileName), "utf8");
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

function readEnvDevelopmentValue(key) {
  return readEnvFile(".env.development", key);
}

function applyEnvFileAt(filePath, target) {
  try {
    const raw = readFileSync(filePath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const name = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (name) target[name] = value;
    }
  } catch {
    /* optional */
  }
}

function applyEnvFile(fileName, target) {
  applyEnvFileAt(path.join(frontendRoot, fileName), target);
}

function readLocalDevEnvValue(key) {
  return (
    readEnvFile(".env.development.local", key) ??
    readEnvFile(".env.local", key) ??
    readEnvDevelopmentValue(key)
  );
}

const env = { ...process.env };
applyEnvFile(".env.development.local", env);
applyEnvFile(".env.local", env);
applyEnvFileAt(sharedEnvLocalPath, env);

const e2ePort = env.RBAC_E2E_API_PORT?.trim();
const localApiProxy = readLocalDevEnvValue("NEXT_PUBLIC_API_PROXY") ?? env.NEXT_PUBLIC_API_PROXY;

if (e2ePort) {
  env.NEXT_PUBLIC_API_URL = `http://127.0.0.1:${e2ePort}`;
  env.RBAC_E2E_API_PROXY = "true";
} else {
  env.NEXT_PUBLIC_API_URL =
    readLocalDevEnvValue("NEXT_PUBLIC_API_URL") ?? "http://localhost:8000";
  if (localApiProxy === "true") {
    env.RBAC_E2E_API_PROXY = "true";
    try {
      const port = new URL(env.NEXT_PUBLIC_API_URL).port;
      if (port) env.RBAC_E2E_API_PORT = port;
    } catch {
      /* ignore */
    }
  }
}

// Webpack dev: Turbopack rejects junctioned `node_modules` on Windows worktrees.
const child = spawn("npx", ["next", "dev", "-p", "3100", "--webpack"], {
  stdio: "inherit",
  env,
  shell: true,
  cwd: frontendRoot,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
