import { env } from "src/config/env";
import {
  classifyNetworkError,
  fetchWithTimeout,
} from "src/modules/integrations/adapters/types";
import type {
  PassportNumberApiClientErrorCode,
  PassportNumberApiSuccessBody,
  PassportNumberEngineOutcome,
  PassportNumberImageInput,
} from "src/modules/document-engine/passport-number-api.types";

const PROVIDER = "passport-number-engine";
const PROVIDER_VERSION = "document-engine/passport";

type ExtractFn = (input: PassportNumberImageInput) => Promise<PassportNumberEngineOutcome>;

let testExtract: ExtractFn | undefined;

/** Automated-test injection only. Refused in production. */
export function setPassportNumberApiClientForTests(fn: ExtractFn | undefined): void {
  if (env.NODE_ENV === "production" && fn !== undefined) {
    throw new Error("Passport Number API test client cannot be injected in production");
  }
  testExtract = fn;
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  return ".bin";
}

function parseSuccessBody(body: unknown): PassportNumberApiSuccessBody | null {
  if (typeof body !== "object" || body === null) return null;
  const o = body as Record<string, unknown>;
  if (o.status !== "VALID" && o.status !== "REVIEW") return null;
  if (o.status === "VALID") {
    if (typeof o.passport_number !== "string" || !o.passport_number.trim()) return null;
    return { status: "VALID", passport_number: o.passport_number.trim() };
  }
  if (o.passport_number !== null) return null;
  return { status: "REVIEW", passport_number: null };
}

async function extractPassportNumberImpl(
  input: PassportNumberImageInput,
): Promise<PassportNumberEngineOutcome> {
  const baseUrl = env.PASSPORT_NUMBER_API_URL?.trim();
  if (!baseUrl) {
    return {
      kind: "error",
      code: "NOT_CONFIGURED",
      provider: PROVIDER,
      providerVersion: PROVIDER_VERSION,
    };
  }

  const filename =
    input.filename?.trim() ||
    `passport${extensionForMime(input.mimeType)}`;

  const form = new FormData();
  const blob = new Blob([input.bytes], { type: input.mimeType });
  form.append("image", blob, filename);

  const url = `${baseUrl.replace(/\/$/, "")}/extract-passport-number`;
  const timeoutMs = env.PASSPORT_NUMBER_API_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      url,
      { method: "POST", body: form },
      timeoutMs,
    );
  } catch (error: unknown) {
    const net = classifyNetworkError(error);
    const code: PassportNumberApiClientErrorCode =
      net.code === "TIMEOUT" ? "TIMEOUT" : "CONNECTION_FAILED";
    return {
      kind: "error",
      code,
      provider: PROVIDER,
      providerVersion: PROVIDER_VERSION,
    };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      kind: "error",
      code: "INVALID_RESPONSE",
      provider: PROVIDER,
      providerVersion: PROVIDER_VERSION,
    };
  }

  if (!response.ok) {
    return {
      kind: "error",
      code: "HTTP_ERROR",
      provider: PROVIDER,
      providerVersion: PROVIDER_VERSION,
    };
  }

  const parsed = parseSuccessBody(body);
  if (!parsed) {
    return {
      kind: "error",
      code: "INVALID_RESPONSE",
      provider: PROVIDER,
      providerVersion: PROVIDER_VERSION,
    };
  }

  if (parsed.status === "VALID") {
    return {
      kind: "business",
      status: "VALID",
      passportNumber: parsed.passport_number!,
      provider: PROVIDER,
      providerVersion: PROVIDER_VERSION,
    };
  }

  return {
    kind: "business",
    status: "REVIEW",
    provider: PROVIDER,
    providerVersion: PROVIDER_VERSION,
  };
}

export async function extractPassportNumberFromImage(
  input: PassportNumberImageInput,
): Promise<PassportNumberEngineOutcome> {
  if (testExtract && env.NODE_ENV !== "production") {
    try {
      return await testExtract(input);
    } catch {
      return {
        kind: "error",
        code: "INVALID_RESPONSE",
        provider: PROVIDER,
        providerVersion: PROVIDER_VERSION,
      };
    }
  }
  return extractPassportNumberImpl(input);
}
