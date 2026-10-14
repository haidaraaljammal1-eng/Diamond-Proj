/**
 * One-shot: isolated stack + single AR roles matrix Playwright test.
 * Does not provision DB if manifest exists and passes isolation guards.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { assertRbacE2eDatabaseUrl } from "../tests/helpers/rbac-e2e-database";

const backendRoot = path.resolve(__dirname, "..");
const frontendRoot = path.resolve(backendRoot, "../frontend");
const manifestPath = path.join(backendRoot, ".local/rbac-v2-e2e.manifest.json");

async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 150; port += 1) {
    const free = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolve(true));
      });
    });
    if (free) return port;
  }
  throw new Error("No free port");
}

async function waitHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastErr = `HTTP ${res.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`Timeout ${url}: ${lastErr}`);
}

function killChild(child: ChildProcess | null) {
  if (child && !child.killed && child.pid) {
    try {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      child.kill();
    }
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const budgetMs = 4 * 60_000;
  const result: Record<string, unknown> = {
    stackStarted: false,
    backendApiRolesStatus: null as number | null,
    proxyRolesUrl: null as string | null,
    browserRolesRequestUrl: null as string | null,
    browserRolesStatus: null as number | null,
    rolesSearchVisible: false,
    groupsCount: null as number | null,
    capabilitiesCount: null as number | null,
    playwrightExit: null as number | null,
    testResult: "NOT RUN" as "PASS" | "FAIL" | "NOT RUN",
    blocker: null as string | null,
    consoleErrors: [] as string[],
  };

  if (!fs.existsSync(manifestPath)) {
    result.blocker = "Missing rbac-v2-e2e.manifest.json — run provision once safely";
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    databaseUrl: string;
    databaseName: string;
  };
  try {
    assertRbacE2eDatabaseUrl(manifest.databaseUrl);
  } catch (e) {
    result.blocker = e instanceof Error ? e.message : String(e);
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const apiPort = await findFreePort(8022);
  const webPort = await findFreePort(3122);
  const e2eUrl = manifest.databaseUrl;
  const adminPassword = process.env.DEV_ADMIN_PASSWORD ?? "Diamond123!";
  const e2eAuthSecret =
    process.env.RBAC_E2E_AUTH_SECRET ??
    "rbac-v2-e2e-isolated-auth-secret-do-not-use-in-prod";

  const backend = spawn("npm", ["run", "dev:server-only"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(apiPort),
      DATABASE_URL: e2eUrl,
      FUNCTIONAL_RBAC_V2_ENABLED: "true",
      LOG_LEVEL: "warn",
      RATE_LIMIT_AUTH_MAX: "10000",
      CORS_ORIGINS: `http://127.0.0.1:${webPort},http://localhost:${webPort}`,
    },
    stdio: "pipe",
    shell: true,
  });

  const frontend = spawn("npx", ["next", "dev", "-p", String(webPort)], {
    cwd: frontendRoot,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`,
      RBAC_E2E_API_PORT: String(apiPort),
      AUTH_URL: `http://127.0.0.1:${webPort}`,
      AUTH_SECRET: e2eAuthSecret,
      AUTH_TRUST_HOST: "true",
      NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_UI: "true",
      NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_BACKEND_ENABLED: "true",
      NEXT_DIST_DIR: ".next-rbac-v2-e2e",
      NEXT_PUBLIC_DEV_ADMIN_EMAIL: "",
      NEXT_PUBLIC_DEV_ADMIN_PASSWORD: "",
    },
    stdio: "pipe",
    shell: true,
  });

  try {
    const remaining = budgetMs - (Date.now() - startedAt);
    if (remaining < 60_000) throw new Error("Startup budget exhausted before health wait");
    await waitHttp(`http://127.0.0.1:${apiPort}/health`, Math.min(remaining, 90_000));
    await waitHttp(`http://127.0.0.1:${webPort}/en/login`, Math.min(remaining, 90_000));
    result.stackStarted = true;

    const loginRes = await fetch(`http://127.0.0.1:${apiPort}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@diamond.test", password: adminPassword }),
    });
    if (!loginRes.ok) throw new Error(`Backend login failed: ${loginRes.status}`);
    const token = (await loginRes.json() as { data: { accessToken: string } }).data.accessToken;

    const proxyUrl = `http://127.0.0.1:${webPort}/backend-api/roles?page=1&pageSize=100`;
    result.proxyRolesUrl = proxyUrl;
    const proxyRes = await fetch(proxyUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    result.backendApiRolesStatus = proxyRes.status;

    fs.mkdirSync(path.join(frontendRoot, "e2e-artifacts"), { recursive: true });
    const capturePath = path.join(frontendRoot, "e2e-artifacts", "rbac-v2-one-shot-network.json");

    const pwEnv = {
      ...process.env,
      PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${webPort}`,
      PLAYWRIGHT_API_URL: `http://127.0.0.1:${apiPort}`,
      PLAYWRIGHT_RBAC_V2_E2E: "true",
      PLAYWRIGHT_LOGIN_EMAIL: "admin@diamond.test",
      PLAYWRIGHT_LOGIN_PASSWORD: adminPassword,
      PLAYWRIGHT_CAPTURE_NETWORK_FILE: capturePath,
    };

    const pwRemaining = budgetMs - (Date.now() - startedAt);
    if (pwRemaining < 45_000) throw new Error("Budget too low for Playwright");

    const pw = spawnSync(
      "npx",
      [
        "playwright",
        "test",
        "e2e/rbac-v2-1-roles.spec.ts",
        "-g",
        "roles matrix \\(ar\\).*renders 12 groups",
        "--project=chromium-ar-desktop",
        "--workers=1",
        "--retries=0",
        "--timeout=90000",
        "--screenshot=on",
      ],
      { cwd: frontendRoot, env: pwEnv, encoding: "utf8", shell: true, timeout: pwRemaining },
    );
    result.playwrightExit = pw.status ?? 1;
    if (fs.existsSync(capturePath)) {
      const cap = JSON.parse(fs.readFileSync(capturePath, "utf8")) as {
        rolesRequestUrl?: string;
        rolesStatus?: number;
        rolesSearchVisible?: boolean;
        groupsCount?: number;
        capabilitiesCount?: number;
        consoleErrors?: string[];
      };
      result.browserRolesRequestUrl = cap.rolesRequestUrl ?? null;
      result.browserRolesStatus = cap.rolesStatus ?? null;
      result.rolesSearchVisible = cap.rolesSearchVisible ?? false;
      result.groupsCount = cap.groupsCount ?? null;
      result.capabilitiesCount = cap.capabilitiesCount ?? null;
      result.consoleErrors = cap.consoleErrors ?? [];
    }

    result.testResult = pw.status === 0 ? "PASS" : "FAIL";
    if (pw.status !== 0) {
      result.blocker =
        pw.stderr?.split("\n").find((l) => l.includes("Error")) ??
        pw.stdout?.split("\n").slice(-8).join(" ") ??
        `playwright exit ${pw.status}`;
    }
  } catch (e) {
    result.blocker = e instanceof Error ? e.message : String(e);
    result.testResult = result.stackStarted ? "FAIL" : "NOT RUN";
  } finally {
    killChild(backend);
    killChild(frontend);
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.testResult === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
