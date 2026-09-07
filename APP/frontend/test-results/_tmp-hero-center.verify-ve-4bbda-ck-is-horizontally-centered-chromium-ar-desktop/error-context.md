# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: _tmp-hero-center.verify.spec.ts >> vehicle detail hero image block is horizontally centered
- Location: e2e\_tmp-hero-center.verify.spec.ts:18:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('vehicles-grid')
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByTestId('vehicles-grid') with timeout 30000ms
  - waiting for getByTestId('vehicles-grid')

```

```yaml
- alert
- img "Diamond Elite Rent Car"
- img
- heading "أهلاً وسهلاً في مكتب Diamond" [level=1]
- textbox "اسم المستخدم"
- textbox "كلمة المرور"
- button "إظهار كلمة المرور"
- button "دخول"
- text: الدخول متاح لحسابات مكتب Diamond فقط
```

# Test source

```ts
  1   | import { test, expect, type Page } from "@playwright/test";
  2   | 
  3   | test.use({ channel: "chrome" });
  4   | 
  5   | const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
  6   | const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";
  7   | 
  8   | async function login(page: Page) {
  9   |   await page.goto("/ar/login");
  10  |   await page.locator("#email").fill(email);
  11  |   await page.locator("#password").fill(password);
  12  |   await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  13  |   await page.waitForURL("**/ar/**", { timeout: 30_000 });
  14  |   await page.goto("/ar/vehicles", { waitUntil: "domcontentloaded" });
> 15  |   await expect(page.getByTestId("vehicles-grid")).toBeVisible({ timeout: 30_000 });
      |                                                   ^ Error: expect(locator).toBeVisible() failed
  16  | }
  17  | 
  18  | test("vehicle detail hero image block is horizontally centered", async ({ page }) => {
  19  |   test.setTimeout(120_000);
  20  |   await login(page);
  21  | 
  22  |   const search = page.getByTestId("data-search").locator("input");
  23  |   if (await search.count()) {
  24  |     await search.fill("بب");
  25  |     await page.getByTestId("data-search-submit").click();
  26  |     await page.waitForTimeout(800);
  27  |   }
  28  | 
  29  |   const named = page.getByTestId("vehicle-card").filter({ hasText: "بب" });
  30  |   if (await named.count()) {
  31  |     await named.first().click();
  32  |   } else {
  33  |     const withPhoto = page.getByTestId("vehicle-card").filter({ has: page.locator("img") });
  34  |     if (await withPhoto.count()) {
  35  |       await withPhoto.first().click();
  36  |     } else {
  37  |       await page.getByTestId("vehicle-card").first().click();
  38  |     }
  39  |   }
  40  | 
  41  |   const dialog = page.getByRole("dialog");
  42  |   const detail = dialog.getByTestId("vehicle-detail");
  43  |   await expect(detail).toBeVisible({ timeout: 15_000 });
  44  | 
  45  |   const hero = detail.locator(":scope > div").first();
  46  |   const img = detail.locator("img");
  47  |   await expect(img).toBeVisible({ timeout: 15_000 });
  48  | 
  49  |   const metrics = await page.evaluate(() => {
  50  |     const root = document.querySelector('[data-testid="vehicle-detail"]');
  51  |     if (!root) throw new Error("detail missing");
  52  |     const heroEl = root.firstElementChild as HTMLElement;
  53  |     const wrap = heroEl.firstElementChild as HTMLElement;
  54  |     const image = wrap.querySelector("img") as HTMLImageElement | null;
  55  |     const status = heroEl.querySelector("[class*='heroStatus'], [class*='chip']") as HTMLElement | null;
  56  |     const title = heroEl.querySelector("h3") as HTMLElement | null;
  57  |     const replaceBtn = [...heroEl.querySelectorAll("button")].find((b) =>
  58  |       /استبدال|تغيير|replace/i.test(b.textContent ?? ""),
  59  |     );
  60  | 
  61  |     const heroBox = heroEl.getBoundingClientRect();
  62  |     const wrapBox = wrap.getBoundingClientRect();
  63  |     const imgBox = image?.getBoundingClientRect();
  64  |     const leftGap = (imgBox?.left ?? 0) - heroBox.left;
  65  |     const rightGap = heroBox.right - (imgBox?.right ?? 0);
  66  |     const cs = image ? getComputedStyle(image) : null;
  67  |     const wrapCs = getComputedStyle(wrap);
  68  |     const heroCs = getComputedStyle(heroEl);
  69  | 
  70  |     return {
  71  |       hero: { width: heroBox.width, height: heroBox.height },
  72  |       wrap: { width: wrapBox.width, height: wrapBox.height, display: wrapCs.display, justify: wrapCs.justifyContent, align: wrapCs.alignItems },
  73  |       img: imgBox
  74  |         ? { width: imgBox.width, height: imgBox.height, leftGap, rightGap, gapDelta: Math.abs(leftGap - rightGap) }
  75  |         : null,
  76  |       objectFit: cs?.objectFit ?? null,
  77  |       objectPosition: cs?.objectPosition ?? null,
  78  |       imgWidthCss: cs?.width ?? null,
  79  |       imgHeightCss: cs?.height ?? null,
  80  |       heroHeightCss: heroCs.height,
  81  |       statusTop: status?.getBoundingClientRect().top ?? null,
  82  |       titleText: title?.textContent ?? null,
  83  |       replaceVisible: Boolean(replaceBtn),
  84  |     };
  85  |   });
  86  | 
  87  |   console.log("HERO_CENTER_METRICS", JSON.stringify(metrics, null, 2));
  88  | 
  89  |   await dialog.screenshot({
  90  |     path: "test-results/vehicle-detail-hero-centered.png",
  91  |   });
  92  | 
  93  |   expect(metrics.img).not.toBeNull();
  94  |   expect(metrics.objectFit).toBe("cover");
  95  |   expect(metrics.hero.height).toBeGreaterThan(160);
  96  |   expect(metrics.hero.height).toBeLessThan(200);
  97  |   expect(metrics.wrap.justify).toBe("center");
  98  |   expect(metrics.wrap.align).toBe("center");
  99  |   expect(metrics.img!.gapDelta).toBeLessThan(4);
  100 | });
  101 | 
```