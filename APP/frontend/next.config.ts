import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

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
    NEXT_PUBLIC_API_URL: rbacE2eApiUrl ?? process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_API_PROXY: rbacE2eApiPort ? "true" : process.env.NEXT_PUBLIC_API_PROXY,
    NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_UI: process.env.NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_UI,
    NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_BACKEND_ENABLED:
      process.env.NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_BACKEND_ENABLED,
  },
  experimental: {
    cpus: 1,
    workerThreads: false,
  },
};

export default withNextIntl(nextConfig);
