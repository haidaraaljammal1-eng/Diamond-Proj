import { test, expect, type Page } from "@playwright/test";

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

async function login(page: Page) {
  await page.goto("/en/login");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await page.getByRole("button", { name: /login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
}

async function mockHealth(page: Page, result: {
  health: "ONLINE" | "STALE" | "OFFLINE";
  deviceModel: string | null;
  delay?: number;
  error?: boolean;
}) {
  let healthRequests = 0;
  const vehicle = {
    id: 17, company: { id: 2, code: "ELITE", displayName: "ELITE", accentColor: "#C9A15C" },
    vehicleName: "Synthetic health vehicle", displayName: "Synthetic health vehicle",
    vehicleType: "SUV", plateNumber: "TEST-HEALTH", modelYear: 2025, color: "Black",
    primaryImageUrl: null, operationalStatus: "available",
  };
  const gps = {
    trackingStatus: "no_data", latitude: null, longitude: null, speedKph: null,
    headingDegrees: null, accuracyMeters: null, capturedAt: null, receivedAt: null, motionState: null,
  };
  const fulfill = (route: import("@playwright/test").Route, data: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ data }) });
  await page.route("**/gps/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/gps/summary") {
      return fulfill(route, {
        providerConfigured: true, totalVehicles: 1, trackedVehicles: 1, moving: 0, parked: 0,
        online: 0, offline: 0, noData: 1, unassigned: 0, lastLocationUpdateAt: null,
      });
    }
    if (url.pathname === "/gps/vehicles") return fulfill(route, [{ vehicle, gps, currentRental: null }]);
    if (url.pathname === "/gps/map-points") return fulfill(route, []);
    if (url.pathname === "/gps/vehicles/17") {
      return fulfill(route, { vehicle, gps, currentRental: null, binding: { assigned: true } });
    }
    if (url.pathname === "/gps/vehicles/17/health") {
      healthRequests += 1;
      if (result.delay) await new Promise((resolve) => setTimeout(resolve, result.delay));
      if (result.error) {
        return route.fulfill({
          status: 503, contentType: "application/json",
          body: JSON.stringify({ error: { code: "GPS_PROVIDER_UNAVAILABLE" } }),
        });
      }
      return fulfill(route, {
        vehicleId: 17, health: result.health,
        lastCommunicationAt: result.health === "OFFLINE" ? null : "2026-10-09T17:30:00.000Z",
        ageSeconds: result.health === "OFFLINE" ? null : 90,
        deviceModel: result.deviceModel,
      });
    }
    return route.continue();
  });
  return { count: () => healthRequests };
}

async function openDetail(page: Page) {
  await login(page);
  await page.goto("/en/gps");
  await expect(page.getByTestId("gps-vehicle-row").first()).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("gps-vehicle-row").first().click();
  await expect(page.getByTestId("gps-detail")).toBeVisible();
}

test.describe("Phase 6E device health", () => {
  for (const status of ["ONLINE", "STALE", "OFFLINE"] as const) {
    test(`${status} health is rendered without provider fields`, async ({ page }) => {
      const requests = await mockHealth(page, { health: status, deviceModel: status === "OFFLINE" ? null : "Synthetic Tracker" });
      await openDetail(page);
      await expect(
        page
          .getByTestId("gps-detail")
          .getByText(status === "ONLINE" ? "Online" : status === "STALE" ? "Stale" : "Offline"),
      ).toBeVisible();
      if (status === "OFFLINE") {
        await expect(page.getByText("No communication recorded")).toBeVisible();
      } else {
        await expect(page.getByText(/\bago\b/)).toBeVisible();
      }
      await expect(page.getByText(status === "OFFLINE" ? "Unavailable" : "Synthetic Tracker")).toBeVisible();
      await expect.poll(requests.count).toBe(1);
      await page.waitForTimeout(250);
      expect(requests.count()).toBe(1);
      for (const text of ["LIVE_GPS", "providerAccountId", "externalDeviceId", "deviceid", "IMEI", "SIM", "DeviceOnOFF", "installationdate", "experied", "battery", "charge", "fuel"]) {
        await expect(page.getByText(text, { exact: false })).toHaveCount(0);
      }
      await expect(page.getByText(/expiry|installation|battery|charge|power/i)).toHaveCount(0);
    });
  }

  test("health loading and error states are rendered", async ({ page }) => {
    test.setTimeout(60_000);
    await mockHealth(page, { health: "ONLINE", deviceModel: null, delay: 10_000 });
    await openDetail(page);
    await expect(page.getByText("Checking device health…")).toBeVisible();
    await expect(page.getByText("Unavailable")).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await mockHealth(page, { health: "ONLINE", deviceModel: null, error: true });
    await expect(page.getByTestId("gps-vehicle-row").first()).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("gps-vehicle-row").first().click();
    await expect(page.getByText("Device health is unavailable right now.")).toBeVisible();
  });
});
