import { test, expect, type Page } from "@playwright/test";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 120_000 });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

async function staffLogin(page: Page) {
  await page.goto("/ar/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

async function waitForGpsReady(page: Page) {
  await expect(page.getByTestId("gps-summary")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".leaflet-container")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("gps-vehicle-row").first()).toBeVisible({ timeout: 30_000 });
}

type GpsLayoutMetrics = {
  mainScrollTop: number;
  kpiTop: number;
  kpiDisplay: string;
  mapW: number;
  mapH: number;
};

async function readMetrics(page: Page): Promise<GpsLayoutMetrics> {
  return page.evaluate(() => {
    const main = document.getElementById("app-main");
    const kpi = document.querySelector('[data-testid="gps-summary"]');
    const map = document.querySelector('[data-testid="gps-map"]');
    const kpiRect = kpi?.getBoundingClientRect();
    const mapRect = map?.getBoundingClientRect();
    return {
      mainScrollTop: main?.scrollTop ?? 0,
      kpiTop: kpiRect?.top ?? 0,
      kpiDisplay: kpi ? getComputedStyle(kpi).display : "",
      mapW: mapRect?.width ?? 0,
      mapH: mapRect?.height ?? 0,
    };
  });
}

async function resetMainScroll(page: Page) {
  await page.evaluate(() => {
    const main = document.getElementById("app-main");
    if (main) main.scrollTop = 0;
  });
  await page.waitForTimeout(100);
}

async function clickEmptyMap(page: Page) {
  const map = page.locator("[data-testid='gps-map'] .leaflet-container");
  await expect(map).toBeVisible();
  const box = await map.boundingBox();
  if (!box) throw new Error("map box missing");
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45);
}

async function shortMapDrag(page: Page) {
  const map = page.locator("[data-testid='gps-map'] .leaflet-container");
  const box = await map.boundingBox();
  if (!box) throw new Error("map box missing");
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 40, y + 30, { steps: 6 });
  await page.mouse.up();
}

async function assertKpiStable(
  before: GpsLayoutMetrics,
  after: GpsLayoutMetrics,
  mainTopTolerance = 8,
) {
  expect(after.kpiDisplay).toBe("grid");
  expect(Math.abs(after.mainScrollTop - before.mainScrollTop)).toBeLessThan(mainTopTolerance);
  expect(Math.abs(after.kpiTop - before.kpiTop)).toBeLessThan(12);
  expect(Math.abs(after.mapW - before.mapW)).toBeLessThan(2);
  expect(Math.abs(after.mapH - before.mapH)).toBeLessThan(2);
}

test.describe("GPS KPI stability on map interaction", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1177, height: 583 });
    await staffLogin(page);
    await page.goto("/ar/gps");
    await waitForGpsReady(page);
    await resetMainScroll(page);
  });

  test("map click/drag/wheel does not scroll page or move KPI at 1177×583", async ({ page }) => {
    const baseline = await readMetrics(page);
    expect(baseline.mainScrollTop).toBe(0);
    expect(baseline.mapH).toBeGreaterThan(500);

    const heights = await page.evaluate(() => {
      const map = document.querySelector("[data-testid='gps-map']")?.getBoundingClientRect();
      const fleet = document.querySelector("[data-testid='gps-vehicle-panel']")?.getBoundingClientRect();
      const list = document.querySelector("[data-testid='gps-vehicle-list']");
      return {
        mapH: map?.height ?? 0,
        fleetH: fleet?.height ?? 0,
        listOverflow: list ? getComputedStyle(list).overflowY : "",
      };
    });
    expect(Math.abs(heights.mapH - heights.fleetH)).toBeLessThan(3);
    expect(heights.listOverflow).toBe("auto");

    await clickEmptyMap(page);
    await page.waitForTimeout(500);
    const afterClick = await readMetrics(page);
    assertKpiStable(baseline, afterClick);

    await shortMapDrag(page);
    await page.waitForTimeout(300);
    const afterDrag = await readMetrics(page);
    assertKpiStable(baseline, afterDrag);

    const map = page.locator("[data-testid='gps-map'] .leaflet-container");
    const box = await map.boundingBox();
    if (!box) throw new Error("map box missing");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(400);
    const afterZoom = await readMetrics(page);
    assertKpiStable(baseline, afterZoom, 12);
  });

  test("preserves manual main scroll after map click at 1177×583", async ({ page }) => {
    await page.evaluate(() => {
      const main = document.getElementById("app-main");
      if (main) main.scrollTop = 250;
    });
    await page.waitForTimeout(100);
    const before = await readMetrics(page);
    expect(before.mainScrollTop).toBeGreaterThan(200);

    await clickEmptyMap(page);
    await page.waitForTimeout(500);
    const after = await readMetrics(page);
    expect(Math.abs(after.mainScrollTop - before.mainScrollTop)).toBeLessThan(8);
    expect(after.kpiDisplay).toBe("grid");
  });

  test("same stability at 1366×768", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto("/ar/gps");
    await waitForGpsReady(page);
    await resetMainScroll(page);
    const baseline = await readMetrics(page);
    await clickEmptyMap(page);
    await page.waitForTimeout(500);
    const after = await readMetrics(page);
    assertKpiStable(baseline, after);
  });
});
