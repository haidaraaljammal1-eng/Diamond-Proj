import { expect, test, type Page, type Response } from "@playwright/test";

test.use({ channel: "chrome" });

const SS_PAGE1 = [998, 997, 996, 995, 994, 993, 992, 991];
const LIVE_ALL = [978, 977, 976, 975, 974, 973, 972];

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

async function providerButton(page: Page) {
  const panel = page.getByTestId("gps-vehicle-panel");
  const buttons = panel.locator("button");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    const aria = await button.getAttribute("aria-label");
    if (aria && /provider|مزود/i.test(aria)) return button;
  }
  return panel.locator("button").first();
}

async function selectProvider(page: Page, label: RegExp) {
  await (await providerButton(page)).click();
  await page.getByRole("option", { name: label }).click();
}

async function selectCompany(page: Page, label: RegExp) {
  const panel = page.getByTestId("gps-vehicle-panel");
  const buttons = panel.locator("button");
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    const aria = await button.getAttribute("aria-label");
    if (aria && /company|شركة/i.test(aria)) {
      await button.click();
      await page.getByRole("option", { name: label }).click();
      return;
    }
  }
  throw new Error("Company select not found");
}

async function waitForListSettle(
  page: Page,
  options?: { providerKey?: "SEVEN_STARS" | "LIVE_GPS" | null; minRows?: number },
) {
  await expect(page.getByTestId("gps-vehicle-list")).toBeVisible();
  await page.waitForResponse(
    (res) => {
      if (res.request().method() !== "GET" || !res.url().includes("/gps/vehicles")) {
        return false;
      }
      if (res.status() !== 200) return false;
      const url = new URL(res.url());
      const key = url.searchParams.get("providerKey");
      if (options?.providerKey === null) return key == null;
      if (options?.providerKey) return key === options.providerKey;
      return true;
    },
    { timeout: 30_000 },
  );
  const minRows = options?.minRows ?? 1;
  if (minRows === 0) {
    await expect(page.getByTestId("gps-vehicle-row")).toHaveCount(0, { timeout: 30_000 });
  } else {
    await expect
      .poll(async () => page.getByTestId("gps-vehicle-row").count(), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(minRows);
  }
}

function lastVehicleResponse(responses: Response[]) {
  const vehicle = responses.filter((r) => r.url().includes("/gps/vehicles"));
  return vehicle[vehicle.length - 1];
}

test.describe.configure({ timeout: 180_000 });

test.describe("GPS provider filter runtime", () => {
  test.beforeEach(async ({ page }) => {
    await staffLogin(page);
    await page.goto("/ar/gps", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("gps-vehicle-row").first()).toBeVisible({
      timeout: 90_000,
    });
  });

  test("sends providerKey and replaces DOM list on Seven Stars → LIVE MY GPS", async ({
    page,
  }) => {
    const vehicleResponses: Response[] = [];
    page.on("response", (res) => {
      if (res.request().method() === "GET" && res.url().includes("/gps/vehicles")) {
        vehicleResponses.push(res);
      }
    });

    await selectProvider(page, /seven stars|سيفن|النجوم/i);
    await waitForListSettle(page, { providerKey: "SEVEN_STARS", minRows: 8 });
    const sevenDom = await domVehicleIds(page);
    expect(sevenDom).toEqual(SS_PAGE1);

    const sevenRes = lastVehicleResponse(vehicleResponses);
    expect(sevenRes.url()).toContain("providerKey=SEVEN_STARS");

    await selectProvider(page, /live my gps|لايف/i);
    await waitForListSettle(page, { providerKey: "LIVE_GPS", minRows: 7 });
    const liveDom = await domVehicleIds(page);
    expect(liveDom).toEqual(LIVE_ALL);

    const liveRes = lastVehicleResponse(vehicleResponses);
    expect(liveRes.url()).toContain("providerKey=LIVE_GPS");
    expect(sevenDom).not.toEqual(liveDom);
  });

  test("repeated provider switches stay stable", async ({ page }) => {
    const sequence: Array<{
      label: RegExp;
      providerKey?: "SEVEN_STARS" | "LIVE_GPS" | null;
      ids?: number[];
      minRows: number;
    }> = [
      { label: /كل المزودين|all providers/i, providerKey: null, minRows: 8 },
      { label: /seven stars|سيفن|النجوم/i, providerKey: "SEVEN_STARS", ids: SS_PAGE1, minRows: 8 },
      { label: /live my gps|لايف/i, providerKey: "LIVE_GPS", ids: LIVE_ALL, minRows: 7 },
      { label: /seven stars|سيفن|النجوم/i, providerKey: "SEVEN_STARS", ids: SS_PAGE1, minRows: 8 },
      { label: /live my gps|لايف/i, providerKey: "LIVE_GPS", ids: LIVE_ALL, minRows: 7 },
      { label: /كل المزودين|all providers/i, providerKey: null, minRows: 8 },
    ];

    for (const step of sequence) {
      await selectProvider(page, step.label);
      await waitForListSettle(page, {
        providerKey: step.providerKey,
        minRows: step.minRows,
      });
      if (step.ids) {
        expect(await domVehicleIds(page)).toEqual(step.ids);
      }
    }
  });

  test("fast switch ends on the latest provider list", async ({ page }) => {
    await selectProvider(page, /seven stars|سيفن|النجوم/i);
    await selectProvider(page, /live my gps|لايف/i);
    await waitForListSettle(page, { providerKey: "LIVE_GPS", minRows: 7 });
    expect(await domVehicleIds(page)).toEqual(LIVE_ALL);

    await selectProvider(page, /live my gps|لايف/i);
    await selectProvider(page, /seven stars|سيفن|النجوم/i);
    await waitForListSettle(page, { providerKey: "SEVEN_STARS", minRows: 8 });
    expect(await domVehicleIds(page)).toEqual(SS_PAGE1);
  });

  test("company and provider filters combine independently", async ({ page }) => {
    await selectProvider(page, /seven stars|سيفن|النجوم/i);
    await waitForListSettle(page, { providerKey: "SEVEN_STARS", minRows: 8 });
    expect(await domVehicleIds(page)).toHaveLength(8);

    await selectCompany(page, /^ELITE$/i);
    await waitForListSettle(page, { providerKey: "SEVEN_STARS", minRows: 8 });
    expect(await domVehicleIds(page)).toHaveLength(8);

    await selectCompany(page, /^UNIQUE$/i);
    await waitForListSettle(page, { providerKey: "SEVEN_STARS", minRows: 8 });
    expect(await domVehicleIds(page)).toHaveLength(8);
    await expect(page.getByTestId("gps-vehicle-panel")).toContainText("12");

    await selectProvider(page, /live my gps|لايف/i);
    await selectCompany(page, /كل|all/i);
    await waitForListSettle(page, { providerKey: "LIVE_GPS", minRows: 7 });
    expect(await domVehicleIds(page)).toEqual(LIVE_ALL);

    await selectCompany(page, /^ELITE$/i);
    await waitForListSettle(page, { providerKey: "LIVE_GPS", minRows: 7 });
    expect(await domVehicleIds(page)).toEqual(LIVE_ALL);

    await selectCompany(page, /^UNIQUE$/i);
    await waitForListSettle(page, { providerKey: "LIVE_GPS", minRows: 0 });
    expect(await domVehicleIds(page)).toHaveLength(0);
  });
});
