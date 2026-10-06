import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { setDrivingLicenseDocumentAnalysisForTests } from "src/modules/contracts/ocr/driving-license-ocr.adapter";
import {
  fakeLicenseOcrResult,
  type FakeLicenseInput,
} from "./fake-vision-ai-provider";
import { createFakePassportNumberApi } from "./fake-passport-number-api";

export const TEST_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

export function imageMultipart(
  filename = "doc.png",
  mime = "image/png",
  data: Buffer = TEST_PNG,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----identitydoc";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`,
    ),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { payload, headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

export function uploadPublicDocument(
  app: FastifyInstance,
  rentalToken: string,
  kind: "driving-license" | "passport",
  file = imageMultipart(),
) {
  return app.inject({
    method: "POST",
    url: `/contracts/rental/${rentalToken}/${kind}`,
    headers: file.headers,
    payload: file.payload,
  });
}

export async function injectVisionAI(
  provider: Parameters<
    typeof import("src/modules/vision-ai/vision-ai-provider.factory").setVisionAIProviderForTests
  >[0],
) {
  const { setVisionAIProviderForTests } = await import("src/modules/vision-ai/vision-ai-provider.factory");
  setVisionAIProviderForTests(provider);
}

/** @deprecated Use injectVisionAI */
export const injectDocumentOcr = injectVisionAI;

/** VALID license + READY passport through the real public endpoints (test Document Engine hooks). */
export async function seedReadyIdentity(
  app: FastifyInstance,
  rentalToken: string,
  license: FakeLicenseInput = {},
) {
  setDrivingLicenseDocumentAnalysisForTests(async () => fakeLicenseOcrResult(license));
  const passportApi = createFakePassportNumberApi();
  await passportApi.install();
  const licenseUpload = await uploadPublicDocument(app, rentalToken, "driving-license");
  assert.equal(licenseUpload.statusCode, 200, licenseUpload.body);
  const passportUpload = await uploadPublicDocument(app, rentalToken, "passport");
  assert.equal(passportUpload.statusCode, 200, passportUpload.body);
  assert.equal(passportUpload.json().data.identity.identityReady, true, passportUpload.body);
  await passportApi.clear();
  setDrivingLicenseDocumentAnalysisForTests(undefined);
  return passportUpload;
}
