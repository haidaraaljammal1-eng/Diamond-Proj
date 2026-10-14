/**
 * Provisions isolated RBAC V2 E2E DB, starts backend/frontend on free ports, runs Playwright.
 * Does not stop owner processes on 8000/3100.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const backendRoot = path.resolve(__dirname, "..");
const frontendRoot = path.resolve(backendRoot, "../frontend");

async function findFreePort(start = 8020): Promise<number> {
  for (let port = start; port < start + 200; port += 1) {
    const free = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolve(true));
      });
    });
    if (free) return port;
  }
  throw new Error("No free port found");
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

function killChild(child: ChildProcess | null) {
  if (child && !child.killed) {
    try {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      child.kill();
    }
  }
}

async function main(): Promise<void> {
  const provision = spawnSync("npx", ["tsx", "scripts/provision-rbac-v2-e2e-database.ts"], {
    cwd: backendRoot,
    encoding: "utf8",
    shell: true,
  });
  if (provision.status !== 0) {
    process.stderr.write(provision.stderr ?? "");
    process.exit(provision.status ?? 1);
  }
  const e2eUrl = (provision.stdout ?? "").trim().split("\n").pop()?.trim();
  if (!e2eUrl || !e2eUrl.includes("diamond_rbac_v2_e2e_")) {
    console.error("Failed to read RBAC E2E database URL from provision output");
    process.exit(1);
  }

  const apiPort = await findFreePort(8020);
  const webPort = await findFreePort(3120);

  const adminPassword = process.env.DEV_ADMIN_PASSWORD ?? "Diamond123!";
  const fixtureEnv = {
    ...process.env,
    RBAC_E2E_DATABASE_URL: e2eUrl,
    DATABASE_URL: e2eUrl,
    RBAC_E2E_RUN_ID: Date.now().toString(36),
  };
  const fixtures = spawnSync("npx", ["tsx", "scripts/seed-rbac-v2-e2e-fixtures.ts"], {
    cwd: backendRoot,
    env: fixtureEnv,
    encoding: "utf8",
    shell: true,
  });
  if (fixtures.status !== 0) process.exit(fixtures.status ?? 1);
  const fixtureJson = JSON.parse(fixtures.stdout.trim()) as {
    limitedEmail: string;
    limitedPassword: string;
  };

  const backendEnv = {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(apiPort),
    DATABASE_URL: e2eUrl,
    FUNCTIONAL_RBAC_V2_ENABLED: "true",
    LOG_LEVEL: "warn",
    RATE_LIMIT_AUTH_MAX: "10000",
    CORS_ORIGINS: `http://127.0.0.1:${webPort},http://localhost:${webPort}`,
  };

  const backend = spawn("npm", ["run", "dev:server-only"], {
    cwd: backendRoot,
    env: backendEnv,
    stdio: "pipe",
    shell: true,
  });

  const e2eAuthSecret =
    process.env.RBAC_E2E_AUTH_SECRET ??
    "rbac-v2-e2e-isolated-auth-secret-do-not-use-in-prod";

  const isolatedNextDir = path.join(frontendRoot, ".next-rbac-v2-e2e");
  fs.rmSync(isolatedNextDir, { recursive: true, force: true });

  const frontendEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`,
    RBAC_E2E_API_PORT: String(apiPort),
    RBAC_E2E_API_PROXY: "true",
    NEXT_PUBLIC_DEV_ADMIN_EMAIL: "",
    NEXT_PUBLIC_DEV_ADMIN_PASSWORD: "",
    AUTH_URL: `http://127.0.0.1:${webPort}`,
    AUTH_SECRET: e2eAuthSecret,
    AUTH_TRUST_HOST: "true",
    NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_UI: "true",
    NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_BACKEND_ENABLED: "true",
    NEXT_DIST_DIR: ".next-rbac-v2-e2e",
  };
  delete frontendEnv.NEXT_PUBLIC_DEV_ADMIN_EMAIL;
  delete frontendEnv.NEXT_PUBLIC_DEV_ADMIN_PASSWORD;

  const frontend = spawn(
    "npx",
    ["next", "dev", "-p", String(webPort)],
    {
      cwd: frontendRoot,
      env: frontendEnv,
      stdio: "pipe",
      shell: true,
    },
  );

  let exitCode = 1;
  try {
    await waitHttp(`http://127.0.0.1:${apiPort}/health`);
    await waitHttp(`http://127.0.0.1:${webPort}/en/login`);
    await waitHttp(`http://127.0.0.1:${webPort}/api/auth/csrf`);
    const loginHtml = await fetch(`http://127.0.0.1:${webPort}/en/login`);
    const loginBody = await loginHtml.text();
    if (!loginBody.includes('id="login"') && !loginBody.includes("login")) {
      throw new Error("Isolated login page did not render expected shell");
    }

    const loginRes = await fetch(`http://127.0.0.1:${apiPort}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "admin@diamond.test",
        password: adminPassword,
      }),
    });
    if (!loginRes.ok) throw new Error("Admin login failed on isolated backend");
    const token = (await loginRes.json()).data.accessToken as string;
    const me = await fetch(`http://127.0.0.1:${apiPort}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!me.ok) throw new Error("/auth/me failed");
    const meBody = (await me.json()) as { data?: { permissions?: string[] } };
    const perms = meBody.data?.permissions ?? [];
    if (perms.length === 0) {
      throw new Error("/auth/me returned no permissions on isolated backend");
    }
    const rolesWarm = await fetch(`http://127.0.0.1:${apiPort}/roles`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!rolesWarm.ok) {
      throw new Error(`Isolated /roles warmup failed: ${rolesWarm.status}`);
    }
    const permsWarm = await fetch(`http://127.0.0.1:${apiPort}/permissions`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!permsWarm.ok) {
      throw new Error(`Isolated /permissions warmup failed: ${permsWarm.status}`);
    }
    await waitHttp(`http://127.0.0.1:${webPort}/ar/roles`);

    fs.mkdirSync(path.join(frontendRoot, "e2e-artifacts"), { recursive: true });

    const pwEnv = {
      ...process.env,
      PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${webPort}`,
      PLAYWRIGHT_API_URL: `http://127.0.0.1:${apiPort}`,
      PLAYWRIGHT_RBAC_V2_E2E: "true",
      PLAYWRIGHT_LOGIN_EMAIL: "admin@diamond.test",
      PLAYWRIGHT_LOGIN_PASSWORD: adminPassword,
      PLAYWRIGHT_RBAC_V2_LIMITED_EMAIL: fixtureJson.limitedEmail,
      PLAYWRIGHT_RBAC_V2_LIMITED_PASSWORD: fixtureJson.limitedPassword,
    };
    const pwArgs = ["playwright", "test", "--project=chromium-ar-desktop", "--workers=1"];
    const pw = spawnSync(
      "npx",
      [...pwArgs, "e2e/rbac-v2-0-sidebar.spec.ts", "e2e/rbac-v2-1-roles.spec.ts"],
      { cwd: frontendRoot, env: pwEnv, stdio: "inherit", shell: true },
    );
    exitCode = pw.status ?? 1;

    const summary = {
      e2eDatabase: e2eUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://***:***@"),
      apiPort,
      webPort,
      playwrightExit: exitCode,
    };
    process.stdout.write(`\n${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    killChild(backend);
    killChild(frontend);
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
