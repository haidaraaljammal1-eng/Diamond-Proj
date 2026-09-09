# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tars-status.visual.spec.ts >> TARS integration status — mocked projection states >> a failed projection read stays inside the section
- Location: e2e\tars-status.visual.spec.ts:346:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Test source

```ts
  1   | import { test, expect, type Page } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * Read-only TARS integration status in the Contract Drawer.
  5   |  *
  6   |  * The real backend is unconfigured, so the live assertions cover the
  7   |  * "Not Connected / all Not Started" screen. SUCCEEDED / PROCESSING / FAILED are
  8   |  * rendered from an intercepted projection response — a UI fixture only. No
  9   |  * runtime TARS success is ever fabricated.
  10  |  */
  11  | 
  12  | test.use({ channel: "chrome" });
  13  | 
  14  | const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
  15  | const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
  16  | 
  17  | const SHOTS = "e2e/__screens__/tars";
  18  | 
  19  | /**
  20  |  * The TARS section loads behind its own skeleton, so the first assertion on its
  21  |  * content waits out the projection request rather than the default 5s.
  22  |  */
  23  | const expectLoaded = expect.configure({ timeout: 60_000 });
  24  | 
  25  | async function login(page: Page, locale: "ar" | "en") {
  26  |   await page.goto(`/${locale}/login`);
  27  |   await page.locator("#email").fill(email);
  28  |   await page.locator("#password").fill(password);
  29  |   await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
> 30  |   await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30_000 });
      |              ^ TimeoutError: page.waitForURL: Timeout 30000ms exceeded.
  31  | }
  32  | 
  33  | /**
  34  |  * Waits for the desk to settle on a cold `next dev` server, where the first
  35  |  * compile of a route can outlast the default locator timeout.
  36  |  */
  37  | const DESK_TIMEOUT = 90_000;
  38  | 
  39  | /** Opens the first contract row, or skips when the desk is empty. */
  40  | async function openFirstContract(page: Page, locale: "ar" | "en") {
  41  |   await page.goto(`/${locale}/contracts`);
  42  |   const table = page.getByTestId("contracts-table");
  43  |   const empty = page.getByTestId("contracts-empty");
  44  |   await expect(table.or(empty)).toBeVisible({ timeout: DESK_TIMEOUT });
  45  |   if (!(await table.isVisible())) test.skip(true, "No contract in this environment");
  46  |   await page.locator("[data-testid=contracts-table] tbody tr").first().click();
  47  |   await expect(page.getByTestId("contract-detail")).toBeVisible({ timeout: DESK_TIMEOUT });
  48  | }
  49  | 
  50  | function mockTars(
  51  |   page: Page,
  52  |   body: {
  53  |     configured: boolean;
  54  |     externalContractId: string | null;
  55  |     lastSuccessfulSyncAt: string | null;
  56  |     operations: Record<string, string>;
  57  |   },
  58  | ) {
  59  |   return page.route("**/contracts/*/tars", (route) =>
  60  |     route.fulfill({
  61  |       status: 200,
  62  |       contentType: "application/json",
  63  |       body: JSON.stringify({ data: { tars: body } }),
  64  |     }),
  65  |   );
  66  | }
  67  | 
  68  | const ALL = (status: string) => ({
  69  |   registerContract: status,
  70  |   contractAcceptance: status,
  71  |   handover: status,
  72  |   returnDocumentation: status,
  73  |   completeContract: status,
  74  | });
  75  | 
  76  | test.describe("TARS integration status — live unconfigured backend", () => {
  77  |   test("Arabic drawer shows RTL TARS section, Not Connected, five Not Started", async ({
  78  |     page,
  79  |   }) => {
  80  |     await login(page, "ar");
  81  |     await openFirstContract(page, "ar");
  82  | 
  83  |     const tars = page.getByTestId("contract-tars");
  84  |     await expect(tars).toBeVisible();
  85  |     await expect(tars.getByText("حالة الربط مع TARS")).toBeVisible();
  86  |     await expectLoaded(tars.getByText("غير متصل حالياً")).toBeVisible();
  87  |     await expect(
  88  |       tars.getByText("سيتم تفعيل المزامنة عند ربط واجهة TARS الرسمية."),
  89  |     ).toBeVisible();
  90  | 
  91  |     for (const label of [
  92  |       "تسجيل العقد",
  93  |       "اعتماد العقد / التوقيع",
  94  |       "تسليم المركبة",
  95  |       "توثيق إعادة المركبة",
  96  |       "إكمال العقد",
  97  |     ])
  98  |       await expect(tars.getByText(label, { exact: true })).toBeVisible();
  99  | 
  100 |     await expect(tars.getByText("لم يبدأ", { exact: true })).toHaveCount(5);
  101 | 
  102 |     // Status display only — no execution surface anywhere in the section.
  103 |     await expect(tars.getByRole("button")).toHaveCount(0);
  104 |     await expect(page.getByTestId("contract-timeline")).toBeVisible();
  105 | 
  106 |     await tars.screenshot({ path: `${SHOTS}/ar-not-connected.png` });
  107 |     await page.screenshot({ path: `${SHOTS}/ar-drawer.png` });
  108 |   });
  109 | 
  110 |   test("English drawer shows LTR TARS section", async ({ page }) => {
  111 |     await login(page, "en");
  112 |     await openFirstContract(page, "en");
  113 | 
  114 |     const tars = page.getByTestId("contract-tars");
  115 |     await expect(tars.getByText("TARS Integration Status")).toBeVisible();
  116 |     await expectLoaded(tars.getByText("Not Connected")).toBeVisible();
  117 |     for (const label of [
  118 |       "Contract Registration",
  119 |       "Contract Acceptance",
  120 |       "Vehicle Handover",
  121 |       "Vehicle Return",
  122 |       "Contract Completion",
  123 |     ])
  124 |       await expect(tars.getByText(label, { exact: true })).toBeVisible();
  125 |     await expect(tars.getByText("Not Started", { exact: true })).toHaveCount(5);
  126 |     await expect(tars.getByRole("button")).toHaveCount(0);
  127 | 
  128 |     await tars.screenshot({ path: `${SHOTS}/en-not-connected.png` });
  129 |     await page.screenshot({ path: `${SHOTS}/en-drawer.png` });
  130 |   });
```