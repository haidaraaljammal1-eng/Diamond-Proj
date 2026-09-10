import { test, expect, type Page } from "@playwright/test";

test.use({ channel: "chrome" });
test.describe.configure({ timeout: 90_000 });

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
  await expect(page.getByTestId("gps-vehicle-row").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".leaflet-container")).toBeVisible();
}

async function waitForMapFilled(page: Page) {
  await expect.poll(
    async () =>
      page.evaluate(() => {
        const frame = document.querySelector("[data-testid='gps-map']");
        if (!(frame instanceof HTMLElement)) return false;
        const map =
          frame.classList.contains("leaflet-container")
            ? frame
            : frame.querySelector(".leaflet-container");
        if (!(map instanceof HTMLElement)) return false;
        const frameBox = frame.getBoundingClientRect();
        const mapBox = map.getBoundingClientRect();
        const tiles = [...map.querySelectorAll("img.leaflet-tile-loaded")];
        if (tiles.length < 6) return false;
        let maxRight = 0;
        let maxBottom = 0;
        let minLeft = Number.POSITIVE_INFINITY;
        let minTop = Number.POSITIVE_INFINITY;
        for (const tile of tiles) {
          const box = tile.getBoundingClientRect();
          minLeft = Math.min(minLeft, box.left);
          minTop = Math.min(minTop, box.top);
          maxRight = Math.max(maxRight, box.right);
          maxBottom = Math.max(maxBottom, box.bottom);
        }
        return (
          frameBox.height > 240 &&
          Math.abs(frameBox.width - mapBox.width) < 8 &&
          Math.abs(frameBox.height - mapBox.height) < 8 &&
          maxRight - minLeft > mapBox.width * 0.9 &&
          maxBottom - minTop > mapBox.height * 0.9
        );
      }),
    { timeout: 20_000 },
  ).toBe(true);
}

