import { test, expect, type Page } from "@playwright/test";

/**
 * Staged Car-In end-to-end verification against a real RETOUT contract.
 * Not a mock: it saves a draft, reopens it, uploads/replaces/deletes photos and
 * completes the return, so the run consumes one RETOUT contract in the
 * development database (RETOUT → REVIEW, vehicle RENTED → AVAILABLE).
 *
 * Run: npx playwright test e2e/car-in-flow.verify.spec.ts
 */
test.use({ channel: "chrome" });
test.describe.configure({ timeout: 420_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
const SHOTS = "e2e/__screens__/car-in-flow";

/** 8×8 PNG — enough for an image upload without shipping binary fixtures. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAI0lEQVR4nGP8//8/AzGAiShVoxpHNY5qHNU4qnFU46hGGgIAcMoDwbQOZC0AAAAASUVORK5CYII=",
  "base64",
);
const photoFile = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

async function login(page: Page, locale: "ar" | "en") {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(`/${locale}/login`);
    if (!page.url().includes("/login")) return;
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
    try {
      await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await page.waitForTimeout(2_000);
    }
  }
}

/**
 * The Contracts row action for a RETOUT contract is "Receive vehicle". The run
 * needs a RETOUT contract in the development database; with none, there is
 * nothing to receive and the test skips instead of reporting a UI failure.
 */
async function openCarIn(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/contracts`);
  const action = page.getByRole("button", { name: locale === "ar" ? "استلام السيارة" : "Receive vehicle" }).first();
  await expect(page.getByTestId("contracts-table")).toBeVisible({ timeout: 60_000 });
  test.skip((await action.count()) === 0, "No RETOUT contract in the development database");
  await expect(action).toBeVisible({ timeout: 60_000 });
  await action.click();
  await expect(page.getByTestId("car-in-return")).toBeVisible({ timeout: 60_000 });
}

async function drawSignature(page: Page) {
  const pad = page.getByTestId("vehicle-condition-in").locator("canvas").first();
  const box = await pad.boundingBox();
  if (!box) throw new Error("signature pad not visible");
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.3, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.7, { steps: 8 });
  await page.mouse.up();
}

/**
 * The backend allows 100 requests a minute. A staff member filling a Car-In
 * never approaches that; a test driving the same flow at machine speed does,
 * so each phase pauses long enough for the window to drain.
 */
const coolDown = (page: Page) => page.waitForTimeout(22_000);

/** Any non-2xx contract call is a real failure signal: surface it in the run output. */
function reportFailedCalls(page: Page) {
  page.on("response", (res) => {
    if (res.status() >= 400 && res.url().includes("/contracts")) {
      console.log(`[${res.status()}] ${res.request().method()} ${res.url()}`);
    }
  });
}

test("RETOUT contract completes the staged Car-In and lands in REVIEW", async ({ page }) => {
  reportFailedCalls(page);
  await login(page, "ar");
  await openCarIn(page, "ar");

  const dialog = page.getByTestId("car-in-return");
  await expect(dialog.getByRole("heading", { name: "بيانات استلام السيارة" })).toBeVisible();
  const contractNumber = (await dialog.locator('dd[dir="ltr"]').first().innerText()).trim();
  await page.screenshot({ path: `${SHOTS}/01-step1-ar-1440.png`, fullPage: false });

  // Step 1: mileage, fuel, damage, notes, signature.
  await page.locator("#car-in-target-mileage").fill("48211");
  await dialog.getByRole("radio", { name: /: 3\/4$/ }).click();
  await dialog.locator('svg [role="button"]').first().click();
  await dialog.locator("textarea").fill("Returned with a scuffed front bumper.");
  await drawSignature(page);

  await dialog.getByRole("button", { name: "حفظ كمسودة" }).click();
  await expect(dialog.getByText("تم حفظ المسودة")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/02-draft-saved-ar-1440.png` });

  // Close and reopen: the saved draft comes back from the server.
  await dialog.getByRole("button", { name: "إغلاق" }).first().click();
  await coolDown(page);
  await openCarIn(page, "ar");
  await expect(page.locator("#car-in-target-mileage")).toHaveValue("48211");
  await expect(page.getByTestId("car-in-return").locator("textarea")).toHaveValue("Returned with a scuffed front bumper.");
  await expect(page.getByTestId("car-in-return").getByText("تم حفظ توقيع المستأجر عند الاستلام")).toBeVisible();

  // Step 2: the same eight required angles as Car-Out, plus the optional three.
  await coolDown(page);
  await page.getByTestId("car-in-return").getByRole("button", { name: "التالي إلى تصوير السيارة" }).click();
  await expect(page.getByText("توثيق حالة السيارة عند الاستلام بالصور")).toBeVisible({ timeout: 30_000 });

  const angles = ["FRONT", "FRONT_LEFT", "REAR_LEFT", "REAR", "REAR_RIGHT", "FRONT_RIGHT", "ODOMETER", "DASHBOARD_FUEL"];
  for (const [index, angle] of angles.entries()) {
    const slot = page.locator(`#car-in-target-${angle}`);
    await slot.locator('input[type="file"]').nth(1).setInputFiles(photoFile(`${angle}.png`));
    await expect(slot.getByRole("button", { name: "استبدال الصورة" })).toBeVisible({ timeout: 30_000 });
    if (index % 4 === 3) await coolDown(page);
  }
  // Replace one, delete and re-upload another, then add an optional slot.
  const front = page.locator("#car-in-target-FRONT");
  await front.locator('input[type="file"]').nth(1).setInputFiles(photoFile("FRONT-replaced.png"));
  await expect(front.getByRole("button", { name: "استبدال الصورة" })).toBeVisible({ timeout: 30_000 });
  const rear = page.locator("#car-in-target-REAR");
  await rear.getByRole("button", { name: "حذف" }).click();
  await expect(rear.getByRole("button", { name: "رفع صورة" })).toBeVisible({ timeout: 30_000 });
  await rear.locator('input[type="file"]').nth(1).setInputFiles(photoFile("REAR-again.png"));
  await expect(rear.getByRole("button", { name: "استبدال الصورة" })).toBeVisible({ timeout: 30_000 });
  await page.locator("#car-in-target-OTHER").locator('input[type="file"]').nth(1).setInputFiles(photoFile("OTHER.png"));

  await expect(page.getByText("المكتمل: 8/8")).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: `${SHOTS}/03-photos-ar-1440.png` });
  await coolDown(page);

  // Back preserves the saved state.
  await page.getByRole("button", { name: "رجوع إلى بيانات الاستلام" }).click();
  await expect(page.locator("#car-in-target-mileage")).toHaveValue("48211");
  await page.getByRole("button", { name: "التالي إلى تصوير السيارة" }).click();
  await expect(page.getByText("المكتمل: 8/8")).toBeVisible({ timeout: 30_000 });

  await coolDown(page);
  // Complete: confirmation dialog, then RETOUT → REVIEW without a manual refresh.
  await page.getByRole("button", { name: "تأكيد استلام السيارة" }).first().click();
  await expect(page.getByText("تأكد من اكتمال بيانات وصور الاستلام قبل المتابعة.", { exact: false })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/04-confirm-ar-1440.png` });
  await page.getByRole("button", { name: "تأكيد الاستلام" }).click();

  await expect(page.getByTestId("car-in-readonly")).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${SHOTS}/05-completed-ar-1440.png` });
  await page.getByRole("button", { name: "إغلاق" }).first().click();
  // The list reflects REVIEW from the completion response — no manual browser refresh.
  const row = page.getByTestId("contracts-table").locator("tr", { hasText: contractNumber }).first();
  await expect(row).toContainText("مراجعة التسوية", { timeout: 30_000 });
});

test("Car-In renders in English LTR and at mobile width", async ({ page }) => {
  await login(page, "en");
  await openCarIn(page, "en");
  await expect(page.getByRole("heading", { name: "Vehicle IN" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next: photograph vehicle" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-step1-en-1440.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("car-in-return")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/07-step1-en-390.png`, fullPage: true });

  await page.goto("/ar/contracts");
  await page.setViewportSize({ width: 390, height: 844 });
  await openCarIn(page, "ar");
  await page.screenshot({ path: `${SHOTS}/08-step1-ar-390.png`, fullPage: true });
});
