import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import {
  deactivateVehicle,
  seedAvailableVehicle,
  staffToken,
} from "./e2e-api";

const BACKEND = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";
const FRONTEND = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";

const fixtureDir = path.join(process.cwd(), "e2e/fixtures/driving-license");

export interface UaeDrivingLicenseOcrExpectations {
  fixtureFile: string;
  expiredFixtureFile: string;
  engineRelease: string;
  partialReadExpectation: {
    verificationStatus: string;
    engineDocumentStatus: string;
    expiryOcr: string;
  };
  expiredExpectation: {
    verificationStatus: string;
    licenseNumber: string;
    expiryIso: string;
  };
}

export function loadDrivingLicenseOcrExpectations(): UaeDrivingLicenseOcrExpectations {
  const raw = readFileSync(
    path.join(fixtureDir, "uae-driving-license-ocr-expectations.json"),
    "utf8",
  );
  return JSON.parse(raw) as UaeDrivingLicenseOcrExpectations;
}

export function drivingLicenseFixturePath(): string {
  const expectations = loadDrivingLicenseOcrExpectations();
  const file = expectations.fixtureFile ?? "uae-driving-license-ocr-test.jpg";
  return path.join(fixtureDir, file);
}

/** Local V1.2H diagnostic licence (not committed). Override with PLAYWRIGHT_V12H_LICENSE_FIXTURE. */
export const E2E_LICENSE_POLICY_DATE_HEADER = "x-e2e-license-policy-date";

export const V12H_EXPECTED = {
  licenseNumber: "1893918",
  expiryIso: "2023-04-13",
  /** Public rental UI displays expiry as DD/MM/YYYY (see formatLicenseExpiry). */
  expiryDisplay: "13/04/2023",
  testPolicyDate: "2023-01-01",
} as const;

/** Local A8 Rishad sample (gitignored). Override with PLAYWRIGHT_A8_LICENSE_FIXTURE. */
export const A8_EXPECTED = {
  licenseNumber: "2490527",
  expiryDisplay: "11/09/2021",
} as const;

export function a8LocalFixturePath(): string {
  const fromEnv = process.env.PLAYWRIGHT_A8_LICENSE_FIXTURE?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (!existsSync(resolved)) {
      throw new Error(`PLAYWRIGHT_A8_LICENSE_FIXTURE missing: ${resolved}`);
    }
    return resolved;
  }
  const defaultPath = path.join(
    process.cwd(),
    "..",
    "..",
    "DOCUMENT-ENGINE",
    "LICENSE",
    "output",
    "a8_rishad_sample",
    "input.png",
  );
  if (!existsSync(defaultPath)) {
    throw new Error(
      `A8 local fixture not found at ${defaultPath}. Set PLAYWRIGHT_A8_LICENSE_FIXTURE.`,
    );
  }
  return defaultPath;
}

export function v12hLocalFixturePath(): string {
  const fromEnv = process.env.PLAYWRIGHT_V12H_LICENSE_FIXTURE?.trim();
  if (fromEnv) {
    const resolved = path.resolve(fromEnv);
    if (!existsSync(resolved)) {
      throw new Error(`PLAYWRIGHT_V12H_LICENSE_FIXTURE missing: ${resolved}`);
    }
    return resolved;
  }
  const defaultPath = path.join(
    process.cwd(),
    "..",
    "..",
    "DOCUMENT-ENGINE",
    "LICENSE",
    "output",
    "v1_2h_local_fixture",
    "marlon_reference.png",
  );
  if (!existsSync(defaultPath)) {
    throw new Error(
      `V1.2H local fixture not found at ${defaultPath}. Set PLAYWRIGHT_V12H_LICENSE_FIXTURE.`,
    );
  }
  return defaultPath;
}

