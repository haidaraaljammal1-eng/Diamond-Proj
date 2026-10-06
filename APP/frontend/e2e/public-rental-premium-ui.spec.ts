import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  cleanupSeededPublicRental,
  seedIsolatedPublicRental,
  drivingLicenseFixturePath,
} from "./helpers/driving-license-ocr";
import { staffToken } from "./helpers/e2e-api";
import {
  completeContractReviewAndSign,
  completeIdentitySimulation,
  fillAndSaveRenterDetails,
} from "./helpers/rental-contract";
import {
  expectCardTopEdgesAligned,
  expectGridLabelValueTracksAligned,
  expectLabelColumnSpread,
  expectPageBackgroundContinuous,
  expectStackedLabelValueAligned,
  expectMainProgressAutoMotion,
  expectMainProgressConnector,
  expectStageSuccessSvgAnimating,
  expectSubProgressAutoMotion,
  expectStage1SubProgressAboveCard,
  expectStepHoverLift,
  expectSubProgressAlignedToActiveCard,
  expectSubProgressStability,
  expectValueColumnSpread,
  readBoxMetrics,
  readBoxMetricsRelativeTo,
  STAGE1_SUB_PROGRESS_GAP_TOLERANCE_PX,
} from "./helpers/column-alignment";

test.use({ channel: "chrome", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial", timeout: 240_000 });

const SHOTS = path.join("e2e", "__screens__", "public-rental-premium");
test.describe("Public rental premium UI (headed review)", () => {
  let token = "";
  let vehicleId = 0;
  let staff = "";

  test.beforeAll(async () => {
    fs.mkdirSync(SHOTS, { recursive: true });
    staff = await staffToken();
    const seed = await seedIsolatedPublicRental(`PR premium ${Date.now().toString(36)}`);
    token = seed.token;
    vehicleId = seed.vehicleId;
  });

  test.afterAll(async () => {
    if (staff && vehicleId) await cleanupSeededPublicRental(staff, vehicleId);
  });

  test("AR desktop — stage 1 layout, hover, grid alignment, happy path", async ({ page }) => {
    await page.goto(`/ar/rental/${token}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("license-step")).toBeVisible({ timeout: 60_000 });
    const subProgressSamples: Awaited<ReturnType<typeof readBoxMetrics>>[] = [];
    const workflow = page.getByTestId("stage1-workflow");
    const licencePlacement = await expectStage1SubProgressAboveCard(
      page.getByTestId("stage1-sub-progress"),
      page.getByTestId("active-stage-card"),
    );
    const licenceAlign = await expectSubProgressAlignedToActiveCard(
      page.getByTestId("stage1-sub-progress"),
      page.getByTestId("active-stage-card"),
    );
    subProgressSamples.push(
      await readBoxMetricsRelativeTo(page.getByTestId("stage1-sub-progress"), workflow),
    );
    test.info().annotations.push({
      type: "placement",
      description: `stage1 licence gap=${licencePlacement.gapPx}px align Δx=${licenceAlign.deltaX} Δw=${licenceAlign.deltaWidth}`,
    });
    await page.screenshot({ path: path.join(SHOTS, "ar-subprogress-licence-stage.png"), fullPage: false });
    await expect(page.getByTestId("rental-progress")).toBeVisible();
    const connector = await expectMainProgressConnector(page);
    test.info().annotations.push({
      type: "progress",
      description: `main connector width=${connector.width}px`,
    });
    await page.screenshot({ path: path.join(SHOTS, "ar-main-progress-normal.png"), fullPage: false });
    await page.screenshot({ path: path.join(SHOTS, "main-progress-auto-t0.png"), fullPage: false });
    await expectMainProgressAutoMotion(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, "main-progress-auto-t1.png"), fullPage: false });
    await expectSubProgressAutoMotion(page);
    await expect(page.getByTestId("rental-progress-marker-license")).toBeVisible();
    await expect(page.getByTestId("rental-progress-step-license")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("rental-summary-card")).toBeVisible();
    await expect(page.getByTestId("summary-amount")).toBeVisible();
    await expect(page.getByTestId("summary-label-office")).toHaveCount(0);
    await expect(page.getByTestId("summary-value-office")).toHaveCount(0);
    await expect(page.getByTestId("summary-value-vehicle")).toBeVisible();
    await expect(page.getByTestId("summary-value-plate")).toBeVisible();
    await expect(page.getByTestId("summary-value-duration")).toBeVisible();
    await expect(page.getByTestId("summary-value-total")).toBeVisible();

    const cardTop = await expectCardTopEdgesAligned(
      page.getByTestId("rental-summary-card"),
      page.getByTestId("active-stage-card"),
    );
    test.info().annotations.push({
      type: "alignment",
      description: `card tops summaryY=${cardTop.summaryY} mainY=${cardTop.mainY} Δy=${cardTop.delta}px`,
    });

    const valueSpread = await expectValueColumnSpread([
      page.getByTestId("summary-value-vehicle"),
      page.getByTestId("summary-value-plate"),
      page.getByTestId("summary-value-duration"),
      page.getByTestId("summary-value-total"),
    ]);
    test.info().annotations.push({
      type: "alignment",
      description: `value X positions=${valueSpread.positions.join(",")} spread=${valueSpread.spread}px`,
    });

    const labelSpread = await expectLabelColumnSpread([
      page.getByTestId("summary-label-vehicle"),
      page.getByTestId("summary-label-plate"),
      page.getByTestId("summary-label-duration"),
      page.getByTestId("summary-label-total"),
    ]);
    test.info().annotations.push({
      type: "alignment",
      description: `label column spread=${labelSpread.spread}px`,
    });

    await expectPageBackgroundContinuous(page);
    await page.screenshot({ path: path.join(SHOTS, "ar-01-stage1-license.png"), fullPage: true });
    await page.screenshot({ path: path.join(SHOTS, "ar-summary-closeup.png"), fullPage: false });
    await page.screenshot({ path: path.join(SHOTS, "ar-card-top-alignment.png"), fullPage: false });

    const licenseStepBtn = page.getByTestId("rental-progress-step-license");
    await expect(licenseStepBtn).toBeEnabled();
    await expectStepHoverLift(licenseStepBtn);
    await page.screenshot({ path: path.join(SHOTS, "ar-02-stepper-hover-license.png"), fullPage: false });

    const summaryAlign = await expectGridLabelValueTracksAligned(
      page.getByTestId("rental-summary-grid"),
      "summary-label-",
      "summary-value-",
    );
    test.info().annotations.push({
      type: "alignment",
      description: `summary label track spread=${summaryAlign.labelTrackDelta}px, value track=${summaryAlign.valueTrackDelta}px`,
    });

    await page.getByTestId("simulate-license-valid").click();
    await expect(page.getByTestId("license-valid")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("passport-step")).toBeVisible({ timeout: 30_000 });
    await expectStage1SubProgressAboveCard(
      page.getByTestId("stage1-sub-progress"),
      page.getByTestId("active-stage-card"),
    );
    await expectSubProgressAlignedToActiveCard(
      page.getByTestId("stage1-sub-progress"),
      page.getByTestId("active-stage-card"),
    );
    subProgressSamples.push(
      await readBoxMetricsRelativeTo(page.getByTestId("stage1-sub-progress"), workflow),
    );
    await page.screenshot({ path: path.join(SHOTS, "ar-subprogress-passport-stage.png"), fullPage: false });
    await expectSubProgressAutoMotion(page);
    await completeIdentitySimulation(page);
    await page.screenshot({ path: path.join(SHOTS, "ar-03-passport-stage.png"), fullPage: true });
    if (await page.getByTestId("passport-preview-image").isVisible()) {
      await page.screenshot({ path: path.join(SHOTS, "ar-passport-success-preview.png"), fullPage: false });
    }
    await expect(page.getByRole("button", { name: /رفع جواز آخر|upload another passport/i })).toBeVisible();
    await expect(page.getByTestId("passport-verified-number")).toContainText(/P\d+/i);

    const licenceFacts = await expectStackedLabelValueAligned(
      page.getByTestId("license-fact-label-number"),
      page.getByTestId("license-fact-value-number"),
    );
    test.info().annotations.push({
      type: "alignment",
      description: `licence fact stacked Δx=${licenceFacts.delta}px`,
    });

    await expect(page.getByTestId("renter-details-step")).toBeVisible();
    await expectStage1SubProgressAboveCard(
      page.getByTestId("stage1-sub-progress"),
      page.getByTestId("active-stage-card"),
    );
    subProgressSamples.push(
      await readBoxMetricsRelativeTo(page.getByTestId("stage1-sub-progress"), workflow),
    );
    const stability = await expectSubProgressStability(subProgressSamples);
    test.info().annotations.push({
      type: "placement",
      description: `sub-progress stability xSpread=${stability.xSpread}px widthSpread=${stability.widthSpread}px`,
    });
    await page.screenshot({ path: path.join(SHOTS, "ar-subprogress-renter-stage.png"), fullPage: false });
    await expect(page.getByTestId("verified-passport-number")).not.toHaveRole("textbox");
    await expect(page.getByTestId("verified-license-number")).not.toHaveRole("textbox");
    await expect(page.getByTestId("verified-license-expiry")).not.toHaveRole("textbox");

    await page.screenshot({ path: path.join(SHOTS, "ar-04-renter-form.png"), fullPage: true });
    await expectSubProgressAutoMotion(page);
    const formSave = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/rental/") &&
        response.url().includes("/form"),
      { timeout: 60_000 },
    );
    await page.getByPlaceholder(/name|الاسم/i).fill("E2E TEST CUSTOMER");
    await page.getByPlaceholder(/mobile|جوال/i).fill("+971501112233");
    await page.getByPlaceholder(/nationality|جنسية/i).fill("TEST");
    await page.getByPlaceholder(/address|عنوان/i).fill("Dubai Marina, UAE");
    await page.getByRole("button", { name: /save details|حفظ البيانات/i }).click();
    const formResponse = await formSave;
    expect(formResponse.ok()).toBeTruthy();
    const transition = page.getByTestId("stage-success-transition");
    await expect(transition).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("stage-success-message")).toContainText("تم التحقق من المستندات");
    await page.screenshot({ path: path.join(SHOTS, "documents-success-early.png"), fullPage: false });
    await expectStageSuccessSvgAnimating(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, "documents-success-check.png"), fullPage: false });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, "documents-success-pulse.png"), fullPage: false });
    await expect(page.getByTestId("contract-review")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(SHOTS, "ar-05-contract-review.png"), fullPage: true });
    await expect(page.getByTestId("contract-review-sign")).toBeVisible();
  });

  test("EN main progress connector", async ({ page }) => {
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("rental-progress")).toBeVisible({ timeout: 60_000 });
    await expectMainProgressConnector(page);
    await page.screenshot({ path: path.join(SHOTS, "en-main-progress.png"), fullPage: false });
  });

  test("EN renter form polish", async ({ page }) => {
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    const onReview = await page
      .getByTestId("contract-review")
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!onReview) {
      await completeIdentitySimulation(page);
      await fillAndSaveRenterDetails(page);
    }
    await page.getByTestId("rental-progress-step-license").click();
    await expect(page.getByTestId("renter-details-step")).toBeVisible({ timeout: 60_000 });
    await page.screenshot({ path: path.join(SHOTS, "en-01-renter-form.png"), fullPage: true });
  });

  test("mobile 390 — no horizontal overflow on renter stage", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/ar/rental/${token}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByTestId("renter-details-step").or(page.getByTestId("contract-review")),
    ).toBeVisible({ timeout: 60_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
    await page.screenshot({ path: path.join(SHOTS, "ar-mobile-renter.png"), fullPage: true });
  });

  test("negative gating — unreadable licence hides passport", async ({ page }) => {
    const isolated = await seedIsolatedPublicRental(`PR neg ${Date.now().toString(36)}`);
    try {
      await page.goto(`/en/rental/${isolated.token}`, { waitUntil: "domcontentloaded" });
      const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
      await fileInput.setInputFiles(drivingLicenseFixturePath());
      await expect(page.getByTestId("license-unreadable")).toBeVisible({ timeout: 120_000 });
      await expect(page.getByTestId("passport-step")).toHaveCount(0);
      await expect(page.getByTestId("renter-details-step")).toHaveCount(0);
    } finally {
      if (staff) await cleanupSeededPublicRental(staff, isolated.vehicleId);
    }
  });

  test("passport re-upload replaces visible number", async ({ page }) => {
    const isolated = await seedIsolatedPublicRental(`PR passport re ${Date.now().toString(36)}`);
    try {
      await page.goto(`/en/rental/${isolated.token}`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("simulate-license-valid").click();
      await expect(page.getByTestId("license-valid")).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("simulate-passport-ready").click();
      await expect(page.getByTestId("renter-details-step")).toBeVisible({ timeout: 90_000 });
      await expect(page.getByTestId("passport-verified-number")).toContainText("P1234567");

      const apiBase = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";
      let reuploadPosts = 0;
      await page.route(/\/contracts\/rental\/[^/]+\/passport$/, async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        reuploadPosts += 1;
        const current = await page.request.get(`${apiBase}/contracts/rental/${isolated.token}`);
        const json = (await current.json()) as {
          data?: { identity?: { passport?: { fields?: { passportNumber?: string } | null } } };
        };
        if (json.data?.identity?.passport?.fields) {
          json.data.identity.passport.fields.passportNumber = "B7654321";
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(json),
        });
      });

      await page.getByRole("button", { name: /upload another passport/i }).click();
      const fileInput = page.locator('[data-testid="passport-capture"] input[type="file"]');
      await fileInput.setInputFiles(drivingLicenseFixturePath());
      await expect(page.getByTestId("passport-verified-number").locator("p")).toContainText("B7654321", {
        timeout: 120_000,
      });
      expect(reuploadPosts).toBeGreaterThanOrEqual(1);
      await expect(page.getByTestId("passport-verified-number").locator("p")).not.toContainText("P1234567");
      await page.screenshot({ path: path.join(SHOTS, "en-passport-reupload.png"), fullPage: false });
    } finally {
      if (staff) await cleanupSeededPublicRental(staff, isolated.vehicleId);
    }
  });

  test("mobile 390 — passport success layout", async ({ page }) => {
    const isolated = await seedIsolatedPublicRental(`PR mob pass ${Date.now().toString(36)}`);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/ar/rental/${isolated.token}`, { waitUntil: "domcontentloaded" });
      await completeIdentitySimulation(page);
      await expect(page.getByTestId("renter-details-step")).toBeVisible({ timeout: 60_000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      expect(overflow).toBe(false);
      await page.screenshot({ path: path.join(SHOTS, "ar-mobile-passport-success.png"), fullPage: true });
    } finally {
      if (staff) await cleanupSeededPublicRental(staff, isolated.vehicleId);
    }
  });

  test("AR cinematic — contract sign success transition", async ({ page }) => {
    const isolated = await seedIsolatedPublicRental(`PR sign cinematic ${Date.now().toString(36)}`);
    try {
      await page.goto(`/ar/rental/${isolated.token}`, { waitUntil: "domcontentloaded" });
      await completeIdentitySimulation(page);
      await fillAndSaveRenterDetails(page);
      await completeContractReviewAndSign(page, {
      onStageSuccessVisible: async () => {
        await expect(page.getByTestId("stage-success-message")).toContainText("تم توقيع العقد بنجاح");
        await page.screenshot({ path: path.join(SHOTS, "contract-success-check.png"), fullPage: false });
        await page.waitForTimeout(450);
        await page.screenshot({ path: path.join(SHOTS, "contract-success-text.png"), fullPage: false });
      },
      });
      await expect(page.getByTestId("stage-success-transition")).toHaveCount(0);
    } finally {
      if (staff) await cleanupSeededPublicRental(staff, isolated.vehicleId);
    }
  });

  test("failed save — no success transition", async ({ page }) => {
    const isolated = await seedIsolatedPublicRental(`PR fail save ${Date.now().toString(36)}`);
    try {
      await page.goto(`/en/rental/${isolated.token}`, { waitUntil: "domcontentloaded" });
      await completeIdentitySimulation(page);
      await expect(page.getByTestId("renter-details-step")).toBeVisible({ timeout: 60_000 });
      await page.route(/\/contracts\/rental\/[^/]+\/form$/, (route) => {
        if (route.request().method() !== "POST") {
          void route.continue();
          return;
        }
        void route.fulfill({ status: 422, contentType: "application/json", body: '{"error":{"code":"VALIDATION"}}' });
      });
      await page.getByPlaceholder(/name/i).fill("E2E FAIL");
      await page.getByPlaceholder(/mobile/i).fill("+971501112233");
      await page.getByPlaceholder(/nationality/i).fill("TEST");
      await page.getByPlaceholder(/address/i).fill("Dubai");
      await page.getByRole("button", { name: /save details/i }).click();
      await page.waitForTimeout(1500);
      await expect(page.getByTestId("stage-success-transition")).toHaveCount(0);
      await expect(page.getByTestId("renter-details-step")).toBeVisible();
    } finally {
      if (staff) await cleanupSeededPublicRental(staff, isolated.vehicleId);
    }
  });

  test("refresh resume — saved form stays on contract review", async ({ page }) => {
    await page.goto(`/en/rental/${token}`, { waitUntil: "domcontentloaded" });
    const onReview = await page
      .getByTestId("contract-review")
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    if (!onReview) {
      await completeIdentitySimulation(page);
      await fillAndSaveRenterDetails(page);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("contract-review")).toBeVisible({ timeout: 60_000 });
  });
});

test.describe("Public rental reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("main and sub progress — static comet disabled", async ({ page }) => {
    const localStaff = await staffToken();
    const seed = await seedIsolatedPublicRental(`PR reduce ${Date.now().toString(36)}`);
    try {
      await page.goto(`/en/rental/${seed.token}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("license-step")).toBeVisible({ timeout: 60_000 });
      const segment = page.getByTestId("rental-progress-connector-pulse-segment");
      const mainAnim = await segment.evaluate((el) => getComputedStyle(el).animationName);
      expect(mainAnim === "none" || mainAnim === "").toBeTruthy();
      const comet = page.getByTestId("document-sub-progress-comet");
      const subAnim = await comet.evaluate((el) => getComputedStyle(el).animationName);
      expect(subAnim === "none" || subAnim === "").toBeTruthy();
      await expect(page.getByTestId("rental-progress-connector-base")).toBeVisible();
    } finally {
      await cleanupSeededPublicRental(localStaff, seed.vehicleId);
    }
  });
});
