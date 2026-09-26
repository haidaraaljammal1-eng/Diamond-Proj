import { expect, type Locator, type Page } from "@playwright/test";

export async function completeIdentitySimulation(rentalPage: Page): Promise<void> {
  await expect(rentalPage.getByTestId("license-step")).toBeVisible({ timeout: 60_000 });
  await rentalPage.getByTestId("simulate-license-valid").click();
  await expect(rentalPage.getByTestId("license-valid")).toBeVisible({ timeout: 30_000 });

  const passportSim = rentalPage.getByTestId("simulate-passport-ready");
  if (await passportSim.isVisible()) {
    await passportSim.click();
    await expect(
      rentalPage.getByTestId("passport-ready").or(rentalPage.getByTestId("contract-review")),
    ).toBeVisible({ timeout: 30_000 });
  }

  const identityContinue = rentalPage.getByTestId("identity-continue");
  if (await identityContinue.isVisible()) {
    await expect(identityContinue).toBeEnabled({ timeout: 30_000 });
    await identityContinue.click();
  }
}

async function inkSignatureCanvas(page: Page, canvas: Locator): Promise<void> {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("signature canvas has no bounding box");

  const strokes = [0.35, 0.5, 0.65];
  for (const yRatio of strokes) {
    const y = box.y + box.height * yRatio;
    const x1 = box.x + Math.max(8, box.width * 0.15);
    const x2 = box.x + Math.max(16, box.width * 0.85);

    await page.mouse.move(x1, y);
    await page.mouse.down();
    await page.mouse.move(x2, y, { steps: 12 });
    await page.mouse.up();

    const relY = box.height * yRatio;
    const relX1 = Math.max(8, box.width * 0.15);
    const relX2 = Math.max(16, box.width * 0.85);
    await canvas.dispatchEvent("pointerdown", {
      pointerId: 1,
      clientX: x1,
      clientY: y,
      pressure: 0.5,
      button: 0,
      buttons: 1,
    });
    await canvas.dispatchEvent("pointermove", {
      pointerId: 1,
      clientX: x2,
      clientY: y,
      pressure: 0.5,
      button: 0,
      buttons: 1,
    });
    await canvas.dispatchEvent("pointerup", {
      pointerId: 1,
      clientX: x2,
      clientY: y,
      pressure: 0,
      button: 0,
      buttons: 0,
    });
    await page.waitForTimeout(200);
  }
}

export async function drawRequiredSignatures(page: Page): Promise<void> {
  const signatures = page.getByTestId("signatures");
  await signatures.scrollIntoViewIfNeeded();
  const canvases = signatures.locator("[data-required] canvas, canvas:visible");
  const count = await canvases.count();
  for (let index = 0; index < count; index += 1) {
    const canvas = canvases.nth(index);
    if (!(await canvas.isVisible())) continue;
    const wrapper = canvas.locator("xpath=..");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await inkSignatureCanvas(page, canvas);
      try {
        await expect(wrapper).toHaveAttribute("data-signed", "true", { timeout: 8_000 });
        break;
      } catch (error) {
        if (attempt === 1) throw error;
      }
    }
  }
}

async function completeTarsOtpIfRequired(rentalPage: Page): Promise<void> {
  const panel = rentalPage.getByTestId("tars-otp-panel");
  if (!(await panel.isVisible())) return;

  const send = rentalPage.getByTestId("tars-otp-send");
  if (await send.isVisible()) {
    await send.click();
    await expect(rentalPage.getByTestId("tars-otp-status-CODE_SENT")).toBeVisible({
      timeout: 60_000,
    });
  }

  const codeInput = rentalPage.getByTestId("tars-otp-code");
  await expect(codeInput).toBeVisible({ timeout: 60_000 });
  const code = process.env.PLAYWRIGHT_TARS_OTP_CODE ?? "000000";
  await codeInput.fill(code);
  await rentalPage.getByTestId("tars-otp-verify").click();
  await expect(rentalPage.getByTestId("tars-otp-status-VERIFIED")).toBeVisible({
    timeout: 60_000,
  });
}

async function fillRequiredReviewFields(rentalPage: Page): Promise<void> {
  const fillTest = rentalPage.getByTestId("contract-review-fill-test-data");
  if (await fillTest.isVisible()) {
    await fillTest.click();
  }

  const defaults: Record<string, string> = {
    address: "Dubai Marina, UAE",
    telephone: "+971501234567",
    nationality: "United Arab Emirates",
    hirerName: "E2E Hirer",
    passportNumber: "P1234567",
  };
  for (const [field, value] of Object.entries(defaults)) {
    const input = rentalPage.locator(`[data-field="${field}"]`);
    if ((await input.count()) === 0) continue;
    await input.first().scrollIntoViewIfNeeded();
    const current = (await input.first().inputValue()).trim();
    if (!current) await input.first().fill(value);
  }
}

async function persistContractReview(rentalPage: Page): Promise<void> {
  const reviewButton = rentalPage.getByRole("button", {
    name: /confirm review|save|تأكيد مراجعة|حفظ/i,
  });
  if (!(await reviewButton.isVisible()) || !(await reviewButton.isEnabled())) return;

  const saveResponse = rentalPage
    .waitForResponse(
      (response) =>
        ["POST", "PATCH", "PUT"].includes(response.request().method()) &&
        response.url().includes("/official-contract") &&
        !response.url().includes("/sign"),
      { timeout: 12_000 },
    )
    .catch(() => null);

  await reviewButton.click();
  const response = await saveResponse;
  if (response) {
    expect(response.ok(), `review save failed with status ${response.status()}`).toBeTruthy();
  }
}

/**
 * Saves review data, uploads drawn signatures, completes TARS OTP when required,
 * and signs the official contract.
 */
export async function completeContractReviewAndSign(rentalPage: Page): Promise<void> {
  const signButton = rentalPage.getByTestId("contract-review-sign");
  let signed = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await fillRequiredReviewFields(rentalPage);
    await drawRequiredSignatures(rentalPage);
    await completeTarsOtpIfRequired(rentalPage);
    await persistContractReview(rentalPage);

    await expect(signButton).toBeEnabled({ timeout: 120_000 });

    const signResponse = rentalPage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/official-contract/sign"),
      { timeout: 60_000 },
    );
    await signButton.click();

    try {
      const response = await signResponse;
      expect(response.ok(), `sign failed with status ${response.status()}`).toBeTruthy();
      signed = true;
      break;
    } catch (error) {
      const reviewError = rentalPage.getByTestId("contract-review-error");
      if (await reviewError.isVisible()) {
        const message = (await reviewError.innerText()).trim();
        if (attempt === 2) {
          throw new Error(`Contract sign blocked: ${message}`);
        }
      } else if (attempt === 2) {
        throw error;
      }
    }
  }

  expect(signed).toBeTruthy();

  await expect(
    rentalPage
      .getByTestId("contract-review-continue")
      .or(rentalPage.getByTestId("payment-step"))
      .or(rentalPage.getByTestId("handover-step")),
  ).toBeVisible({ timeout: 60_000 });
}

export async function continueAfterContractSign(rentalPage: Page): Promise<void> {
  const continueButton = rentalPage.getByTestId("contract-review-continue");
  if (await continueButton.isVisible()) {
    await continueButton.click();
  }
}
