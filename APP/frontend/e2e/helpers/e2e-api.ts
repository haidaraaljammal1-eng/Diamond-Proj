import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

export const BACKEND = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3000";
export const STAFF_EMAIL = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
export const STAFF_PASSWORD = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

type CompanyCode = "UNIQUE" | "ELITE";

export interface SeededVehicle {
  id: number;
  plateNumber: string;
  displayName: string;
}

export interface CashRentalAudit {
  contractId: string;
  contractNumber: string;
  contractStatus: string;
  companyId: number;
  collectionMode: string | null;
  rentalPaymentCount: number;
  cashConfirmedCount: number;
  cashPayment: {
    purpose: string;
    method: string;
    status: string;
    provider: string | null;
    amount: number;
  } | null;
  rentalPaymentLedgerCount: number;
  ledgerCompanyId: number | null;
  ledgerAmount: number | null;
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { data: T };
  return body.data;
}

let cachedStaffToken: string | null = null;
let cachedStaffTokenAt = 0;

export async function staffToken(): Promise<string> {
  if (cachedStaffToken && Date.now() - cachedStaffTokenAt < 5 * 60_000) {
    return cachedStaffToken;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${BACKEND}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: STAFF_EMAIL, password: STAFF_PASSWORD }),
    });
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
      continue;
    }
    if (!response.ok) {
      throw new Error(`Staff login failed (${response.status})`);
    }
    cachedStaffToken = (await parseJson<{ accessToken: string }>(response)).accessToken;
    cachedStaffTokenAt = Date.now();
    return cachedStaffToken;
  }

  throw new Error("Staff login failed after retries");
}

export async function companyId(token: string, code: CompanyCode): Promise<number> {
  const response = await fetch(`${BACKEND}/operating-companies`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Operating companies failed (${response.status})`);
  }
  const companies = await parseJson<Array<{ id: number; code: string }>>(response);
  const match = companies.find((company) => company.code === code);
  if (!match) throw new Error(`Company not found: ${code}`);
  return match.id;
}

export async function seedAvailableVehicle(
  token: string,
  options: { companyCode?: CompanyCode; label?: string } = {},
): Promise<SeededVehicle> {
  const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const companyCode = options.companyCode ?? "UNIQUE";
  const cid = await companyId(token, companyCode);
  const plateNumber = `E2E ${run}`.slice(0, 16);
  const vehicleName = options.label ?? `E2E Vehicle ${run}`;

  const response = await fetch(`${BACKEND}/vehicles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      companyId: cid,
      vehicleName,
      plateNumber,
      dailyRate: 400,
      monthlyRate: 9000,
      color: "White",
      modelYear: 2024,
    }),
  });
  if (!response.ok) {
    throw new Error(`Vehicle seed failed (${response.status}): ${await response.text()}`);
  }
  const vehicle = await parseJson<{ id: number; plateNumber: string; displayName: string }>(response);
  return {
    id: vehicle.id,
    plateNumber: vehicle.plateNumber,
    displayName: vehicle.displayName,
  };
}

