import { test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { confirmDocumentAlignmentDialog } from "./helpers/document-alignment";
import { loadDrivingLicenseOcrExpectations, seedIsolatedPublicRental } from "./helpers/driving-license-ocr";

test.use({ channel: "chrome" });
test.setTimeout(90_000);

function extractFile(body: Buffer, boundary: string): Buffer | null {
  const parts = body.toString("binary").split(`--${boundary}`);
  for (const part of parts) {
    if (!part.includes('name="file"')) continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;
    const raw = part.slice(headerEnd + 4);
    const trimmed = raw.endsWith("\r\n") ? raw.slice(0, -2) : raw;
    return Buffer.from(trimmed, "binary");
  }
  return null;
}

test("capture actual dialog export bytes", async ({ page }) => {
  const expectations = loadDrivingLicenseOcrExpectations();
  const expiredPath = path.join(process.cwd(), "e2e/fixtures/driving-license", expectations.expiredFixtureFile);
  const seed = await seedIsolatedPublicRental(`cap ${Date.now()}`);
  let captured: Buffer | null = null;
  await page.route("**/contracts/rental/*/driving-license", async (route) => {
    if (route.request().method() === "POST") {
      const buf = route.request().postDataBuffer();
      const ct = route.request().headers()["content-type"] ?? "";
      const boundary = ct.split("boundary=")[1]?.trim();
      if (buf && boundary) captured = extractFile(buf, boundary);
    }
    await route.continue();
  });
  await page.goto(`/en/rental/${seed.token}`, { waitUntil: "domcontentloaded" });
  const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
  await fileInput.setInputFiles(expiredPath);
  await confirmDocumentAlignmentDialog(page);
  await page.waitForTimeout(3000);
  if (!captured) throw new Error("no_upload_captured");
  const outDir = "C:/Users/Rw/AppData/Local/Temp/diamond-expired-jpg";
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "actual-production-export.jpg"), captured);
});
