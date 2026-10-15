import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  adjustDocumentAlignmentDialog,
  cancelDocumentAlignmentDialog,
  confirmDocumentAlignmentDialog,
  expectDocumentAlignmentDialog,
} from "./helpers/document-alignment";
import path from "node:path";
import {
  cleanupSeededPublicRental,
  drivingLicenseFixturePath,
  loadDrivingLicenseOcrExpectations,
  seedIsolatedPublicRental,
} from "./helpers/driving-license-ocr";
import { staffToken } from "./helpers/e2e-api";
import { E2E_TEST_TIMEOUT_MS } from "./helpers/test-timeout";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: E2E_TEST_TIMEOUT_MS });

function extractMultipartFile(body: Buffer, boundary: string): Buffer | null {
  const marker = Buffer.from(`--${boundary}`);
  const parts = body.toString("binary").split(marker.toString("binary"));
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

test.describe("Document alignment dialog", () => {
  let token = "";
  let vehicleId = 0;
  let staff = "";

  test.beforeAll(async () => {
    staff = await staffToken();
    const seed = await seedIsolatedPublicRental(`align ${Date.now().toString(36)}`);
    token = seed.token;
    vehicleId = seed.vehicleId;
  });

  test.afterAll(async () => {
    if (staff && vehicleId) await cleanupSeededPublicRental(staff, vehicleId);
  });

  test("license JPG opens dialog; cancel does not upload", async ({ page }) => {
    let posts = 0;
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    await page.route("**/contracts/rental/*/driving-license", async (route) => {
      if (route.request().method() === "POST") posts += 1;
      await route.continue();
    });
    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(drivingLicenseFixturePath());
    await expectDocumentAlignmentDialog(page);
    await expect(page.getByTestId("document-alignment-dialog")).toHaveAttribute("data-kind", "license");
    await cancelDocumentAlignmentDialog(page);
    expect(posts).toBe(0);
  });

  test("license second pick reopens dialog with reset controls", async ({ page }) => {
    await page.goto(`/ar/rental/${token}`, { waitUntil: "domcontentloaded" });
    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(drivingLicenseFixturePath());
    await expectDocumentAlignmentDialog(page);
    await page.getByRole("button", { name: /rotate right|تدوير لليمين/i }).click();
    await cancelDocumentAlignmentDialog(page);
    await fileInput.setInputFiles(drivingLicenseFixturePath());
    await expectDocumentAlignmentDialog(page);
    await cancelDocumentAlignmentDialog(page);
  });

  test("mobile viewport — dialog visible without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(drivingLicenseFixturePath());
    await expectDocumentAlignmentDialog(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
    await cancelDocumentAlignmentDialog(page);
  });

  test("preview blob hash matches upload multipart file hash", async ({ page }) => {
    let uploadBody: Buffer | null = null;
    let uploadContentType = "";
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    await page.route("**/contracts/rental/*/driving-license", async (route) => {
      if (route.request().method() === "POST") {
        uploadBody = route.request().postDataBuffer() ?? null;
        uploadContentType = route.request().headers()["content-type"] ?? "";
      }
      await route.continue();
    });
    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(drivingLicenseFixturePath());
    await adjustDocumentAlignmentDialog(page, { panDx: 30, panDy: -20, rotateRightClicks: 2, zoomInClicks: 1 });
    await confirmDocumentAlignmentDialog(page);
    await expect.poll(() => uploadBody).not.toBeNull();
    const boundary = uploadContentType.split("boundary=")[1]?.trim();
    expect(boundary).toBeTruthy();
    const filePart = extractMultipartFile(uploadBody!, boundary!);
    expect(filePart).toBeTruthy();
    const previewImg = page.locator('[data-testid="license-capture-preview"]');
    await expect(previewImg).toBeVisible({ timeout: 30_000 });
    const previewSrc = await previewImg.getAttribute("src");
    const previewBytes = await page.evaluate(async (src) => {
      const response = await fetch(src!);
      return Array.from(new Uint8Array(await response.arrayBuffer()));
    }, previewSrc);
    const previewHash = createHash("sha256").update(Buffer.from(previewBytes)).digest("hex");
    const uploadHash = createHash("sha256").update(filePart!).digest("hex");
    expect(previewHash).toBe(uploadHash);

    const engineBoundary = `----Eng${Date.now()}`;
    const engineBody = Buffer.concat([
      Buffer.from(
        `--${engineBoundary}\r\nContent-Disposition: form-data; name="image"; filename="export.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      filePart!,
      Buffer.from(`\r\n--${engineBoundary}--\r\n`),
    ]);
    const engineRes = await fetch("http://127.0.0.1:8020/extract-driving-license", {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${engineBoundary}` },
      body: engineBody,
    });
    const engineJson = (await engineRes.json()) as { document_status?: string };
    expect(["ACCEPT", "EXPIRED"]).toContain(String(engineJson.document_status ?? "").toUpperCase());
  });

  test("expired corpus default export is engine-acceptable", async ({ page }) => {
    const expectations = loadDrivingLicenseOcrExpectations();
    const expiredPath = path.join(
      process.cwd(),
      "e2e/fixtures/driving-license",
      expectations.expiredFixtureFile,
    );
    let uploadBody: Buffer | null = null;
    let uploadContentType = "";
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    await page.route("**/contracts/rental/*/driving-license", async (route) => {
      if (route.request().method() === "POST") {
        uploadBody = route.request().postDataBuffer() ?? null;
        uploadContentType = route.request().headers()["content-type"] ?? "";
      }
      await route.continue();
    });
    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(expiredPath);
    await confirmDocumentAlignmentDialog(page);
    await expect.poll(() => uploadBody).not.toBeNull();
    const boundary = uploadContentType.split("boundary=")[1]?.trim();
    const filePart = extractMultipartFile(uploadBody!, boundary!);
    const engineBoundary = `----Eng${Date.now()}`;
    const engineBody = Buffer.concat([
      Buffer.from(
        `--${engineBoundary}\r\nContent-Disposition: form-data; name="image"; filename="export.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      filePart!,
      Buffer.from(`\r\n--${engineBoundary}--\r\n`),
    ]);
    const engineRes = await fetch("http://127.0.0.1:8020/extract-driving-license", {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${engineBoundary}` },
      body: engineBody,
    });
    const engineJson = (await engineRes.json()) as { document_status?: string };
    expect(String(engineJson.document_status ?? "").toUpperCase()).toBe("ACCEPT");
  });

  test("edit current opens dialog after valid licence with prior adjustments", async ({ page }) => {
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(drivingLicenseFixturePath());
    await adjustDocumentAlignmentDialog(page, { zoomInClicks: 2 });
    const brightnessSlider = page.getByRole("slider", { name: /brightness/i });
    await brightnessSlider.evaluate((el) => {
      el.value = "110";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await confirmDocumentAlignmentDialog(page);
    await expect(page.getByTestId("license-edit-current")).toBeVisible({ timeout: 120_000 });
    await page.getByTestId("license-edit-current").click();
    await expectDocumentAlignmentDialog(page);
    await expect(brightnessSlider).toHaveValue("110");
    await cancelDocumentAlignmentDialog(page);
  });

  test("confirm triggers exactly one licence upload", async ({ page }) => {
    let posts = 0;
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    await page.route("**/contracts/rental/*/driving-license", async (route) => {
      if (route.request().method() === "POST") posts += 1;
      await route.continue();
    });
    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(drivingLicenseFixturePath());
    await confirmDocumentAlignmentDialog(page);
    await expect(page.getByTestId("license-verifying").or(page.getByTestId("license-unreadable"))).toBeVisible({
      timeout: 90_000,
    });
    expect(posts).toBe(1);
  });
});
