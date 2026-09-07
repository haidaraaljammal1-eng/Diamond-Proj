import { test, expect, type Page } from "@playwright/test";

test.use({ channel: "chrome" });

const email = process.env.PLAYWRIGHT_LOGIN_EMAIL ?? "admin@diamond.test";
const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD ?? "Diamond123!";

async function login(page: Page) {
  await page.goto("/ar/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL("**/ar/**", { timeout: 30_000 });
  await page.goto("/ar/vehicles", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("vehicles-grid")).toBeVisible({ timeout: 30_000 });
}

test("vehicle detail hero image block is horizontally centered", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);

  const search = page.getByTestId("data-search").locator("input");
  if (await search.count()) {
    await search.fill("بب");
    await page.getByTestId("data-search-submit").click();
    await page.waitForTimeout(800);
  }

  const named = page.getByTestId("vehicle-card").filter({ hasText: "بب" });
  if (await named.count()) {
    await named.first().click();
  } else {
    const withPhoto = page.getByTestId("vehicle-card").filter({ has: page.locator("img") });
    if (await withPhoto.count()) {
      await withPhoto.first().click();
    } else {
      await page.getByTestId("vehicle-card").first().click();
    }
  }

  const dialog = page.getByRole("dialog");
  const detail = dialog.getByTestId("vehicle-detail");
  await expect(detail).toBeVisible({ timeout: 15_000 });

  const hero = detail.locator(":scope > div").first();
  const img = detail.locator("img");
  await expect(img).toBeVisible({ timeout: 15_000 });

  const metrics = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="vehicle-detail"]');
    if (!root) throw new Error("detail missing");
    const heroEl = root.firstElementChild as HTMLElement;
    const wrap = heroEl.firstElementChild as HTMLElement;
    const image = wrap.querySelector("img") as HTMLImageElement | null;
    const status = heroEl.querySelector("[class*='heroStatus'], [class*='chip']") as HTMLElement | null;
    const title = heroEl.querySelector("h3") as HTMLElement | null;
    const replaceBtn = [...heroEl.querySelectorAll("button")].find((b) =>
      /استبدال|تغيير|replace/i.test(b.textContent ?? ""),
    );

    const heroBox = heroEl.getBoundingClientRect();
    const wrapBox = wrap.getBoundingClientRect();
    const imgBox = image?.getBoundingClientRect();
    const leftGap = (imgBox?.left ?? 0) - heroBox.left;
    const rightGap = heroBox.right - (imgBox?.right ?? 0);
    const cs = image ? getComputedStyle(image) : null;
    const wrapCs = getComputedStyle(wrap);
    const heroCs = getComputedStyle(heroEl);

    return {
      hero: { width: heroBox.width, height: heroBox.height },
      wrap: { width: wrapBox.width, height: wrapBox.height, display: wrapCs.display, justify: wrapCs.justifyContent, align: wrapCs.alignItems },
      img: imgBox
        ? { width: imgBox.width, height: imgBox.height, leftGap, rightGap, gapDelta: Math.abs(leftGap - rightGap) }
        : null,
      objectFit: cs?.objectFit ?? null,
      objectPosition: cs?.objectPosition ?? null,
      imgWidthCss: cs?.width ?? null,
      imgHeightCss: cs?.height ?? null,
      heroHeightCss: heroCs.height,
      statusTop: status?.getBoundingClientRect().top ?? null,
      titleText: title?.textContent ?? null,
      replaceVisible: Boolean(replaceBtn),
    };
  });

  console.log("HERO_CENTER_METRICS", JSON.stringify(metrics, null, 2));

  await dialog.screenshot({
    path: "test-results/vehicle-detail-hero-centered.png",
  });

  expect(metrics.img).not.toBeNull();
  expect(metrics.objectFit).toBe("cover");
  expect(metrics.hero.height).toBeGreaterThan(160);
  expect(metrics.hero.height).toBeLessThan(200);
  expect(metrics.wrap.justify).toBe("center");
  expect(metrics.wrap.align).toBe("center");
  expect(metrics.img!.gapDelta).toBeLessThan(4);
});
