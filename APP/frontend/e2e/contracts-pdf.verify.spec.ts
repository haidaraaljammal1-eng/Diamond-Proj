import { test, expect } from "@playwright/test";
import { BACKEND, staffToken, STAFF_EMAIL, STAFF_PASSWORD } from "./helpers/e2e-api";

test.use({ channel: "chrome" });

async function staffLogin(page: import("@playwright/test").Page) {
  await page.goto("/ar/login", { waitUntil: "domcontentloaded" });
  const email = page.getByRole("textbox", { name: /اسم المستخدم|email/i });
  const password = page.getByRole("textbox", { name: /كلمة المرور|password/i });
  await email.fill(STAFF_EMAIL);
  await password.fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 90_000 });
}

test.describe("Contract PDF download", () => {
  test("staff can download a valid PDF from contracts table", async ({ page }) => {
    const token = await staffToken();
    const listRes = await fetch(`${BACKEND}/contracts?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listRes.ok).toBeTruthy();
    const list = (await listRes.json()) as { data: Array<{ id: string }> };
    const contractId = list.data[0]?.id;
    test.skip(!contractId, "No contracts in primary database");

    await staffLogin(page);
    await page.goto("/ar/contracts", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("contracts-table")).toBeVisible({ timeout: 60_000 });

    const pdfButton = page
      .getByTestId("contracts-table")
      .locator(`[data-record-id="${contractId}"]`)
      .getByRole("button", { name: /PDF|pdf/i })
      .first();
    await expect(pdfButton).toBeVisible();

    const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
    await pdfButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^Diamond-.*\.pdf$/i);

    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import("node:fs");
    const head = fs.readFileSync(path!).subarray(0, 5).toString("utf8");
    expect(head).toBe("%PDF-");
  });
});
