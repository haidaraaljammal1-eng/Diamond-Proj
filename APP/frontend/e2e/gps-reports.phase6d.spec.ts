import { test, expect, type Page } from "@playwright/test";

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

async function staffLogin(page: Page) {
  await page.goto("/en/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

async function mockGps(page: Page, input: {
  mileage: "success" | "zero" | "error";
  overspeed: "empty" | "success" | "error";
}) {
  let mileageRequests = 0;
  let overspeedRequests = 0;
  const company = { id: 2, code: "ELITE", displayName: "ELITE", accentColor: "#C9A15C" };
  const vehicle = {
    id: 17,
    company,
    vehicleName: "Synthetic report vehicle",
    displayName: "Synthetic report vehicle",
    vehicleType: "SUV",
    plateNumber: "TEST-REPORT",
    modelYear: 2025,
    color: "Black",
    primaryImageUrl: null,
    operationalStatus: "available",
  };
  const gps = {
    trackingStatus: "no_data",
    latitude: null,
    longitude: null,
    speedKph: null,
    headingDegrees: null,
    accuracyMeters: null,
    capturedAt: null,
    receivedAt: null,
    motionState: null,
  };
  const fulfill = (route: import("@playwright/test").Route, data: unknown, status = 200) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ data }),
    });

  await page.route("**/gps/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/gps/summary") {
      return fulfill(route, {
        providerConfigured: true,
        totalVehicles: 1,
        trackedVehicles: 1,
        moving: 0,
        parked: 0,
        online: 0,
        offline: 0,
        noData: 1,
        unassigned: 0,
        lastLocationUpdateAt: null,
      });
    }
    if (url.pathname === "/gps/vehicles") {
      return fulfill(route, [{ vehicle, gps, currentRental: null }], 200);
    }
    if (url.pathname === "/gps/map-points") return fulfill(route, []);
    if (url.pathname === "/gps/vehicles/17") {
      return fulfill(route, {
        vehicle,
        gps,
        currentRental: null,
        binding: {
          assigned: true,
        },
      });
    }
    if (url.pathname === "/gps/vehicles/17/mileage-summary") {
      mileageRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (input.mileage === "error") {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "CONFLICT", message: "Mileage unavailable" } }),
        });
      }
      const value = input.mileage === "zero"
        ? { vehicleId: 17, todayKm: 0, yesterdayKm: 0, thisMonthKm: 0, lastMonthKm: 0 }
        : { vehicleId: 17, todayKm: 51.88, yesterdayKm: 0, thisMonthKm: 400.5, lastMonthKm: 12 };
      return fulfill(route, value);
    }
    if (url.pathname === "/gps/vehicles/17/overspeed") {
      overspeedRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (input.overspeed === "error") {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: { code: "CONFLICT", message: "Overspeed unavailable" } }),
        });
      }
      const value = input.overspeed === "empty"
        ? { vehicleId: 17, thresholdKph: 80, date: "2026-10-09", events: [], eventCount: 0 }
        : {
            vehicleId: 17,
            thresholdKph: 80,
            date: "2026-10-09",
            eventCount: 1,
            events: [{
              startedAt: "2026-10-09T05:10:00.000Z",
              endedAt: "2026-10-09T05:25:00.000Z",
              averageSpeedKph: 84,
              maxSpeedKph: 101,
              durationMinutes: 15,
              addressLine: null,
            }],
          };
      return fulfill(route, value);
    }
    return route.continue();
  });

  return {
    getMileageRequests: () => mileageRequests,
    getOverspeedRequests: () => overspeedRequests,
  };
}

async function openDetail(page: Page) {
  await staffLogin(page);
  await page.goto("/en/gps");
  await expect(page.getByTestId("gps-vehicle-row").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("gps-vehicle-row").first().click();
  await expect(page.getByTestId("gps-detail")).toBeVisible();
}

test.describe("Phase 6D GPS reports", () => {
  test("Mileage is explicit-action only, supports zero values, and renders all summary fields", async ({ page }) => {
    const requests = await mockGps(page, { mileage: "zero", overspeed: "empty" });
    await openDetail(page);
    expect(requests.getMileageRequests()).toBe(0);
    await page.getByRole("button", { name: "Load mileage" }).click();
    await expect(page.getByText("Loading mileage…")).toBeVisible();
    await expect(page.getByText("Today")).toBeVisible();
    await expect(page.getByText("Yesterday")).toBeVisible();
    await expect(page.getByText("This month")).toBeVisible();
    await expect(page.getByText("Last month")).toBeVisible();
    await expect(page.getByText("0 km").first()).toBeVisible();
    await expect.poll(requests.getMileageRequests).toBe(1);
    await page.waitForTimeout(250);
    expect(requests.getMileageRequests()).toBe(1);
    await expect(page.getByText("LIVE_GPS")).toHaveCount(0);
    await expect(page.getByText("externalDeviceId")).toHaveCount(0);
  });

  test("Mileage error is displayed without exposing provider identifiers", async ({ page }) => {
    await mockGps(page, { mileage: "error", overspeed: "empty" });
    await openDetail(page);
    await page.getByRole("button", { name: "Load mileage" }).click();
    await expect(page.getByText("Mileage unavailable")).toBeVisible();
    await expect(page.getByText("externalDeviceId")).toHaveCount(0);
  });

  test("Overspeed supports empty results and explicit report inputs", async ({ page }) => {
    const requests = await mockGps(page, { mileage: "success", overspeed: "empty" });
    await openDetail(page);
    expect(requests.getOverspeedRequests()).toBe(0);
    await page.locator('input[type="date"]').fill("2026-10-09");
    await page.locator('input[type="number"]').fill("80");
    await page.getByRole("button", { name: "Load overspeed" }).click();
    await expect(page.getByText("Loading overspeed…")).toBeVisible();
    await expect(page.getByText("No overspeed events were returned.")).toBeVisible();
    await expect.poll(requests.getOverspeedRequests).toBe(1);
    await expect(page.getByText("settings", { exact: false })).toHaveCount(0);
    await expect(page.getByText("LIVE_GPS")).toHaveCount(0);
  });

  test("Overspeed renders event fields, nullable address, and provider errors", async ({ page }) => {
    await mockGps(page, { mileage: "success", overspeed: "success" });
    await openDetail(page);
    await page.getByRole("button", { name: "Load overspeed" }).click();
    await expect(page.getByText("Start")).toBeVisible();
    await expect(page.getByText("End")).toBeVisible();
    await expect(page.getByText("15 min")).toBeVisible();
    await expect(page.getByText("101 km/h")).toBeVisible();
    await expect(page.getByText("84 km/h")).toBeVisible();
    await expect(page.getByText("Address")).toHaveCount(0);

  });

  test("Overspeed provider errors are displayed without mutation controls", async ({ page }) => {
    await mockGps(page, { mileage: "success", overspeed: "error" });
    await openDetail(page);
    await page.getByRole("button", { name: "Load overspeed" }).click();
    await expect(page.getByText("Overspeed unavailable")).toBeVisible();
    await expect(page.getByText("save", { exact: false })).toHaveCount(0);
    await expect(page.getByText("externalDeviceId")).toHaveCount(0);
  });
});
