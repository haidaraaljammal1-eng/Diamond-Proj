import { expect, type Page } from "@playwright/test";

export async function expectDocumentAlignmentDialog(page: Page): Promise<void> {
  await expect(page.getByTestId("document-alignment-dialog")).toBeVisible({ timeout: 15_000 });
}

export async function adjustDocumentAlignmentDialog(
  page: Page,
  options: { panDx?: number; panDy?: number; rotateRightClicks?: number; zoomInClicks?: number } = {},
): Promise<void> {
  if (options.panDx || options.panDy) {
    const viewport = page.getByTestId("document-alignment-viewport");
    await viewport.dispatchEvent("pointerdown", { button: 0, clientX: 320, clientY: 200, pointerId: 1 });
    await viewport.dispatchEvent("pointermove", {
      button: 0,
      clientX: 320 + (options.panDx ?? 0),
      clientY: 200 + (options.panDy ?? 0),
      pointerId: 1,
    });
    await viewport.dispatchEvent("pointerup", { button: 0, clientX: 320 + (options.panDx ?? 0), clientY: 200 + (options.panDy ?? 0), pointerId: 1 });
  }
  for (let i = 0; i < (options.rotateRightClicks ?? 0); i += 1) {
    await page.getByRole("button", { name: /rotate right|تدوير لليمين/i }).click();
  }
  for (let i = 0; i < (options.zoomInClicks ?? 0); i += 1) {
    await page.getByRole("button", { name: /zoom in|تكبير/i }).click();
  }
}

export async function confirmDocumentAlignmentDialog(page: Page): Promise<void> {
  await expectDocumentAlignmentDialog(page);
  await expect(page.getByTestId("document-alignment-dialog")).toHaveAttribute(
    "data-composition-ready",
    "true",
    { timeout: 15_000 },
  );
  await page.getByTestId("document-alignment-confirm").click();
  await expect(page.getByTestId("document-alignment-dialog")).toHaveCount(0, {
    timeout: 30_000,
  });
}

export async function cancelDocumentAlignmentDialog(page: Page): Promise<void> {
  await expectDocumentAlignmentDialog(page);
  await page.getByTestId("document-alignment-cancel").click();
  await expect(page.getByTestId("document-alignment-dialog")).toHaveCount(0);
}
