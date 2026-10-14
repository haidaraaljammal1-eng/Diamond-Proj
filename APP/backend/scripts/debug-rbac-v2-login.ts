import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const backendRoot = path.resolve(__dirname, "..");
const frontendRoot = path.resolve(backendRoot, "../frontend");
const manifestPath = path.join(backendRoot, ".local/rbac-v2-e2e.manifest.json");

function killChild(child: ChildProcess | null) {
  if (child && !child.killed) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
}

async function waitHttp(url: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    databaseUrl: string;
  };
  const apiPort = 8030;
  const webPort = 3130;
  const backend = spawn("npm", ["run", "dev:server-only"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(apiPort),
      DATABASE_URL: manifest.databaseUrl,
      FUNCTIONAL_RBAC_V2_ENABLED: "true",
      LOG_LEVEL: "warn",
    },
    shell: true,
    stdio: "pipe",
  });
  const frontendEnv = {
    ...process.env,
    NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`,
    AUTH_URL: `http://127.0.0.1:${webPort}`,
    AUTH_SECRET: "rbac-v2-e2e-isolated-auth-secret-do-not-use-in-prod",
    AUTH_TRUST_HOST: "true",
    NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_UI: "true",
    NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_BACKEND_ENABLED: "true",
    NEXT_DIST_DIR: ".next-rbac-v2-e2e",
  };
  const frontend = spawn("npx", ["next", "dev", "-p", String(webPort)], {
    cwd: frontendRoot,
    env: frontendEnv,
    shell: true,
    stdio: "pipe",
  });
  try {
    await waitHttp(`http://127.0.0.1:${apiPort}/health`);
    await waitHttp(`http://127.0.0.1:${webPort}/en/login`);
    const sessionRes = await fetch(`http://127.0.0.1:${webPort}/api/auth/session`);
    console.log("session", sessionRes.status, await sessionRes.text());
    const csrfRes = await fetch(`http://127.0.0.1:${webPort}/api/auth/csrf`);
    console.log("csrf", csrfRes.status, await csrfRes.text());
    const nodeEval = spawnSync("node", ["e2e/debug-login-once.mjs"], {
      cwd: frontendRoot,
      encoding: "utf8",
      shell: true,
      env: { ...process.env, DEBUG_WEB_PORT: String(webPort) },
    });
    process.stdout.write(nodeEval.stdout ?? "");
    process.stderr.write(nodeEval.stderr ?? "");
  } finally {
    killChild(backend);
    killChild(frontend);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
