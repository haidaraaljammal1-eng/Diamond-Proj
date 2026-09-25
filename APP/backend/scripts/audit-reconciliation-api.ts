/**
 * API inspection for REVIEW contracts with settled reconciliation.
 * Usage: npx tsx scripts/audit-reconciliation-api.ts
 */
import dotenv from "dotenv";

dotenv.config({ override: true });

const BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
const EMAIL = process.env.DEV_ADMIN_EMAIL ?? "admin@diamond.test";
const PASSWORD = process.env.DEV_ADMIN_PASSWORD ?? "Diamond123!";

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

async function main() {
  const token = await login();
  const headers = { authorization: `Bearer ${token}` };

  const listRes = await fetch(`${BASE}/contracts?status=REVIEW&pageSize=100`, { headers });
  if (!listRes.ok) throw new Error(`list failed: ${listRes.status} ${await listRes.text()}`);
  const list = (await listRes.json()) as {
    data: Array<{ id: string; contractNumber: string; status: string }>;
  };

  console.log("REVIEW contracts in list:", list.data.length);

  const inconsistent: unknown[] = [];
  for (const item of list.data) {
    const [detailRes, reconRes] = await Promise.all([
      fetch(`${BASE}/contracts/${item.id}`, { headers }),
      fetch(`${BASE}/contracts/${item.id}/reconciliation`, { headers }),
    ]);
    if (!detailRes.ok || !reconRes.ok) continue;
    const detail = (await detailRes.json()) as {
      data: {
        status: string;
        actions: { canReconcile: boolean; canClose: boolean };
        reconciliation?: {
          approvedAt: string | null;
          finalizedAt: string | null;
          settledAt: string | null;
          finalAmount: number;
        } | null;
      };
    };
    const recon = (await reconRes.json()) as {
      data?: {
        reconciliation: { finalizedAt: string | null; settled: boolean; settledAt: string | null };
        totals: { finalAmount: number };
      };
    };

    const reconciliation = detail.data.reconciliation;
    const settledAt = reconciliation?.settledAt ?? recon.data?.reconciliation.settledAt ?? null;
    if (settledAt) {
      inconsistent.push({
        contractNumber: item.contractNumber,
        id: item.id,
        status: detail.data.status,
        canReconcile: detail.data.actions.canReconcile,
        canClose: detail.data.actions.canClose,
        approvedAt: reconciliation?.approvedAt ?? null,
        finalizedAt: reconciliation?.finalizedAt ?? recon.data?.reconciliation.finalizedAt,
        settledAt,
        finalAmount: reconciliation?.finalAmount ?? recon.data?.totals.finalAmount,
      });
    }
  }

  console.log("REVIEW + settledAt via API:", inconsistent.length);
  for (const row of inconsistent) console.log(JSON.stringify(row));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
