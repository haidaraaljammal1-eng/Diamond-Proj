/**
 * One-shot: isolated backend + warm next dev → HTTP proxy → optional Playwright AR roles.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { assertRbacE2eDatabaseUrl } from "../tests/helpers/rbac-e2e-database";

const backendRoot = path.resolve(__dirname, "..");
const frontendRoot = path.resolve(backendRoot, "../frontend");
const manifestPath = path.join(backendRoot, ".local/rbac-v2-e2e.manifest.json");
const startedAt = Date.now();

type Outcome = "PASS" | "PARTIAL" | "FAIL";

async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 60; port += 1) {
    const free = await new Promise<boolean>((resolve) => {
      const s = net.createServer();
      s.once("error", () => resolve(false));
      s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error("no_free_port");
}

async function waitOk(url: string, ms: number): Promise<void> {
  const end = Date.now() + ms;
  let last = "";
  while (Date.now() < end) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(4_000) });
      if (r.ok) return;
      last = `HTTP ${r.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timeout ${url} (${last})`);
}

function kill(child: ChildProcess | null) {
  if (child?.pid) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
}

async function main(): Promise<void> {
  const report: Record<string, unknown> = {
    outcome: "FAIL" as Outcome,
    elapsedMs: 0,
    usedNextStart: false,
    apiPort: null,
    webPort: null,
    httpProxyStatus: null,
    httpProxyJson: false,
    playwrightExit: null as number | null,
    screenshot: null as string | null,
    blocker: null as string | null,
  };

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { databaseUrl: string };
  assertRbacE2eDatabaseUrl(manifest.databaseUrl);

  const apiPort = await findFreePort(8060);
  const webPort = await findFreePort(3160);
  report.apiPort = apiPort;
  report.webPort = webPort;
  const adminPassword = process.env.DEV_ADMIN_PASSWORD ?? "Diamond123!";
  const authSecret = "rbac-v2-e2e-final-smoke-secret";

  const frontendEnv: NodeJS.ProcessEnv = {
    ...process.env,
    RBAC_E2E_API_PORT: String(apiPort),
    RBAC_E2E_API_PROXY: "true",
    NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`,
    NEXT_PUBLIC_API_PROXY: "true",
    NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_UI: "true",
    NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_BACKEND_ENABLED: "true",
    NEXT_DIST_DIR: ".next-rbac-v2-e2e",
    AUTH_SECRET: authSecret,
    AUTH_TRUST_HOST: "true",
    AUTH_URL: `http://127.0.0.1:${webPort}`,
  };

  const buildId = path.join(frontendRoot, ".next-rbac-v2-e2e", "BUILD_ID");
  let frontendCmd: string[];
  if (fs.existsSync(buildId)) {
    report.usedNextStart = true;
    frontendCmd = ["next", "start", "-p", String(webPort)];
  } else {
    frontendCmd = ["next", "dev", "-p", String(webPort)];
  }

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

  const frontend = spawn("npx", frontendCmd, {
    cwd: frontendRoot,
    env: frontendEnv,
    shell: true,
    stdio: "pipe",
  });

  try {
    await waitOk(`http://127.0.0.1:${apiPort}/health`, 75_000);
    await waitOk(`http://127.0.0.1:${webPort}/en/login`, 120_000);

    const login = await fetch(`http://127.0.0.1:${apiPort}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@diamond.test", password: adminPassword }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!login.ok) throw new Error(`backend_login ${login.status}`);
    const token = (await login.json() as { data: { accessToken: string } }).data.accessToken;

    const proxyRes = await fetch(
      `http://127.0.0.1:${webPort}/backend-api/roles?page=1&pageSize=100`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      },
    );
    report.httpProxyStatus = proxyRes.status;
    const proxyText = await proxyRes.text();
    let httpOk = false;
    if (proxyRes.ok) {
      try {
        const parsed = JSON.parse(proxyText) as { data?: unknown };
        httpOk = Array.isArray(parsed.data);
        report.httpProxyJson = httpOk;
      } catch {
        report.httpProxyJson = false;
      }
    }
    if (!httpOk) {
      report.blocker = `proxy_get_roles status=${proxyRes.status} body=${proxyText.slice(0, 120)}`;
      report.outcome = "FAIL";
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    fs.mkdirSync(path.join(frontendRoot, "e2e-artifacts"), { recursive: true });
    const pw = spawnSync(
      "npx",
      [
        "playwright",
        "test",
        "e2e/rbac-v2-1-roles.spec.ts",
        "-g",
        "matrix \\(ar\\).*renders 12 groups",
        "--project=chromium-ar-desktop",
        "--workers=1",
        "--retries=0",
        "--timeout=90000",
      ],
      {
        cwd: frontendRoot,
        env: {
          ...process.env,
          PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${webPort}`,
          PLAYWRIGHT_API_URL: `http://127.0.0.1:${apiPort}`,
          PLAYWRIGHT_RBAC_V2_E2E: "true",
          PLAYWRIGHT_LOGIN_EMAIL: "admin@diamond.test",
          PLAYWRIGHT_LOGIN_PASSWORD: adminPassword,
        },
        encoding: "utf8",
        shell: true,
        timeout: 100_000,
      },
    );
    report.playwrightExit = pw.status ?? 1;
    const shot = path.join(frontendRoot, "e2e-artifacts", "rbac-v2-roles-ar.png");
    report.screenshot = fs.existsSync(shot) ? shot : null;
    if (pw.status === 0) {
      report.outcome = "PASS";
    } else {
      report.outcome = "PARTIAL";
      report.blocker =
        pw.stderr?.split("\n").find((l) => l.includes("Error")) ??
        `playwright_exit_${pw.status}`;
    }
  } catch (e) {
    report.blocker = e instanceof Error ? e.message : String(e);
    report.outcome = "FAIL";
  } finally {
    kill(backend);
    kill(frontend);
    report.elapsedMs = Date.now() - startedAt;
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.outcome === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ outcome: "FAIL", blocker: String(e) }));
  process.exit(1);
});