export async function deactivateVehicle(token: string, vehicleId: number): Promise<void> {
  const response = await fetch(`${BACKEND}/vehicles/${vehicleId}/deactivate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404 && response.status !== 409) {
    throw new Error(`Vehicle deactivate failed (${response.status})`);
  }
}

export async function deleteArchiveRow(token: string, rowId: number): Promise<void> {
  const response = await fetch(`${BACKEND}/archive/rows/${rowId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Archive row delete failed (${response.status})`);
  }
}

export function extractRentalToken(link: string): string {
  const match = link.match(/\/rental\/([^/?#]+)/i);
  if (!match?.[1]) throw new Error(`Rental token not found in link: ${link}`);
  return match[1];
}

export interface CashRoadLiabilitySeed {
  liabilityId: string;
  contractId: string;
  contractNumber: string;
  vehicleId: number;
  amount: number;
  companyId: number;
}

export interface CashRoadLiabilityAudit {
  liabilityId: string;
  collectionStatus: string;
  contractStatus: string | null;
  settlementChannel: string | null;
  roadLiabilityPaymentCount: number;
  payment: {
    purpose: string;
    method: string;
    status: string;
    provider: string | null;
    amount: number;
  } | null;
  ledgerCount: number;
  ledgerCompanyId: number | null;
  ledgerAmount: number | null;
}

export interface ElectronicRoadLiabilitySeed {
  liabilityId: string;
  contractId: string;
  contractNumber: string;
  vehicleId: number;
  amount: number;
  companyId: number;
  consent: string;
  offSessionEligible: boolean;
}

export interface ElectronicRoadLiabilityAudit {
  liabilityId: string;
  collectionStatus: string;
  contractStatus: string | null;
  contractCollectionMode: string | null;
  settlementChannel: string | null;
  roadLiabilityPaymentCount: number;
  payment: {
    purpose: string;
    method: string;
    status: string;
    provider: string | null;
    amount: number;
  } | null;
  ledgerCount: number;
  ledgerCompanyId: number | null;
  ledgerAmount: number | null;
}

export interface RoadLiabilityCollectionCapability {
  offSessionAvailable: boolean;
  paymentLinkAvailable: boolean;
  cashCollectionRequired: boolean;
}

export interface ElectronicRentalAudit {
  contractId: string;
  contractNumber: string;
  contractStatus: string;
  companyId: number;
  collectionMode: string | null;
  rentalPaymentCount: number;
  cardConfirmedCount: number;
  cashConfirmedCount: number;
  cardPayment: {
    purpose: string;
    method: string;
    status: string;
    provider: string | null;
    amount: number;
  } | null;
  rentalPaymentLedgerCount: number;
  ledgerCompanyId: number | null;
  ledgerAmount: number | null;
}

function runBackendScript(marker: string, args: string): string {
  const databaseUrl =
    process.env.PLAYWRIGHT_DATABASE_URL ??
    "postgresql://postgres:admin@localhost:5432/haidara?schema=public";
  const out = execSync(`npx tsx ${args}`, {
    cwd: path.join(process.cwd(), "..", "backend"),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  const line = out.split("\n").find((row) => row.includes(marker));
  if (!line) throw new Error(`Script output missing ${marker}: ${out.slice(-1500)}`);
  return line.split(`${marker}=`)[1]!.trim();
}

export function seedCashRoadLiability(): CashRoadLiabilitySeed {
  return JSON.parse(runBackendScript("E2E_CASH_RL_SEED_JSON", "scripts/e2e-seed-cash-road-liability.ts"));
}

export function seedElectronicRoadLiability(consent: "v1" | "v2" = "v2"): ElectronicRoadLiabilitySeed {
  return JSON.parse(
    runBackendScript(
      "E2E_ELECTRONIC_RL_SEED_JSON",
      `scripts/e2e-seed-electronic-road-liability.ts --consent=${consent}`,
    ),
  );
}

export function collectElectronicRoadLiability(
  liabilityId: string,
  mode: "off-session" | "payment-link" = "off-session",
): { collectionStatus: string; paymentStatus: string | null } {
  const line = runBackendScript(
    "E2E_ELECTRONIC_RL_COLLECT_JSON",
    `scripts/e2e-collect-electronic-road-liability.ts --liability=${liabilityId} --mode=${mode}`,
  );
  const parsed = JSON.parse(line) as {
    collectionStatus: string;
    paymentStatus: string | null;
  };
  return parsed;
}

export function auditElectronicRoadLiability(liabilityId: string): ElectronicRoadLiabilityAudit {
  return JSON.parse(
    runBackendScript(
      "E2E_ELECTRONIC_RL_AUDIT_JSON",
      `scripts/e2e-audit-electronic-road-liability.ts --liability=${liabilityId}`,
    ),
  );
}

export async function roadLiabilityCollectionCapability(
  token: string,
  liabilityId: string,
): Promise<RoadLiabilityCollectionCapability> {
  const response = await fetch(`${BACKEND}/road-liabilities/${liabilityId}/collection`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Road liability collection view failed (${response.status})`);
  }
  const body = (await response.json()) as {
    data: { capability: RoadLiabilityCollectionCapability };
  };
  return body.data.capability;
}

export function auditCashRoadLiability(liabilityId: string): CashRoadLiabilityAudit {
  return JSON.parse(
    runBackendScript(
      "E2E_CASH_RL_AUDIT_JSON",
      `scripts/e2e-audit-cash-road-liability.ts --liability=${liabilityId}`,
    ),
  );
}

export function auditElectronicRental(token: string): ElectronicRentalAudit {
  return JSON.parse(
    runBackendScript(
      "E2E_ELECTRONIC_RENTAL_AUDIT_JSON",
      `scripts/e2e-audit-electronic-rental.ts --token=${token}`,
    ),
  );
}

export async function simulateElectronicRentalPayment(rentalToken: string): Promise<void> {
  const response = await fetch(`${BACKEND}/contracts/rental/${rentalToken}/simulation/payment`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": randomUUID(),
    },
  });
  if (!response.ok) {
    throw new Error(`Electronic payment simulation failed (${response.status}): ${await response.text()}`);
  }
}

export function settleElectronicRentalPayment(rentalToken: string): void {
  runBackendScript(
    "E2E_ELECTRONIC_RENTAL_SETTLED_JSON",
    `scripts/e2e-settle-electronic-rental.ts --token=${rentalToken}`,
  );
}

export function completeRentalSigning(rentalToken: string): void {
  runBackendScript(
    "E2E_RENTAL_SIGN_JSON",
    `scripts/e2e-complete-rental-sign.ts --token=${rentalToken}`,
  );
}

export function auditCashRental(token: string): CashRentalAudit {
  const databaseUrl =
    process.env.PLAYWRIGHT_DATABASE_URL ??
    "postgresql://postgres:admin@localhost:5432/haidara?schema=public";
  const out = execSync(`npx tsx scripts/cash-rental-db-audit.ts --token=${token}`, {
    cwd: path.join(process.cwd(), "..", "backend"),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  const marker = out.split("\n").find((line) => line.includes("CASH_RENTAL_AUDIT_JSON="));
  if (!marker) throw new Error(`Cash rental audit output missing JSON: ${out.slice(-1500)}`);
  return JSON.parse(marker.split("CASH_RENTAL_AUDIT_JSON=")[1]!.trim()) as CashRentalAudit;
}
