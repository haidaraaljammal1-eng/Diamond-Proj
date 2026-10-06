import { expect, test } from "@playwright/test";
import path from "node:path";
import { staffToken } from "./helpers/e2e-api";
import {
  assertLicenceEngineReady,
  auditDrivingLicenseOcr,
  cleanupSeededPublicRental,
  drivingLicenseFixturePath,
  installLicensePolicyDateRoute,
  loadDrivingLicenseOcrExpectations,
  seedIsolatedPublicRental,
  V12H_EXPECTED,
  v12hLocalFixturePath,
  A8_EXPECTED,
  a8LocalFixturePath,
} from "./helpers/driving-license-ocr";
import { wideLicenseFrameFixturePath } from "./helpers/license-frame-fixture";

test.use({ channel: "chrome" });
test.describe.configure({ mode: "serial", timeout: 180_000 });

const expectations = loadDrivingLicenseOcrExpectations();
const fixtureDir = path.join(process.cwd(), "e2e/fixtures/driving-license");

test.describe("Driving licence OCR V1.2 two-field (real engine)", () => {
  let rentalToken = "";
  let vehicleId = 0;
  let staff = "";

  test.beforeAll(async () => {
    await assertLicenceEngineReady();
    staff = await staffToken();
    const seeded = await seedIsolatedPublicRental(`DL OCR V12 ${Date.now().toString(36)}`);
    rentalToken = seeded.token;
    vehicleId = seeded.vehicleId;
  });

  test.afterAll(async () => {
    if (staff && vehicleId) {
      await cleanupSeededPublicRental(staff, vehicleId);
    }
  });

  test("invalid wide frame → client preflight, no OCR upload", async ({ page }) => {
    let licensePosts = 0;
    await page.goto(`/en/rental/${rentalToken}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("license-step")).toBeVisible({ timeout: 60_000 });
    await page.route("**/contracts/rental/*/driving-license", async (route) => {
      if (route.request().method() === "POST") licensePosts += 1;
      await route.continue();
    });
    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(wideLicenseFrameFixturePath());
    await expect(page.getByTestId("license-bad-frame")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/not suitable for licence verification/i)).toBeVisible();
    expect(licensePosts).toBe(0);
    await expect(
      page.getByTestId("license-capture").getByRole("button", { name: /upload another license/i }),
    ).toBeVisible();
  });

  test("upload framing hint and failed number read → re-upload required", async ({ page }) => {
    await page.goto(`/en/rental/${rentalToken}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("license-step")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/upload only the driving licence/i)).toBeVisible();

    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(drivingLicenseFixturePath());

    await expect(page.getByTestId("license-unreadable")).toBeVisible({ timeout: 120_000 });
    await expect(page.getByText(/could not read the licence details correctly/i)).toBeVisible();
    await expect(page.getByTestId("license-unreadable").getByTestId("license-status-facts")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("passport-step")).toHaveCount(0);
    await expect(page.getByTestId("renter-details-step")).toHaveCount(0);
  });

  test("expired licence after successful two-field read", async ({ page }) => {
    const expiredPath = path.join(fixtureDir, expectations.expiredFixtureFile);
    await page.goto(`/en/rental/${rentalToken}`, { waitUntil: "domcontentloaded" });
    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(expiredPath);
    await expect(page.getByTestId("license-expired")).toBeVisible({ timeout: 120_000 });
    const expiredPanel = page.getByTestId("license-expired");
    await expect(expiredPanel.getByTestId("license-status-facts")).toBeVisible();
    await expect(expiredPanel.getByText(expectations.expiredExpectation.licenseNumber)).toBeVisible();
    await expect(expiredPanel.getByText("02/07/2020")).toBeVisible();
    await expect(page.getByTestId("passport-step")).toHaveCount(0);
    await expect(page.getByTestId("renter-details-step")).toHaveCount(0);
  });
});

