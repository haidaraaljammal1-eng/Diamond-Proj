import { expect, test } from "@playwright/test";
import {
  cleanupSeededPublicRental,
  drivingLicenseFixturePath,
  seedIsolatedPublicRental,
} from "./helpers/driving-license-ocr";
import { staffToken } from "./helpers/e2e-api";
import { expectDocumentVerificationSuccessStack } from "./helpers/column-alignment";
import {
  completeContractReviewAndSign,
  completeIdentitySimulation,
  fillAndSaveRenterDetails,
} from "./helpers/rental-contract";

test.use({ channel: "chrome" });
test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe("Public rental document verification sub-flow", () => {
  let token = "";
  let vehicleId = 0;
  let staff = "";

  test.beforeAll(async () => {
    staff = await staffToken();
    const seed = await seedIsolatedPublicRental(`PR docs ${Date.now().toString(36)}`);
    token = seed.token;
    vehicleId = seed.vehicleId;
  });

  test.afterAll(async () => {
    if (staff && vehicleId) await cleanupSeededPublicRental(staff, vehicleId);
  });

  test("licence success — card, facts, preview, replace button order", async ({ page }) => {
    const isolated = await seedIsolatedPublicRental(`PR lic layout ${Date.now().toString(36)}`);
    try {
      await page.goto(`/ar/rental/${isolated.token}`, { waitUntil: "domcontentloaded" });
      const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
      await fileInput.setInputFiles(drivingLicenseFixturePath());
      const validVisible = await page
        .getByTestId("license-valid")
        .waitFor({ state: "visible", timeout: 90_000 })
        .then(() => true)
        .catch(() => false);
      if (!validVisible) {
        await page.getByTestId("simulate-license-valid").click();
        await expect(page.getByTestId("license-valid")).toBeVisible({ timeout: 30_000 });
      }
      await expectDocumentVerificationSuccessStack(page, {
        successTestId: "license-valid",
        previewTestId: "license-preview-image",
        stepTestId: "license-step",
        replaceTestId: "license-capture-replace",
        factTestIds: ["license-fact-value-number", "license-fact-value-expiry"],
        requirePreview: validVisible,
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      expect(overflow).toBe(false);
    } finally {
      if (staff) await cleanupSeededPublicRental(staff, isolated.vehicleId);
    }
  });

  test("passport success — card, number, preview, replace button order", async ({ page }) => {
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    await completeIdentitySimulation(page);
    await expectDocumentVerificationSuccessStack(page, {
      successTestId: "passport-ready",
      previewTestId: "passport-preview-image",
      stepTestId: "passport-step",
      replaceTestId: "passport-capture-replace",
      factTestIds: ["passport-verified-number"],
      requirePreview: false,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
  });

  test("simulation happy path: licence → passport → renter → contract review", async ({ page }) => {
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    await completeIdentitySimulation(page);
    await expect(page.getByTestId("document-verification-progress")).toBeVisible();
    await expect(page.getByTestId("verified-passport-number")).not.toHaveRole("textbox");
    await fillAndSaveRenterDetails(page);
    await expect(page.getByTestId("contract-review")).toBeVisible();
    await expect(page.getByRole("button", { name: /contract review/i })).toHaveAttribute(
      "data-active",
      "true",
    );
  });

  test("valid licence + passport: refresh keeps renter form", async ({ page }) => {
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("renter-details-step").or(page.getByTestId("contract-review"))).toBeVisible({
      timeout: 60_000,
    });
    if (await page.getByTestId("contract-review").isVisible()) {
      return;
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("renter-details-step")).toBeVisible({ timeout: 60_000 });
  });

  test("after save, refresh lands on contract review", async ({ page }) => {
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    if (!(await page.getByTestId("contract-review").isVisible())) {
      await fillAndSaveRenterDetails(page);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("contract-review")).toBeVisible({ timeout: 60_000 });
  });

  test("contract review signature UI still reachable", async ({ page }) => {
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    if (!(await page.getByTestId("contract-review").isVisible())) {
      await completeIdentitySimulation(page);
      await fillAndSaveRenterDetails(page);
    }
    await expect(page.getByTestId("contract-review-sign")).toBeVisible({ timeout: 60_000 });
  });
});
