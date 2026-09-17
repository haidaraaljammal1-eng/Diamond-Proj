import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import {
  createFakeDocumentOcrProvider,
  type FakeLicenseInput,
} from "./fake-document-ocr-provider";

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

/**
 * Loaded lazily: the OCR factory reads validated env at import time, and test
 * modules redirect DATABASE_URL in their body.
 */
export async function injectDocumentOcr(
  provider: Parameters<
    typeof import("src/modules/document-ocr/document-ocr-provider.factory").setDocumentOcrProviderForTests
  >[0],
) {
  const { setDocumentOcrProviderForTests } = await import(
    "src/modules/document-ocr/document-ocr-provider.factory"
  );
  setDocumentOcrProviderForTests(provider);
}

/** VALID license + READY passport through the real public endpoints (synthetic OCR). */
export async function seedReadyIdentity(
  app: FastifyInstance,
  rentalToken: string,
  license: FakeLicenseInput = {},
) {
  const fake = createFakeDocumentOcrProvider();
  fake.setLicense(license);
  await injectDocumentOcr(fake.provider);
  const licenseUpload = await uploadPublicDocument(app, rentalToken, "driving-license");
  assert.equal(licenseUpload.statusCode, 200, licenseUpload.body);
  const passportUpload = await uploadPublicDocument(app, rentalToken, "passport");
  assert.equal(passportUpload.statusCode, 200, passportUpload.body);
  assert.equal(passportUpload.json().data.identity.identityReady, true, passportUpload.body);
  return passportUpload;
}