test.describe("Driving licence OCR V1.3.1 A8 local fixture", () => {
  let a8Token = "";
  let vehicleA8 = 0;
  let staff = "";
  const a8Path = a8LocalFixturePath();

  test.beforeAll(async () => {
    await assertLicenceEngineReady();
    staff = await staffToken();
    const seed = await seedIsolatedPublicRental(`DL A8 ${Date.now().toString(36)}`);
    a8Token = seed.token;
    vehicleA8 = seed.vehicleId;
  });

  test.afterAll(async () => {
    if (staff && vehicleA8) await cleanupSeededPublicRental(staff, vehicleA8);
  });

  test("real engine: EXPIRED card shows 2490527 and 11/09/2021", async ({ page }) => {
    await page.goto(`/en/rental/${a8Token}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("license-step")).toBeVisible({ timeout: 60_000 });
    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(a8Path);
    await expect(page.getByTestId("license-expired")).toBeVisible({ timeout: 180_000 });
    await expect(page.getByTestId("license-unreadable")).toHaveCount(0);
    const expiredPanel = page.getByTestId("license-expired");
    await expect(expiredPanel.getByTestId("license-status-facts")).toBeVisible();
    await expect(expiredPanel.getByText(A8_EXPECTED.licenseNumber)).toBeVisible();
    await expect(expiredPanel.getByText(A8_EXPECTED.expiryDisplay)).toBeVisible();
    await expect(page.getByTestId("passport-step")).toHaveCount(0);
    await expect(page.getByTestId("renter-details-step")).toHaveCount(0);

    const audit = auditDrivingLicenseOcr(a8Token);
    expect(audit.verification?.status).toBe("EXPIRED");
    expect(audit.verification?.licenseNumber).toBe(A8_EXPECTED.licenseNumber);
    expect(audit.extraction?.licenseNumber).toBe(A8_EXPECTED.licenseNumber);
  });
});

test.describe("Driving licence OCR V1.2H Marlon local fixture", () => {
  test.skip(
    process.env.E2E_ALLOW_LICENSE_POLICY_CLOCK !== "true",
    "Set E2E_ALLOW_LICENSE_POLICY_CLOCK=true on the backend for fixed-clock VALID path",
  );

  let validToken = "";
  let expiredToken = "";
  let vehicleValid = 0;
  let vehicleExpired = 0;
  let staff = "";
  const marlonPath = v12hLocalFixturePath();

  test.beforeAll(async () => {
    await assertLicenceEngineReady();
    staff = await staffToken();
    const expiredSeed = await seedIsolatedPublicRental(`DL V12H expired ${Date.now().toString(36)}`);
    expiredToken = expiredSeed.token;
    vehicleExpired = expiredSeed.vehicleId;
    const validSeed = await seedIsolatedPublicRental(`DL V12H valid ${Date.now().toString(36)}`);
    validToken = validSeed.token;
    vehicleValid = validSeed.vehicleId;
  });

  test.afterAll(async () => {
    if (staff && vehicleExpired) await cleanupSeededPublicRental(staff, vehicleExpired);
    if (staff && vehicleValid) await cleanupSeededPublicRental(staff, vehicleValid);
  });

  test("real clock: two-field read then EXPIRED policy", async ({ page }) => {
    await page.goto(`/en/rental/${expiredToken}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("license-step")).toBeVisible({ timeout: 60_000 });
    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(marlonPath);
    await expect(page.getByTestId("license-expired")).toBeVisible({ timeout: 120_000 });
    const marlonExpiredPanel = page.getByTestId("license-expired");
    await expect(marlonExpiredPanel.getByTestId("license-status-facts")).toBeVisible();
    await expect(marlonExpiredPanel.getByText(V12H_EXPECTED.licenseNumber)).toBeVisible();
    await expect(marlonExpiredPanel.getByText(V12H_EXPECTED.expiryDisplay)).toBeVisible();
    await expect(page.getByTestId("passport-step")).toHaveCount(0);
    await expect(page.getByTestId("renter-details-step")).toHaveCount(0);

    const audit = auditDrivingLicenseOcr(expiredToken);
    expect(audit.verification?.status).toBe("EXPIRED");
    expect(audit.verification?.licenseNumber).toBe(V12H_EXPECTED.licenseNumber);
    expect(audit.extraction?.licenseNumber).toBe(V12H_EXPECTED.licenseNumber);
  });

  test("test clock 2023-01-01: VALID happy path through form submit and reload", async ({
    page,
  }) => {
    await installLicensePolicyDateRoute(page, V12H_EXPECTED.testPolicyDate);
    await page.goto(`/en/rental/${validToken}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("license-step")).toBeVisible({ timeout: 60_000 });

    const fileInput = page.locator('[data-testid="license-capture"] input[type="file"]').first();
    await fileInput.setInputFiles(marlonPath);
    await expect(page.getByTestId("license-valid")).toBeVisible({ timeout: 120_000 });
    const validPanel = page.getByTestId("license-valid");
    await expect(validPanel.getByTestId("license-status-facts")).toBeVisible();
    await expect(validPanel.getByText(V12H_EXPECTED.licenseNumber)).toBeVisible();
    await expect(validPanel.getByText(V12H_EXPECTED.expiryDisplay)).toBeVisible();

    await expect(page.getByTestId("passport-step")).toBeVisible({ timeout: 60_000 });

    const passportSim = page.getByTestId("simulate-passport-ready");
    if (await passportSim.isVisible()) {
      await passportSim.click();
      await expect(page.getByTestId("passport-ready")).toBeVisible({ timeout: 60_000 });
    }

    await expect(page.getByTestId("renter-details-step")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("verified-license-number")).toContainText(
      V12H_EXPECTED.licenseNumber,
    );
    await expect(page.getByTestId("verified-license-expiry")).toContainText(
      V12H_EXPECTED.expiryDisplay,
    );
    await expect(page.getByTestId("verified-passport-number")).not.toHaveRole("textbox");

    await page.getByPlaceholder(/name/i).fill("E2E TEST CUSTOMER");
    await page.getByPlaceholder(/mobile/i).fill("+971501112233");
    await page.getByPlaceholder(/nationality/i).fill("TEST");
    await page.getByPlaceholder(/address/i).fill("Dubai Marina, UAE");

    const formSave = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/rental/") &&
        response.url().includes("/form"),
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: /save details/i }).click();
    const formResponse = await formSave;
    expect(formResponse.ok(), `form save failed: ${formResponse.status()}`).toBeTruthy();
    await expect(page.getByTestId("contract-review")).toBeVisible({ timeout: 60_000 });

    const auditBeforeReload = auditDrivingLicenseOcr(validToken);
    expect(auditBeforeReload.verification?.status).toBe("VALID");
    expect(auditBeforeReload.verification?.licenseNumber).toBe(V12H_EXPECTED.licenseNumber);
    expect(auditBeforeReload.customer?.name).toBe("E2E TEST CUSTOMER");
    expect(auditBeforeReload.extraction?.holderNameEn).toBeNull();
    expect(auditBeforeReload.extraction?.placeOfIssue).toBeNull();
    const extractionIdBeforeReload = auditBeforeReload.extraction?.id;

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("contract-review")).toBeVisible({ timeout: 60_000 });

    const auditAfterReload = auditDrivingLicenseOcr(validToken);
    expect(auditAfterReload.verification?.status).toBe("VALID");
    expect(auditAfterReload.verification?.licenseNumber).toBe(V12H_EXPECTED.licenseNumber);
    expect(auditAfterReload.extraction?.id).toBe(extractionIdBeforeReload);
    expect(auditAfterReload.customer?.name).toBe("E2E TEST CUSTOMER");
  });
});
