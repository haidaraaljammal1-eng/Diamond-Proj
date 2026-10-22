import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

function readEnvFileValue(fileName: string, key: string): string | undefined {
  try {
    const filePath = path.isAbsolute(fileName) ? fileName : path.join(frontendRoot, fileName);
    const raw = readFileSync(filePath, "utf8");
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
    /* optional in CI/production */
  }
  return undefined;
}

/** `.env.development` wins over Windows user-level NEXT_PUBLIC_* pollution in local dev. */
function readEnvDevelopmentValue(key: string): string | undefined {
  return readEnvFileValue(".env.development", key);
}

const localDevApiUrl = readEnvDevelopmentValue("NEXT_PUBLIC_API_URL");
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

const localAuthSecret =
  readEnvFileValue(".env.local", "AUTH_SECRET") ??
  readEnvFileValue(sharedEnvLocalPath, "AUTH_SECRET") ??
  process.env.AUTH_SECRET;

const withNextIntl = createNextIntlPlugin(
  "./src/infrastructure/i18n/request.ts",
);

const rbacE2eApiUrl =
  process.env.RBAC_E2E_API_PORT?.trim()
    ? `http://127.0.0.1:${process.env.RBAC_E2E_API_PORT.trim()}`
    : undefined;

const rbacE2eApiPort = process.env.RBAC_E2E_API_PORT?.trim();

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  // Keep file tracing inside this app. A parent lockfile must not become the root.
  outputFileTracingRoot: frontendRoot,
  // The container build sets DOCKER_BUILD=1 and runs `node server.js`.
  // Local production remains `next start`. The image uses Turbopack:
  // webpack rejects existing CSS modules, and its proxy NFT rename expects
  // a file Next 16 does not emit for `src/proxy.ts`.
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
  // Isolated E2E API proxy: `src/app/backend-api/[...path]/route.ts` + exclude
  // `backend-api` in `src/proxy.ts` matcher (Next 16 proxy / next-intl).
  env: {
    // Docker builds must use compose build-args only — never `.env.development`.
    NEXT_PUBLIC_API_URL:
      rbacE2eApiUrl ??
      (process.env.DOCKER_BUILD === "1"
        ? process.env.NEXT_PUBLIC_API_URL
        : localDevApiUrl ?? process.env.NEXT_PUBLIC_API_URL),
    NEXT_PUBLIC_API_PROXY: rbacE2eApiPort ? "true" : process.env.NEXT_PUBLIC_API_PROXY,
    NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_UI: process.env.NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_UI,
    NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_BACKEND_ENABLED:
      process.env.NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_BACKEND_ENABLED,
    AUTH_SECRET: localAuthSecret,
  },
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default withNextIntl(nextConfig);
