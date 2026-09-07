import { test, expect, type Locator, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

test.use({ channel: "chrome" });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

const DARK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const LIGHT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
  "base64",
);

const shotsDir = join(process.cwd(), "test-results/replace-photo-ui");

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

async function login(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30_000,
  });
  await page.goto(`/${locale}/vehicles`);
  await expect(page.getByTestId("vehicles-grid")).toBeVisible({ timeout: 20_000 });
}

async function openFirstVehicle(page: Page) {
  await page.getByTestId("vehicle-card").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("vehicle-detail")).toBeVisible({ timeout: 15_000 });
  return dialog;
}

async function assertSecondaryStrong(button: Locator) {
  const css = await button.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      color: s.color,
      backgroundImage: s.backgroundImage,
      backgroundColor: s.backgroundColor,
      borderTopWidth: s.borderTopWidth,
      borderTopColor: s.borderTopColor,
      borderRadius: s.borderRadius,
      boxShadow: s.boxShadow,
      height: s.height,
      fontWeight: s.fontWeight,
    };
  });
  expect(css.color).toBe("rgb(138, 102, 48)");
  expect(css.backgroundImage).toContain("linear-gradient");
  expect(css.backgroundImage).not.toContain("var(--diamond-gold-gradient)");
  expect(Number.parseFloat(css.borderTopWidth)).toBeGreaterThanOrEqual(1.4);
  expect(Number.parseFloat(css.borderRadius)).toBeLessThan(20);
  expect(css.boxShadow).not.toBe("none");
  expect(Number.parseFloat(css.height)).toBeGreaterThanOrEqual(34);
  expect(Number.parseInt(css.fontWeight, 10)).toBeGreaterThanOrEqual(600);
}

function photoButton(dialog: Locator, name: string): Locator {
  return dialog.locator("button", { hasText: name });
}

async function assertNoOverlap(dialog: Locator, buttonName: string) {
  const button = photoButton(dialog, buttonName);
  const title = dialog.getByTestId("vehicle-detail").locator("h3").first();
  const plate = dialog.getByTestId("vehicle-detail").locator("h3 + p").first();
  const buttonBox = await button.boundingBox();
  const titleBox = await title.boundingBox();
  const plateBox = await plate.boundingBox();
  expect(buttonBox).toBeTruthy();
  expect(titleBox).toBeTruthy();
  if (buttonBox && titleBox) expect(overlaps(buttonBox, titleBox)).toBe(false);
  if (buttonBox && plateBox && plateBox.width > 0) {
    expect(overlaps(buttonBox, plateBox)).toBe(false);
  }
}

test("Vehicle Detail replace/upload photo button UI", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(shotsDir, { recursive: true });

  await login(page, "ar");
  let dialog = await openFirstVehicle(page);

  const emptyCopy = dialog.getByText("لم يتم رفع صورة");
  const uploadAr = photoButton(dialog, "رفع صورة");
  const replaceAr = photoButton(dialog, "استبدال الصورة");

  if (await emptyCopy.isVisible()) {
    await expect(uploadAr).toBeVisible();
    await assertSecondaryStrong(uploadAr);
    await dialog.screenshot({ path: join(shotsDir, "ar-no-photo.png") });
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "dark.png",
      mimeType: "image/png",
      buffer: DARK_PNG,
    });
    await expect(replaceAr).toBeVisible({ timeout: 20_000 });
  } else {
    await dialog.locator('input[type="file"]').setInputFiles({
      name: "dark.png",
      mimeType: "image/png",
      buffer: DARK_PNG,
    });
  }

  await expect(replaceAr).toBeVisible({ timeout: 20_000 });
  await expect(replaceAr).toBeEnabled({ timeout: 20_000 });
  await expect(dialog.getByTestId("vehicle-detail").locator("img")).toBeVisible({
    timeout: 15_000,
  });
  await assertSecondaryStrong(replaceAr);
  await assertNoOverlap(dialog, "استبدال الصورة");
  await dialog.screenshot({ path: join(shotsDir, "ar-replace-dark.png") });

  await dialog.locator('input[type="file"]').setInputFiles({
    name: "light.png",
    mimeType: "image/png",
    buffer: LIGHT_PNG,
  });
  await expect(replaceAr).toBeEnabled({ timeout: 20_000 });
  await expect(dialog.getByTestId("vehicle-detail").locator("img")).toBeVisible({
    timeout: 15_000,
  });
  await assertSecondaryStrong(replaceAr);
  await assertNoOverlap(dialog, "استبدال الصورة");
  await dialog.screenshot({ path: join(shotsDir, "ar-replace-light.png") });

  const htmlDir = await page.locator("html").getAttribute("dir");
  expect(htmlDir).toBe("rtl");
  const iconOnStart = await replaceAr.evaluate((el) => {
    const icon = el.querySelector("svg");
    if (!icon) return false;
    const buttonBox = el.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    return iconBox.right > buttonBox.left + buttonBox.width / 2;
  });
  expect(iconOnStart).toBe(true);

  await page.keyboard.press("Escape");

  await login(page, "en");
  dialog = await openFirstVehicle(page);
  const replaceEn = photoButton(dialog, "Replace Photo");
  await expect(replaceEn).toBeVisible({ timeout: 15_000 });
  await assertSecondaryStrong(replaceEn);
  await assertNoOverlap(dialog, "Replace Photo");
  const enDir = await page.locator("html").getAttribute("dir");
  expect(enDir).toBe("ltr");
  const iconOnStartLtr = await replaceEn.evaluate((el) => {
    const icon = el.querySelector("svg");
    if (!icon) return false;
    const buttonBox = el.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    return iconBox.left < buttonBox.left + buttonBox.width / 2;
  });
  expect(iconOnStartLtr).toBe(true);
  await dialog.screenshot({ path: join(shotsDir, "en-replace.png") });
});