/** Injects policy clock header on browser licence uploads only (backend must allow E2E clock). */
export async function installLicensePolicyDateRoute(
  page: Page,
  policyDate: string,
): Promise<void> {
  await page.route("**/rental/*/driving-license", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      await route.continue();
      return;
    }
    const headers = {
      ...request.headers(),
      [E2E_LICENSE_POLICY_DATE_HEADER]: policyDate,
    };
    await route.continue({ headers });
  });
}

export async function assertLicenceEngineReady(): Promise<void> {
  const base = process.env.UAE_DRIVING_LICENSE_API_URL ?? "http://127.0.0.1:8020";
  const response = await fetch(`${base}/health`);
  if (!response.ok) {
    throw new Error(`Licence engine health failed (${response.status})`);
  }
  const body = (await response.json()) as { status?: string };
  if (body.status !== "READY") {
    throw new Error(`Licence engine not READY: ${JSON.stringify(body)}`);
  }
}

export interface SeededPublicRental {
  token: string;
  contractId: string;
  vehicleId: number;
  frontendPath: string;
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as { data: T };
  return body.data;
}

export async function seedIsolatedPublicRental(
  label = "DL OCR E2E",
): Promise<SeededPublicRental> {
  const token = await staffToken();
  const vehicle = await seedAvailableVehicle(token, { label });
  const offerRes = await fetch(`${BACKEND}/contracts/offers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      vehicleId: vehicle.id,
      priceType: "DAILY",
      rentalDays: 3,
      agreedAmount: 1200,
      collectionMode: "ELECTRONIC",
    }),
  });
  if (!offerRes.ok) {
    throw new Error(`Offer failed (${offerRes.status}): ${await offerRes.text()}`);
  }
  const offer = await parseJson<{ id: string }>(offerRes);
  const linkRes = await fetch(`${BACKEND}/contracts/${offer.id}/rental-link`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!linkRes.ok) {
    throw new Error(`Rental link failed (${linkRes.status}): ${await linkRes.text()}`);
  }
  const link = await parseJson<{ link: { token: string } }>(linkRes);
  const rentalToken = link.link.token;
  return {
    token: rentalToken,
    contractId: offer.id,
    vehicleId: vehicle.id,
    frontendPath: `/en/rental/${rentalToken}`,
  };
}

export async function cleanupSeededPublicRental(
  staff: string,
  vehicleId: number,
): Promise<void> {
  await deactivateVehicle(staff, vehicleId);
}

export interface DrivingLicenseOcrAudit {
  extraction: {
    id: string;
    placeOfIssue: string | null;
    holderNameEn: string | null;
    licenseNumber: string | null;
  } | null;
  verification: {
    status: string;
    extractionId: string | null;
    licenseNumber: string | null;
  } | null;
  customer: {
    drivingLicensePlaceOfIssue: string | null;
    drivingLicenseIssueDate: string | null;
    name: string | null;
    nationality: string | null;
    dateOfBirth: string | null;
  } | null;
  contextHasExtraction: boolean;
}

export function auditDrivingLicenseOcr(rentalToken: string): DrivingLicenseOcrAudit {
  const databaseUrl =
    process.env.PLAYWRIGHT_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/diamond?schema=public";
  const out = execSync(`npx tsx scripts/e2e-audit-driving-license-ocr.ts --token=${rentalToken}`, {
    cwd: path.join(process.cwd(), "..", "backend"),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, DATABASE_URL: databaseUrl, UAE_DRIVING_LICENSE_API_URL: process.env.UAE_DRIVING_LICENSE_API_URL ?? "http://127.0.0.1:8020" },
  });
  const marker = out.split("\n").find((line) => line.includes("E2E_DL_OCR_AUDIT_JSON="));
  if (!marker) throw new Error(`DL OCR audit missing JSON: ${out.slice(-2000)}`);
  return JSON.parse(marker.split("E2E_DL_OCR_AUDIT_JSON=")[1]!.trim()) as DrivingLicenseOcrAudit;
}

export { BACKEND, FRONTEND };
