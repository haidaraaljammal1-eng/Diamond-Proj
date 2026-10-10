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

async function mockGpsHistoryApis(
  page: Page,
  historyMode: "success" | "empty-then-error" = "success",
) {
  let historyRequestCount = 0;
  const company = {
    id: 2,
    code: "ELITE",
    displayName: "ELITE",
    accentColor: "#C9A15C",
  };
  const vehicle = {
    id: 17,
    company,
    vehicleName: "Synthetic Route Vehicle",
    displayName: "Synthetic Route Vehicle",
    vehicleType: "SUV",
    plateNumber: "TEST-17",
    modelYear: 2025,
    color: "Black",
    primaryImageUrl: null,
    operationalStatus: "available",
  };
  const gps = {
    trackingStatus: "moving",
    latitude: 25.1,
    longitude: 55.1,
    speedKph: 30,
    headingDegrees: 90,
    accuracyMeters: null,
    capturedAt: "2026-10-09T10:00:00.000Z",
    receivedAt: "2026-10-09T10:00:01.000Z",
    motionState: "moving",
  };

  await page.route("**/gps/**", async (route) => {
    const url = new URL(route.request().url());
    const envelope = (data: unknown, meta?: unknown) =>
      JSON.stringify(meta ? { data, meta } : { data });
    const fulfill = (data: unknown, meta?: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope(data, meta),
      });

    if (url.pathname === "/gps/summary") {
      return fulfill({
        providerConfigured: true,
        totalVehicles: 1,
        trackedVehicles: 1,
        moving: 1,
        parked: 0,
        online: 1,
        offline: 0,
        noData: 0,
        unassigned: 0,
        lastLocationUpdateAt: "2026-10-09T10:00:00.000Z",
      });
    }
    if (url.pathname === "/gps/vehicles") {
      return fulfill(
        [{ vehicle, gps, currentRental: null }],
        { page: 1, pageSize: 8, total: 1, totalPages: 1 },
      );
    }
    if (url.pathname === "/gps/map-points") {
      return fulfill([
        {
          vehicleId: 17,
          company,
          displayName: vehicle.displayName,
          plateNumber: vehicle.plateNumber,
          operationalStatus: "available",
          trackingStatus: "moving",
          latitude: 25.1,
          longitude: 55.1,
          speedKph: 30,
          headingDegrees: 90,
          capturedAt: "2026-10-09T10:00:00.000Z",
          currentRental: null,
        },
      ]);
    }
    if (url.pathname === "/gps/vehicles/17/history") {
      historyRequestCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 180));
      if (historyMode === "empty-then-error" && historyRequestCount === 1) {
        return fulfill({
          vehicleId: 17,
          from: url.searchParams.get("from"),
          to: url.searchParams.get("to"),
          points: [],
          summary: {
            pointCount: 0,
            totalDistanceMeters: 0,
            durationSeconds: 0,
            maxSpeedKph: null,
          },
        });
      }
      if (historyMode === "empty-then-error") {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "History result too large",
              context: { reason: "GPS_HISTORY_RESULT_TOO_LARGE" },
            },
          }),
        });
      }
      return fulfill({
        vehicleId: 17,
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
        points: [
          {
            capturedAt: "2026-10-09T09:00:00.000Z",
            latitude: 25.1,
            longitude: 55.1,
            speedKph: 0,
            segmentDistanceMeters: 0,
            addressLine: "Synthetic start",
          },
          {
            capturedAt: "2026-10-09T09:10:00.000Z",
            latitude: 25.11,
            longitude: 55.11,
            speedKph: 35,
            segmentDistanceMeters: 800,
            addressLine: "Synthetic middle",
          },
          {
            capturedAt: "2026-10-09T09:20:00.000Z",
            latitude: 25.12,
            longitude: 55.12,
            speedKph: 55,
            segmentDistanceMeters: 900,
            addressLine: "Synthetic end",
          },
        ],
        summary: {
          pointCount: 3,
          totalDistanceMeters: 1700,
          durationSeconds: 1200,
          maxSpeedKph: 55,
        },
      });
    }
    if (url.pathname === "/gps/vehicles/17") {
      return fulfill({
        vehicle,
        gps,
        currentRental: null,
        binding: {
          assigned: true,
        },
      });
    }
    return route.continue();
  });
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

  test("History playback fetches explicitly and renders one route with playback controls", async ({
    page,
  }) => {
    const historyRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/gps/vehicles/17/history")) {
        historyRequests.push(request.url());
        expect(request.method()).toBe("GET");
      }
    });
    await staffLogin(page);
    await mockGpsHistoryApis(page);
    await page.goto("/en/gps");
    await page.getByTestId("gps-vehicle-row").click();
    await page.getByRole("button", { name: "History / Playback" }).click();
    await expect(page.getByTestId("gps-history-dialog")).toBeVisible();
    expect(historyRequests).toHaveLength(0);

    await page.getByRole("button", { name: "Last 6 hours" }).click();
    await page.getByTestId("gps-history-fetch").click();
    await expect(page.getByText("Loading history…")).toBeVisible();
    await expect(page.getByTestId("gps-history-summary")).toBeVisible();
    expect(historyRequests).toHaveLength(1);

    const requestUrl = new URL(historyRequests[0]!);
    const from = Date.parse(requestUrl.searchParams.get("from")!);
    const to = Date.parse(requestUrl.searchParams.get("to")!);
    expect(to - from).toBe(6 * 60 * 60 * 1_000);
    await expect(page.getByTestId("gps-history-map")).toBeVisible();
    await expect(page.locator(".leaflet-overlay-pane path")).toHaveCount(1);
    await expect(page.locator(".gps-history-marker")).toHaveCount(3);
    await expect(page.getByText("1.7 km")).toBeVisible();
    await expect(page.getByText("55 km/h")).toBeVisible();

    const scrubber = page.getByTestId("gps-history-scrubber");
    await expect(scrubber).toHaveValue("0");
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect
      .poll(async () => Number(await scrubber.inputValue()))
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Pause" }).click();
    await page.getByLabel("Playback speed").click();
    await page.getByRole("option", { name: "8×" }).click();
    await scrubber.fill("2");
    await expect(page.getByText("Synthetic end")).toBeVisible();
    await expect(page.getByTestId("gps-history-dialog")).not.toContainText(
      "00000000-0000-4000-8000-000000000017",
    );
  });

  test("History playback handles empty results and sanitized backend errors", async ({
    page,
  }) => {
    await staffLogin(page);
    await mockGpsHistoryApis(page, "empty-then-error");
    await page.goto("/en/gps");
    await page.getByTestId("gps-vehicle-row").click();
    await page.getByRole("button", { name: "History / Playback" }).click();
    await page.getByTestId("gps-history-fetch").click();
    await expect(page.getByTestId("gps-history-empty")).toBeVisible();

    await page.getByRole("button", { name: "Last 1 hour" }).click();
    await page.getByTestId("gps-history-fetch").click();
    await expect(
      page.getByText("This result is too large. Choose a shorter range."),
    ).toBeVisible();
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
