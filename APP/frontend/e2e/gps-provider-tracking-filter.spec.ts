import { expect, test, type Page } from "@playwright/test";

test.use({ channel: "chrome" });

const LIVE_IDS = new Set([978, 977, 976, 975, 974, 973, 972]);
const SS_ONLY_IDS = new Set([998, 997, 996, 995, 994, 993, 992, 991, 990, 989, 988, 987, 986, 985, 984, 983, 982, 981, 980, 979]);

async function staffLogin(page: Page) {
  await page.goto("/ar/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
  if (!page.url().includes("/login")) return;
  await page
    .getByRole("textbox", { name: /اسم المستخدم|username|email/i })
    .waitFor({ state: "visible", timeout: 90_000 });
  await page.getByRole("textbox", { name: /اسم المستخدم|username|email/i }).fill(
    "admin@diamond.test",
  );
  await page.getByRole("textbox", { name: /كلمة المرور|password/i }).fill("Diamond123!");
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 90_000 });
}

async function domVehicleIds(page: Page): Promise<number[]> {
  return page.$$eval("[data-testid='gps-vehicle-row']", (rows) =>
    rows
      .map((row) => Number(row.getAttribute("data-vehicle-id")))
      .filter((id) => Number.isFinite(id)),
  );
}

async function panelCombobox(page: Page, ariaPattern: RegExp) {
  const panel = page.getByTestId("gps-vehicle-panel");
  const buttons = panel.locator("button");
  for (let i = 0; i < await buttons.count(); i++) {
    const button = buttons.nth(i);
    const aria = await button.getAttribute("aria-label");
    if (aria && ariaPattern.test(aria)) return button;
  }
  throw new Error(`Combobox not found: ${ariaPattern}`);
}

async function waitForVehicles(
  page: Page,
  options: {
    providerKey?: "SEVEN_STARS" | "LIVE_GPS";
    trackingStatus?: string;
    minRows?: number;
  },
) {
  await page.waitForResponse((res) => {
    if (res.request().method() !== "GET" || !res.url().includes("/gps/vehicles")) return false;
    if (res.status() !== 200) return false;
    const url = new URL(res.url());
    if (options.providerKey && url.searchParams.get("providerKey") !== options.providerKey) {
      return false;
    }
    if (
      options.trackingStatus &&
      url.searchParams.get("trackingStatus") !== options.trackingStatus
    ) {
      return false;
    }
    return true;
  });
  const minRows = options.minRows ?? 0;
  if (minRows === 0) {
    await expect(page.getByTestId("gps-vehicle-row")).toHaveCount(0, { timeout: 30_000 });
  } else {
    await expect
      .poll(async () => page.getByTestId("gps-vehicle-row").count(), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(minRows);
  }
}

function assertProviderMembership(ids: number[], provider: "SEVEN_STARS" | "LIVE_GPS") {
  const allowed = provider === "LIVE_GPS" ? LIVE_IDS : SS_ONLY_IDS;
  for (const id of ids) {
    expect(allowed.has(id)).toBe(true);
  }
}

test.describe.configure({ timeout: 240_000 });

test.describe("GPS provider + tracking filter", () => {
  test.beforeEach(async ({ page }) => {
    await staffLogin(page);
    await page.goto("/ar/gps", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("gps-vehicle-row").first()).toBeVisible({ timeout: 90_000 });
  });

  for (const [trackingLabel, trackingParam] of [
    [/متحركة|moving/i, "moving"],
    [/متوقفة|parked/i, "parked"],
    [/غير متصلة|offline/i, "offline"],
  ] as const) {
    test(`provider lists differ when tracking=${trackingParam}`, async ({ page }) => {
      await (await panelCombobox(page, /tracking|تتبع/i)).click();
      await page.getByRole("option", { name: trackingLabel }).click();

      await (await panelCombobox(page, /provider|مزود/i)).click();
      await page.getByRole("option", { name: /seven stars|سيفن|النجوم/i }).click();
      await waitForVehicles(page, {
        providerKey: "SEVEN_STARS",
        trackingStatus: trackingParam,
        minRows: trackingParam === "moving" ? 1 : 0,
      });
      const ssIds = await domVehicleIds(page);
      assertProviderMembership(ssIds, "SEVEN_STARS");

      await (await panelCombobox(page, /provider|مزود/i)).click();
      await page.getByRole("option", { name: /live my gps|لايف/i }).click();
      await waitForVehicles(page, {
        providerKey: "LIVE_GPS",
        trackingStatus: trackingParam,
        minRows: 0,
      });
      const liveIds = await domVehicleIds(page);
      assertProviderMembership(liveIds, "LIVE_GPS");

      if (ssIds.length > 0 && liveIds.length > 0) {
        expect(ssIds).not.toEqual(liveIds);
      }
    });
  }

  test("Seven Stars + Moving + company filters stay scoped", async ({ page }) => {
    await (await panelCombobox(page, /tracking|تتبع/i)).click();
    await page.getByRole("option", { name: /متحركة|moving/i }).click();
    await (await panelCombobox(page, /provider|مزود/i)).click();
    await page.getByRole("option", { name: /seven stars|سيفن|النجوم/i }).click();
    await waitForVehicles(page, {
      providerKey: "SEVEN_STARS",
      trackingStatus: "moving",
      minRows: 0,
    });

    await (await panelCombobox(page, /company|شركة/i)).click();
    await page.getByRole("option", { name: /^ELITE$/i }).click();
    await waitForVehicles(page, {
      providerKey: "SEVEN_STARS",
      trackingStatus: "moving",
      minRows: 0,
    });
    assertProviderMembership(await domVehicleIds(page), "SEVEN_STARS");

    await (await panelCombobox(page, /company|شركة/i)).click();
    await page.getByRole("option", { name: /^UNIQUE$/i }).click();
    await waitForVehicles(page, {
      providerKey: "SEVEN_STARS",
      trackingStatus: "moving",
      minRows: 0,
    });
    const uniqueIds = await domVehicleIds(page);
    assertProviderMembership(uniqueIds, "SEVEN_STARS");
    for (const id of uniqueIds) {
      expect(LIVE_IDS.has(id)).toBe(false);
    }
  });
});
