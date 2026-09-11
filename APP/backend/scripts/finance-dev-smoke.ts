/**
 * Finance Development smoke — hits running backend against haidara.
 * Usage: tsx scripts/finance-dev-smoke.ts
 * Requires: backend on PORT, DEV admin credentials in .env
 */
import "dotenv/config";
import { env } from "src/config/env";

const base = `http://127.0.0.1:${env.PORT}`;

async function request(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

async function main() {
  const email = env.DEV_ADMIN_EMAIL;
  const password = env.DEV_ADMIN_PASSWORD;
  if (!password) {
    console.error("DEV_ADMIN_PASSWORD is required for finance dev smoke");
    process.exit(1);
  }

  const login = await request("POST", "/auth/login", undefined, { email, password });
  if (login.status !== 200) {
    console.error("Login failed", login.status, login.json);
    process.exit(1);
  }
  const token = (login.json.data as { accessToken: string }).accessToken;

  const me = await request("GET", "/auth/me", token);
  const perms = (me.json.data as { permissions: string[] }).permissions;
  const hasRead = perms.includes("finance.read");
  const hasManage = perms.includes("finance.manage_expenses");
  console.log(`auth/me finance.read=${hasRead} finance.manage_expenses=${hasManage}`);

  for (const path of [
    "/finance/summary",
    "/finance/open-receivables",
    "/finance/ledger",
    "/finance/analytics",
  ]) {
    const res = await request("GET", path, token);
    console.log(`${path} -> ${res.status}`);
    if (res.status !== 200) {
      console.error(res.json);
      process.exit(1);
    }
    if (!("data" in res.json)) {
      console.error(`${path} missing data envelope`);
      process.exit(1);
    }
  }

  const created = await request("POST", "/finance/expenses", token, {
    amount: 100,
    category: "OPERATIONS",
    recognizedAt: new Date().toISOString(),
    description: `Finance dev smoke ${Date.now()}`,
  });
  console.log(`POST /finance/expenses -> ${created.status}`);
  if (created.status !== 200) {
    console.error(created.json);
    process.exit(1);
  }
  const expenseId = (created.json.data as { id: string }).id;

  const detail = await request("GET", `/finance/expenses/${expenseId}`, token);
  console.log(`GET /finance/expenses/:id -> ${detail.status}`);

  const voided = await request("POST", `/finance/expenses/${expenseId}/void`, token, {
    voidReason: "Dev smoke cleanup void",
  });
  console.log(`POST void -> ${voided.status}`);

  const corrected = await request("POST", "/finance/expenses", token, {
    amount: 80,
    category: "OPERATIONS",
    recognizedAt: new Date().toISOString(),
    description: `Finance dev smoke correction base ${Date.now()}`,
  });
  const baseId = (corrected.json.data as { id: string }).id;
  const correction = await request("POST", `/finance/expenses/${baseId}/correct`, token, {
    amount: 80,
    category: "OPERATIONS",
    recognizedAt: new Date().toISOString(),
    description: "Corrected dev smoke expense",
    voidReason: "Amount correction smoke",
  });
  console.log(`POST correct -> ${correction.status}`);

  const replacementId = (correction.json.data as { id: string }).id;
  await request("POST", `/finance/expenses/${replacementId}/void`, token, {
    voidReason: "Dev smoke cleanup after correction",
  });

  const noIncome = await request("POST", "/finance/income", token, { amount: 1 });
  console.log(`POST /finance/income (absent) -> ${noIncome.status}`);
  if (noIncome.status !== 404) process.exit(1);

  console.log("Finance dev smoke OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
