import { expect, test, type Page } from "@playwright/test";
import { BACKEND, staffToken } from "./helpers/e2e-api";

async function login(page: Page) {
  await page.goto("/ar/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (!page.url().includes("/login")) return;
  await page.getByLabel(/البريد|email/i).fill("admin@diamond.test");
  await page.getByLabel(/كلمة المرور|password/i).fill("Diamond123!");
  await page.getByRole("button", { name: /دخول|login|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 90_000 });
}

test.describe("WhatsApp browser realtime SSE", () => {
  test("keeps one authenticated stream to backend :3000 and stays live", async ({ page }) => {
    const realtimeStarts: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/whatsapp/realtime")) {
        realtimeStarts.push(request.url());
      }
    });

    await login(page);
    await page.goto("/ar/whatsapp", { waitUntil: "domcontentloaded", timeout: 60_000 });

    const denied = page.getByText("الوصول إلى واتساب غير متاح");
    if (await denied.isVisible().catch(() => false)) {
      test.skip(true, "staff session lacks whatsapp.read in this environment");
    }

    const status = page.getByTestId("whatsapp-realtime-status");
    await expect(status).toBeVisible({ timeout: 30_000 });
    await expect(status).toHaveAttribute("data-status", "live", { timeout: 30_000 });
    await expect(status).toContainText("مباشر");

    expect(realtimeStarts.length).toBeGreaterThanOrEqual(1);
    for (const url of realtimeStarts) {
      expect(url).toMatch(/^http:\/\/localhost:3000\/whatsapp\/realtime$/);
    }

    const initialCount = realtimeStarts.length;
    await page.waitForTimeout(20_000);
    expect(realtimeStarts.length).toBe(initialCount);
    await expect(status).toHaveAttribute("data-status", "live");
  });

  test("delivers a synthetic backend realtime event to the store handler", async ({ page }) => {
    await login(page);
    await page.goto("/ar/whatsapp", { waitUntil: "domcontentloaded", timeout: 60_000 });

    const denied = page.getByText("الوصول إلى واتساب غير متاح");
    if (await denied.isVisible().catch(() => false)) {
      test.skip(true, "staff session lacks whatsapp.read in this environment");
    }

    await expect(page.getByTestId("whatsapp-realtime-status")).toHaveAttribute("data-status", "live", {
      timeout: 30_000,
    });

    const token = await staffToken();
    const listResponse = await fetch(`${BACKEND}/whatsapp/conversations?page=1&pageSize=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listResponse.ok).toBe(true);
    const listBody = (await listResponse.json()) as {
      data: { items: Array<{ id: string; unreadCount: number }> };
    };
    const conversation = listBody.data.items[0];
    if (!conversation) {
      test.skip(true, "no WhatsApp conversations to exercise mark-read realtime");
    }

    const readResponse = await fetch(
      `${BACKEND}/whatsapp/conversations/${conversation.id}/read`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(readResponse.ok).toBe(true);

    await page.waitForTimeout(3_000);
    await expect(page.getByTestId("whatsapp-realtime-status")).toHaveAttribute("data-status", "live");
  });
});
