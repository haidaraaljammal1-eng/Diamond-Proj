import { z } from "zod";
import { env } from "src/config/env";
import {
  classifyNetworkError,
  fetchWithTimeout,
} from "src/modules/integrations/adapters/types";
import type {
  UaeDrivingLicenseApiClientErrorCode,
  UaeDrivingLicenseEngineOutcome,
  UaeDrivingLicenseImageInput,
  UaeLicenseApiHealthBody,
  UaeLicenseApiSuccessBody,
} from "src/modules/document-engine/uae-driving-license-api.types";

const PROVIDER = "uae-driving-license-engine";
const PROVIDER_VERSION = "document-engine/license";

const FieldResultSchema = z.object({
  value: z.string().nullable().optional(),
  status: z.string(),
  crop_status: z.string().nullable().optional(),
  ocr_eligible: z.boolean().optional(),
  confidence: z.number().nullable().optional(),
  engine: z.string().nullable().optional(),
});

const SuccessBodySchema = z.object({
  job_id: z.string().min(1),
  document_status: z.enum(["ACCEPT", "REVIEW_REQUIRED", "REJECT"]),
  fields: z.record(z.string(), FieldResultSchema),
  runtime_ms: z.object({
    crop: z.number(),
    ocr: z.number(),
    total: z.number(),
  }),
});

const HealthBodySchema = z.object({
  status: z.enum(["READY", "DEGRADED", "NOT_READY"]),
  service: z.string().optional(),
  engine: z.string().optional(),
});

const ErrorBodySchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

type ExtractFn = (input: UaeDrivingLicenseImageInput) => Promise<UaeDrivingLicenseEngineOutcome>;
type HealthFn = () => Promise<UaeLicenseApiHealthBody | null>;

let testExtract: ExtractFn | undefined;
let testHealth: HealthFn | undefined;

export function setUaeDrivingLicenseApiClientForTests(
  hooks: { extract?: ExtractFn; health?: HealthFn } | undefined,
): void {
  if (env.NODE_ENV === "production" && hooks !== undefined) {
    throw new Error("UAE Driving License API test client cannot be injected in production");
  }
  testExtract = hooks?.extract;
  testHealth = hooks?.health;
}

function baseUrl(): string | null {
  const raw = env.UAE_DRIVING_LICENSE_API_URL?.trim();
  return raw ? raw.replace(/\/$/, "") : null;
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  return ".bin";
}

function mapHttpErrorCode(error: string): UaeDrivingLicenseApiClientErrorCode {
  switch (error) {
    case "INVALID_IMAGE":
      return "LICENSE_OCR_INVALID_IMAGE";
    case "UNSUPPORTED_FORMAT":
      return "LICENSE_OCR_UNSUPPORTED_FORMAT";
    case "FILE_TOO_LARGE":
      return "LICENSE_OCR_FILE_TOO_LARGE";
    case "CROP_FAILED":
    case "TABLE_NOT_FOUND":
    case "GEOMETRY_REJECTED":
      return "LICENSE_OCR_CROP_FAILED";
    case "OCR_WORKER_UNAVAILABLE":
    case "MODEL_INTEGRITY_FAILURE":
      return "LICENSE_OCR_MODEL_UNAVAILABLE";
    case "OCR_TIMEOUT":
      return "LICENSE_OCR_TIMEOUT";
    case "OCR_REJECT":
      return "LICENSE_OCR_INTERNAL_ERROR";
    case "INTERNAL_OCR_ERROR":
      return "LICENSE_OCR_INTERNAL_ERROR";
    default:
      return "LICENSE_OCR_INTERNAL_ERROR";
  }
}

function parseSuccessBody(body: unknown): UaeLicenseApiSuccessBody | null {
  const parsed = SuccessBodySchema.safeParse(body);
  if (!parsed.success) return null;
  return parsed.data as UaeLicenseApiSuccessBody;
}

export async function checkUaeDrivingLicenseApiHealth(): Promise<UaeLicenseApiHealthBody | null> {
  if (testHealth && env.NODE_ENV !== "production") {
    return testHealth();
  }
  const root = baseUrl();
  if (!root) return null;
  try {
    const response = await fetchWithTimeout(`${root}/health`, { method: "GET" }, 10_000);
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const parsed = HealthBodySchema.safeParse(body);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function extractDrivingLicenseImpl(
  input: UaeDrivingLicenseImageInput,
): Promise<UaeDrivingLicenseEngineOutcome> {
  const root = baseUrl();
  if (!root) {
    return {
      kind: "error",
      code: "NOT_CONFIGURED",
      provider: PROVIDER,
      providerVersion: PROVIDER_VERSION,
    };
  }

  const filename =
    input.filename?.trim() || `driving-license${extensionForMime(input.mimeType)}`;
  const form = new FormData();
  const blob = new Blob([input.bytes], { type: input.mimeType });
  form.append("image", blob, filename);

  const url = `${root}/extract-driving-license`;
  const timeoutMs = env.UAE_DRIVING_LICENSE_API_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchWithTimeout(url, { method: "POST", body: form }, timeoutMs);
  } catch (error: unknown) {
    const net = classifyNetworkError(error);
    const code: UaeDrivingLicenseApiClientErrorCode =
      net.code === "TIMEOUT" ? "LICENSE_OCR_TIMEOUT" : "LICENSE_OCR_UNAVAILABLE";
    return { kind: "error", code, provider: PROVIDER, providerVersion: PROVIDER_VERSION };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      kind: "error",
      code: "LICENSE_OCR_INVALID_RESPONSE",
      provider: PROVIDER,
      providerVersion: PROVIDER_VERSION,
    };
  }

  if (!response.ok) {
    const errParsed = ErrorBodySchema.safeParse(body);
    const code = errParsed.success
      ? mapHttpErrorCode(errParsed.data.error)
      : "LICENSE_OCR_INTERNAL_ERROR";
    return { kind: "error", code, provider: PROVIDER, providerVersion: PROVIDER_VERSION };
  }

  const parsed = parseSuccessBody(body);
  if (!parsed) {
    return {
      kind: "error",
      code: "LICENSE_OCR_INVALID_RESPONSE",
      provider: PROVIDER,
      providerVersion: PROVIDER_VERSION,
    };
  }

  return {
    kind: "business",
    body: parsed,
    provider: PROVIDER,
    providerVersion: PROVIDER_VERSION,
  };
}

export async function extractDrivingLicenseFromImage(
  input: UaeDrivingLicenseImageInput,
): Promise<UaeDrivingLicenseEngineOutcome> {
  if (testExtract && env.NODE_ENV !== "production") {
    return testExtract(input);
  }
  return extractDrivingLicenseImpl(input);
}
