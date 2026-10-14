import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 180_000, retries: 1 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

const VIEWPORTS = [
  { width: 1920, height: 1080, label: "1920x1080" },
  { width: 1440, height: 900, label: "1440x900" },
  { width: 1366, height: 768, label: "1366x768" },
  { width: 1024, height: 768, label: "1024x768" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 390, height: 844, label: "390x844" },
  { width: 375, height: 667, label: "375x667" },
  { width: 1366, height: 580, label: "1366x580-short" },
] as const;

const WHATSAPP_SOON_AR = /قريباً — ستتوفر مشاركة الصور عبر واتساب المكتب/;
const WHATSAPP_SOON_EN = /Coming soon — office WhatsApp sharing/i;

async function login(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/login`);
  await page.locator("#email").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  const loginLabel = locale === "ar" ? /دخول/i : /login|sign in/i;
  await page.getByRole("button", { name: loginLabel }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 90_000 });
}

async function openVehicleDetail(page: Page, locale: "ar" | "en") {
  await page.goto(`/${locale}/vehicles`);
  await expect(page.getByTestId("vehicles-grid")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("vehicle-card").first().click();
  await expect(page.getByTestId("vehicle-detail")).toBeVisible({ timeout: 20_000 });
}

function boxBottom(box: { y: number; height: number }) {
  return box.y + box.height;
}

async function assertDialogLayout(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  for (let i = 0; i < 4; i++) {
    await expect(page.getByTestId(`vehicle-detail-gallery-slot-${i}`)).toBeVisible();
  }

  const gallery = page.getByTestId("vehicle-detail-gallery");
  const plate = page.getByTestId("vehicle-detail-plate-line");
  const galleryBox = await gallery.boundingBox();
  const plateBox = await plate.boundingBox();
  expect(galleryBox).toBeTruthy();
  expect(plateBox).toBeTruthy();
  if (galleryBox && plateBox) {
    expect(plateBox.y).toBeGreaterThan(galleryBox.y);
  }

  const whatsApp = page.getByTestId("vehicle-detail-whatsapp-share");
  await expect(whatsApp).toBeVisible();
  await expect(whatsApp).toBeDisabled();
  await expect(page.getByText(WHATSAPP_SOON_AR)).toHaveCount(0);
  await expect(page.getByText(WHATSAPP_SOON_EN)).toHaveCount(0);

  const mainScroll = page.getByTestId("vehicle-detail-main-scroll");
  const scrollTop = await mainScroll.evaluate((el) => el.scrollTop);
  expect(scrollTop).toBe(0);

  await mainScroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });

  const footer = page.getByTestId("vehicle-detail-action-footer");
  await expect(footer).toBeVisible();
  const footerBox = await footer.boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(footerBox).toBeTruthy();
  expect(dialogBox).toBeTruthy();
  if (footerBox && dialogBox) {
    expect(boxBottom(footerBox)).toBeLessThanOrEqual(boxBottom(dialogBox) + 4);
    expect(footerBox.y).toBeGreaterThanOrEqual(dialogBox.y - 2);
  }

  const footerButton = footer.locator("button").first();
  if (await footerButton.count()) {
    await expect(footerButton).toBeEnabled();
    const btnBox = await footerButton.boundingBox();
    if (btnBox && dialogBox) {
      expect(boxBottom(btnBox)).toBeLessThanOrEqual(boxBottom(dialogBox) + 2);
    }
  }

  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflowX).toBe(false);
}

test.describe("Vehicle detail gallery", () => {
  for (const viewport of VIEWPORTS) {
    test(`Arabic layout ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await login(page, "ar");
      await openVehicleDetail(page, "ar");
      await assertDialogLayout(page);
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    });
  }

  for (const viewport of VIEWPORTS) {
    test(`English layout ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await login(page, "en");
      await openVehicleDetail(page, "en");
      await assertDialogLayout(page);
      await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    });
  }

  test("screenshots desktop and mobile Arabic", async ({ page }) => {
    await login(page, "ar");
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openVehicleDetail(page, "ar");
    await assertDialogLayout(page);
    await page.screenshot({
      path: path.join("test-results", "vehicle-detail-dialog-desktop-ar.png"),
      fullPage: false,
    });

    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await openVehicleDetail(page, "ar");
    await assertDialogLayout(page);
    await page.screenshot({
      path: path.join("test-results", "vehicle-detail-dialog-mobile-ar.png"),
      fullPage: false,
    });
  });
});
