import { expect, type Page } from "@playwright/test";

export async function openViolationsRow(
  page: Page,
  liabilityId: string,
  searchHint: string,
) {
  await page.goto("/en/violations");
  await expect(page.getByTestId("road-liabilities-screen")).toBeVisible({ timeout: 60_000 });

  const search = page.getByTestId("road-liabilities-search");
  await search.fill(searchHint);
  await page.getByTestId("data-search-submit").click();
  await expect(page.getByTestId("road-liabilities-toolbar")).toBeVisible();

  const row = page.locator(`[data-testid="road-liability-row"][data-liability-id="${liabilityId}"]`);
  await expect(row).toBeVisible({ timeout: 60_000 });
  return row;
}
