/**
 * Guards that development bootstrap/seed scripts never write to a production
 * (or otherwise non-development) database.
 */

export interface SafeDatabaseTarget {
  host: string;
  port: string;
  database: string;
}

const LOCAL_HOST_NAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "host.docker.internal",
  "postgres",
  "db",
  "database",
]);

const PRODUCTION_DB_NAME = /(?:^|[_-])prod(?:uction)?(?:$|[_-])/i;

export function parseDatabaseTarget(databaseUrl: string): SafeDatabaseTarget {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("[dev:db] DATABASE_URL is not a valid connection URL");
  }

  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")).split("?")[0] ?? "",
  };
}

export function formatSafeDatabaseTarget(target: SafeDatabaseTarget): string {
  return `${target.host}:${target.port} / ${target.database}`;
}

function isLocalHost(host: string): boolean {
  if (LOCAL_HOST_NAMES.has(host)) return true;
  if (host.endsWith(".local")) return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export function assertDevelopmentDatabase(input: {
  nodeEnv: string;
  databaseUrl: string;
}): SafeDatabaseTarget {
  if (input.nodeEnv === "production") {
    throw new Error(
      "[dev:db] refusing to run: NODE_ENV=production. Development bootstrap/seed is development-only.",
    );
  }

  const target = parseDatabaseTarget(input.databaseUrl);

  if (!target.database) {
    throw new Error("[dev:db] DATABASE_URL has no database name");
  }

  if (PRODUCTION_DB_NAME.test(target.database)) {
    throw new Error(
      `[dev:db] refusing to run: database name "${target.database}" looks like production.`,
    );
  }

  if (!isLocalHost(target.host)) {
    throw new Error(
      `[dev:db] refusing to run: host "${target.host}" is not a local development database.`,
    );
  }

  return target;
}
