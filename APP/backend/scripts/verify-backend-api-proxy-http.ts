/**
 * Bounded smoke test: GET /backend-api/roles via isolated Next proxy.
 * No DB writes. Max ~120s wall clock. No Playwright.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { assertRbacE2eDatabaseUrl } from "../tests/helpers/rbac-e2e-database";

const BUDGET_MS = 120_000;
const backendRoot = path.resolve(__dirname, "..");
const frontendRoot = path.resolve(backendRoot, "../frontend");
const manifestPath = path.join(backendRoot, ".local/rbac-v2-e2e.manifest.json");

const startedAt = Date.now();
function remainingMs(): number {
  return BUDGET_MS - (Date.now() - startedAt);
}

async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 80; port += 1) {
    const free = await new Promise<boolean>((resolve) => {
      const s = net.createServer();
      s.once("error", () => resolve(false));
      s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error("no_free_port");
}

async function waitOk(url: string, label: string): Promise<void> {
  const deadline = Date.now() + Math.min(remainingMs(), 50_000);
  let lastErr = "";
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (r.ok) return;
      lastErr = `HTTP ${r.status}`;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${label}: timeout waiting for ${url} (${lastErr})`);
}

function kill(child: ChildProcess | null) {
  if (child?.pid) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
}

function bodySnippet(text: string): string {
  return text.slice(0, 160).replace(/\s+/g, " ");
}

async function main(): Promise<void> {
  const result: Record<string, unknown> = {
    outcome: "FAIL" as "PASS" | "FAIL" | "BLOCKED",
    elapsedMs: 0,
    stage: null as string | null,
    apiPort: null as number | null,
    webPort: null as number | null,
    proxyStatus: null as number | null,
    proxyContentType: null as string | null,
    proxyHasRolesData: false,
    blocker: null as string | null,
  };

  if (!fs.existsSync(manifestPath)) {
    result.outcome = "BLOCKED";
    result.blocker = "missing rbac-v2-e2e.manifest.json";
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { databaseUrl: string };
  try {
    assertRbacE2eDatabaseUrl(manifest.databaseUrl);
  } catch (e) {
    result.outcome = "BLOCKED";
    result.blocker = e instanceof Error ? e.message : String(e);
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  if (remainingMs() < 70_000) {
    result.outcome = "BLOCKED";
    result.blocker = "budget_exhausted_before_start";
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }

  const apiPort = await findFreePort(8050);
  const webPort = await findFreePort(3150);
  result.apiPort = apiPort;
  result.webPort = webPort;
  const adminPassword = process.env.DEV_ADMIN_PASSWORD ?? "Diamond123!";

  result.stage = "spawn_backend";
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

  result.stage = "spawn_frontend";
  const frontend = spawn("npx", ["next", "dev", "-p", String(webPort)], {
    cwd: frontendRoot,
    env: {
      ...process.env,
      RBAC_E2E_API_PORT: String(apiPort),
      RBAC_E2E_API_PROXY: "true",
      NEXT_PUBLIC_API_URL: `http://127.0.0.1:${apiPort}`,
      NEXT_PUBLIC_API_PROXY: "true",
      NEXT_DIST_DIR: ".next-rbac-v2-e2e",
      AUTH_SECRET: "rbac-v2-e2e-proxy-verify",
      AUTH_TRUST_HOST: "true",
      AUTH_URL: `http://127.0.0.1:${webPort}`,
    },
    shell: true,
    stdio: "pipe",
  });

  try {
    result.stage = "wait_backend_health";
    await waitOk(`http://127.0.0.1:${apiPort}/health`, "backend");

    result.stage = "wait_frontend_login";
    await waitOk(`http://127.0.0.1:${webPort}/en/login`, "frontend");

    if (remainingMs() < 8_000) {
      throw new Error("budget_exhausted_before_proxy_request");
    }

    result.stage = "auth_login";
    const login = await fetch(`http://127.0.0.1:${apiPort}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@diamond.test", password: adminPassword }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!login.ok) throw new Error(`backend_login HTTP ${login.status}`);
    const token = (await login.json() as { data: { accessToken: string } }).data.accessToken;

    result.stage = "proxy_get_roles";
    const proxyUrl = `http://127.0.0.1:${webPort}/backend-api/roles?page=1&pageSize=100`;
    const proxy = await fetch(proxyUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    result.proxyStatus = proxy.status;
    result.proxyContentType = proxy.headers.get("content-type");
    const proxyText = await proxy.text();
    if (proxy.ok) {
      try {
        const parsed = JSON.parse(proxyText) as { data?: unknown };
        result.proxyHasRolesData = Array.isArray(parsed.data);
      } catch {
        result.proxyHasRolesData = false;
      }
    }
    if (!proxy.ok) {
      result.blocker = `proxy_get_roles HTTP ${proxy.status}: ${bodySnippet(proxyText)}`;
    }

    result.outcome =
      proxy.status === 200 && result.proxyHasRolesData ? "PASS" : "FAIL";
    result.stage = "done";
  } catch (e) {
    result.outcome = "FAIL";
    result.blocker = e instanceof Error ? e.message : String(e);
  } finally {
    kill(backend);
    kill(frontend);
    result.elapsedMs = Date.now() - startedAt;
    console.log(JSON.stringify(result, null, 2));
  }

  process.exit(result.outcome === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(
    JSON.stringify({
      outcome: "FAIL",
      blocker: e instanceof Error ? e.message : String(e),
      elapsedMs: Date.now() - startedAt,
    }),
  );
  process.exit(1);
});
