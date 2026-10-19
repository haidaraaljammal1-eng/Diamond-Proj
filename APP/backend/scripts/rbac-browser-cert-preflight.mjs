import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const api = process.env.PLAYWRIGHT_API_URL ?? "http://127.0.0.1:8011";
const dbUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/haidara_test?schema=public";

const seed = JSON.parse(
  readFileSync(path.join(__dirname, ".rbac-browser-cert.env.json"), "utf8"),
);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
const db = (await prisma.$queryRaw`SELECT current_database()::text AS db`)[0].db;
if (db !== "haidara_test") {
  console.error("STOP: database is", db);
  process.exit(1);
}

const health = await fetch(`${api}/health`);
if (!health.ok) {
  console.error("STOP: health", health.status);
  process.exit(1);
}

const login = await fetch(`${api}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: seed.emptyEmail, password: seed.password }),
});
const loginBody = await login.json();
if (login.status !== 200 || !loginBody?.data?.accessToken) {
  console.error("STOP: login", login.status, loginBody);
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    database: db,
    health: health.status,
    loginEmail: seed.emptyEmail,
    runId: seed.runId,
  }),
);
await prisma.$disconnect();