test.describe("GPS Operations Center", () => {
  test("Arabic desktop GPS page loads provider-not-connected operations center", async ({
    page,
  }) => {
    const gpsWrites: string[] = [];
    const vehicleListUrls: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!url.includes("/gps")) return;
      if (request.method() !== "GET") gpsWrites.push(`${request.method()} ${url}`);
      if (url.includes("/gps/vehicles") && !/\/gps\/vehicles\/\d+/.test(url)) {
        vehicleListUrls.push(url);
      }
    });

    await staffLogin(page);
    await page.goto("/ar/gps");
    await expect(page.getByRole("heading", { name: "مركز عمليات GPS" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("gps-provider-banner")).toBeVisible();
    await expect(page.getByTestId("gps-summary")).toBeVisible();
    await expect(page.getByTestId("gps-map")).toBeVisible();
    await expect(page.getByTestId("gps-vehicle-panel")).toBeVisible();
    await waitForGpsReady(page);
    await waitForMapFilled(page);
    await expect(page.getByTestId("gps-map-empty")).toBeVisible();
    await expect(page.getByText("مواقع GPS حديثة")).toBeVisible();
    await page.screenshot({ path: "e2e/__screens__/gps/ar-desktop.png" });

    await page.setViewportSize({ width: 1366, height: 768 });
    await waitForMapFilled(page);
    await page.screenshot({ path: "e2e/__screens__/gps/ar-desktop-1366.png" });
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.getByTestId("gps-vehicle-row").first().click();
    await expect(page.getByTestId("shared-drawer")).toBeVisible();
    await expect(page.getByText("لا توجد بيانات GPS لهذه المركبة.")).toBeVisible();
    await page.screenshot({ path: "e2e/__screens__/gps/ar-desktop-detail.png" });
    await page.getByTestId("shared-drawer").getByRole("button", { name: "إغلاق" }).click();

    const pagination = page.getByTestId("gps-pagination");
    if (await pagination.isVisible()) {
      await pagination.getByRole("button", { name: "التالي" }).click();
      await expect.poll(() => vehicleListUrls.some((url) => /[?&]page=2(?:&|$)/.test(url))).toBe(true);
    }

    const listCountBeforeType = vehicleListUrls.length;
    await page.getByTestId("gps-search").fill("Patrol");
    await page.waitForTimeout(400);
    expect(vehicleListUrls.length).toBe(listCountBeforeType);
    await page.getByTestId("data-search-submit").click();
    await expect.poll(() => vehicleListUrls.some((url) => url.includes("search=Patrol"))).toBe(true);

    await page.getByLabel("حالة التتبع").click();
    await page.getByRole("option", { name: "متحركة" }).click();
    await expect.poll(() =>
      vehicleListUrls.some((url) => url.includes("trackingStatus=moving")),
    ).toBe(true);

    expect(gpsWrites).toEqual([]);
  });

  test("GPS simulation overlays real vehicles and reset restores empty map", async ({
    page,
  }) => {
    const gpsWrites: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/gps") && request.method() !== "GET") {
        gpsWrites.push(`${request.method()} ${request.url()}`);
      }
    });

    await staffLogin(page);
    await page.goto("/ar/gps");
    await waitForGpsReady(page);
    await waitForMapFilled(page);
    await expect(page.getByTestId("gps-map-empty")).toBeVisible();

    const simulate = page.getByTestId("simulate-gps");
    await expect(simulate).toBeVisible();
    await simulate.click();
    await page.getByTestId("simulate-gps-run").click();
    await expect(page.getByTestId("gps-map-empty")).toHaveCount(0);
    await expect(page.getByTestId("gps-marker").first()).toBeVisible();
    await expect(page.getByTestId("simulation-badge")).toBeVisible();
    await waitForMapFilled(page);
    await page.screenshot({ path: "e2e/__screens__/gps/ar-desktop-sim.png" });

    const panel = page.getByTestId("gps-vehicle-panel");
    const listRow = panel.getByTestId("gps-vehicle-row");
    await listRow.first().click();
    await expect(panel.locator('[data-testid="gps-vehicle-row"][aria-pressed="true"]')).toBeVisible();
    await expect(page.getByTestId("shared-drawer")).toBeVisible();
    await page.getByTestId("shared-drawer").getByRole("button", { name: "إغلاق" }).click();

    const secondId = await listRow.nth(1).getAttribute("data-vehicle-id");
    await page.evaluate((id) => {
      const pin = document.querySelector(`[data-testid="gps-marker"][data-vehicle-id="${id}"]`);
      if (pin instanceof HTMLElement) pin.click();
    }, secondId);
    await expect(
      panel.locator(`[data-testid="gps-vehicle-row"][data-vehicle-id="${secondId}"][aria-pressed="true"]`),
    ).toBeVisible();
    await expect(page.getByTestId("shared-drawer")).toBeVisible();
    await expect(page.getByTestId("gps-detail")).toBeVisible();
    await page.screenshot({ path: "e2e/__screens__/gps/ar-desktop-sim-selected.png" });
    await page.getByTestId("shared-drawer").getByRole("button", { name: "إغلاق" }).click();

    await page.getByTestId("simulation-reset").click();
    await expect(page.getByTestId("gps-map-empty")).toBeVisible();
    await expect(page.getByTestId("gps-marker")).toHaveCount(0);
    expect(gpsWrites).toEqual([]);
  });

  test("Fleet vehicleId deep-link selects a vehicle without coordinates", async ({
    page,
  }) => {
    await staffLogin(page);
    await page.goto("/ar/gps");
    await waitForGpsReady(page);
    const vehicleId = await page
      .getByTestId("gps-vehicle-row")
      .first()
      .getAttribute("data-vehicle-id");
    expect(vehicleId).toBeTruthy();
    await page.goto(`/ar/gps?vehicleId=${vehicleId}`);
    await expect(page.getByTestId("shared-drawer")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("لا توجد بيانات GPS لهذه المركبة.")).toBeVisible();
    await expect(page.getByTestId("gps-map-empty")).toBeVisible();
  });

  test("English GPS page stays LTR and shows Online as a summary KPI", async ({
    page,
  }) => {
    await staffLogin(page);
    await page.goto("/en/gps");
    await expect(page.getByRole("heading", { name: "GPS Operations Center" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText("Fresh GPS locations")).toBeVisible();
    await expect(page.getByTestId("gps-summary")).toBeVisible();
    await waitForGpsReady(page);
    await waitForMapFilled(page);
    await expect(page.getByTestId("data-search-submit")).toContainText("Search");
    await page.screenshot({ path: "e2e/__screens__/gps/en-desktop.png" });
  });

  test("Arabic mobile GPS stacks map above the fleet panel", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await staffLogin(page);
    await page.goto("/ar/gps");
    await expect(page.getByRole("heading", { name: "مركز عمليات GPS" })).toBeVisible({
      timeout: 60_000,
    });
    await waitForGpsReady(page);
    await waitForMapFilled(page);
    const mapBox = await page.getByTestId("gps-map").boundingBox();
    const panelBox = await page.getByTestId("gps-vehicle-panel").boundingBox();
    expect(mapBox && panelBox && mapBox.y < panelBox.y).toBeTruthy();
    expect(mapBox && mapBox.height).toBeGreaterThan(250);
    await page.screenshot({ path: "e2e/__screens__/gps/ar-mobile-390.png", fullPage: true });

    await page.setViewportSize({ width: 430, height: 932 });
    await waitForMapFilled(page);
    await page.screenshot({ path: "e2e/__screens__/gps/ar-mobile-430.png", fullPage: true });
  });
});
