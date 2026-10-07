import { expect, type Locator, type Page } from "@playwright/test";

const DEFAULT_TOLERANCE_PX = 5;
const VALUE_TRACK_TOLERANCE_PX = 3;
const CARD_TOP_TOLERANCE_PX = 3;
/** Stage-1 sub-progress sits directly above the active verification card (design-system gap). */
export const STAGE1_SUB_PROGRESS_GAP_TOLERANCE_PX = 16;
export const STAGE1_SUB_PROGRESS_AXIS_TOLERANCE_PX = 4;
export const STAGE1_SUB_PROGRESS_STABILITY_TOLERANCE_PX = 3;

/**
 * Stacked label above value in the same grid cell — shares start edge.
 */
export async function expectStackedLabelValueAligned(
  label: Locator,
  value: Locator,
  tolerancePx = DEFAULT_TOLERANCE_PX,
): Promise<{ labelX: number; valueX: number; delta: number }> {
  await expect(label).toBeVisible();
  await expect(value).toBeVisible();
  const labelBox = await label.boundingBox();
  const valueBox = await value.boundingBox();
  if (!labelBox || !valueBox) {
    throw new Error("Missing bounding box for label/value alignment check");
  }
  const delta = Math.abs(labelBox.x - valueBox.x);
  expect(delta, `stacked cell misalignment Δx=${delta}px`).toBeLessThanOrEqual(tolerancePx);
  return { labelX: labelBox.x, valueX: valueBox.x, delta };
}

/**
 * Two-column grid: every label shares a track; every value shares a track.
 */
export async function expectGridLabelValueTracksAligned(
  grid: Locator,
  labelTestIdPrefix: string,
  valueTestIdPrefix: string,
  tolerancePx = DEFAULT_TOLERANCE_PX,
): Promise<{ labelTrackDelta: number; valueTrackDelta: number }> {
  const labels = grid.locator(`[data-testid^="${labelTestIdPrefix}"]`);
  const values = grid.locator(`[data-testid^="${valueTestIdPrefix}"]`);
  const labelCount = await labels.count();
  const valueCount = await values.count();
  expect(labelCount).toBeGreaterThan(0);
  expect(valueCount).toBe(labelCount);

  const labelXs: number[] = [];
  const valueXs: number[] = [];
  for (let i = 0; i < labelCount; i += 1) {
    const lb = await labels.nth(i).boundingBox();
    const vb = await values.nth(i).boundingBox();
    expect(lb && vb).toBeTruthy();
    labelXs.push(lb!.x);
    valueXs.push(vb!.x);
  }

  const labelTrackDelta = Math.max(...labelXs) - Math.min(...labelXs);
  const valueTrackDelta = Math.max(...valueXs) - Math.min(...valueXs);
  expect(labelTrackDelta, `label column track spread ${labelTrackDelta}px`).toBeLessThanOrEqual(
    tolerancePx,
  );
  expect(valueTrackDelta, `value column track spread ${valueTrackDelta}px`).toBeLessThanOrEqual(
    tolerancePx,
  );

  return { labelTrackDelta, valueTrackDelta };
}

export async function expectValueColumnSpread(
  valueLocators: Locator[],
  tolerancePx = VALUE_TRACK_TOLERANCE_PX,
): Promise<{ minX: number; maxX: number; spread: number; positions: number[] }> {
  const positions: number[] = [];
  for (const locator of valueLocators) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box).toBeTruthy();
    positions.push(box!.x);
  }
  const minX = Math.min(...positions);
  const maxX = Math.max(...positions);
  const spread = maxX - minX;
  expect(spread, `value column spread ${spread}px`).toBeLessThanOrEqual(tolerancePx);
  return { minX, maxX, spread, positions };
}

export async function expectLabelColumnSpread(
  labelLocators: Locator[],
  tolerancePx = VALUE_TRACK_TOLERANCE_PX,
): Promise<{ spread: number }> {
  const positions: number[] = [];
  for (const locator of labelLocators) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box).toBeTruthy();
    positions.push(box!.x);
  }
  const spread = Math.max(...positions) - Math.min(...positions);
  expect(spread, `label column spread ${spread}px`).toBeLessThanOrEqual(tolerancePx);
  return { spread };
}

export async function expectCardTopEdgesAligned(
  summaryCard: Locator,
  mainCard: Locator,
  tolerancePx = CARD_TOP_TOLERANCE_PX,
): Promise<{ summaryY: number; mainY: number; delta: number }> {
  await expect(summaryCard).toBeVisible();
  await expect(mainCard).toBeVisible();
  const summaryBox = await summaryCard.boundingBox();
  const mainBox = await mainCard.boundingBox();
  if (!summaryBox || !mainBox) {
    throw new Error("Missing bounding box for card top alignment");
  }
  const delta = Math.abs(summaryBox.y - mainBox.y);
  expect(delta, `card top misalignment Δy=${delta}px`).toBeLessThanOrEqual(tolerancePx);
  return { summaryY: summaryBox.y, mainY: mainBox.y, delta };
}

export async function expectPageBackgroundContinuous(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBe(false);

  const seam = await page.evaluate(() => {
    const htmlBg = getComputedStyle(document.documentElement).backgroundImage;
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const tall = document.documentElement.scrollHeight > window.innerHeight * 1.2;
    const midY = Math.floor(window.innerHeight * 0.55);
    const el = document.elementFromPoint(Math.floor(window.innerWidth / 2), midY);
    const elBg = el ? getComputedStyle(el).backgroundColor : "";
    const whiteBand =
      elBg === "rgb(255, 255, 255)" &&
      bodyBg === "rgba(0, 0, 0, 0)" &&
      tall;
    return { htmlHasBg: htmlBg !== "none", bodyTransparent: bodyBg === "rgba(0, 0, 0, 0)", whiteBand };
  });
  expect(seam.htmlHasBg).toBe(true);
  expect(seam.bodyTransparent).toBe(true);
  expect(seam.whiteBand).toBe(false);
}

export interface BoxMetrics {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function readBoxMetrics(locator: Locator): Promise<BoxMetrics> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error("Missing bounding box");
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

export async function expectSubProgressAlignedToActiveCard(
  subProgress: Locator,
  activeCard: Locator,
  tolerancePx = STAGE1_SUB_PROGRESS_AXIS_TOLERANCE_PX,
): Promise<{ deltaX: number; deltaWidth: number }> {
  const sub = await readBoxMetrics(subProgress);
  const card = await readBoxMetrics(activeCard);
  const deltaX = Math.abs(sub.x - card.x);
  const deltaWidth = Math.abs(sub.width - card.width);
  expect(deltaX, `sub-progress Δx=${deltaX}px`).toBeLessThanOrEqual(tolerancePx);
  expect(deltaWidth, `sub-progress Δwidth=${deltaWidth}px`).toBeLessThanOrEqual(tolerancePx);
  return { deltaX, deltaWidth };
}

export async function readBoxMetricsRelativeTo(
  locator: Locator,
  parent: Locator,
): Promise<BoxMetrics> {
  const child = await readBoxMetrics(locator);
  const parentBox = await readBoxMetrics(parent);
  return {
    x: child.x - parentBox.x,
    y: child.y - parentBox.y,
    width: child.width,
    height: child.height,
  };
}

export async function expectSubProgressStability(samples: BoxMetrics[]): Promise<{
  xSpread: number;
  widthSpread: number;
}> {
  const xs = samples.map((s) => s.x);
  const widths = samples.map((s) => s.width);
  const xSpread = Math.max(...xs) - Math.min(...xs);
  const widthSpread = Math.max(...widths) - Math.min(...widths);
  expect(xSpread, `sub-progress X spread ${xSpread}px`).toBeLessThanOrEqual(
    STAGE1_SUB_PROGRESS_STABILITY_TOLERANCE_PX,
  );
  expect(widthSpread, `sub-progress width spread ${widthSpread}px`).toBeLessThanOrEqual(
    STAGE1_SUB_PROGRESS_STABILITY_TOLERANCE_PX,
  );
  return { xSpread, widthSpread };
}

export async function expectMainProgressConnector(page: Page): Promise<{ width: number }> {
  const connector = page.getByTestId("rental-progress-connector");
  await expect(connector).toBeVisible();
  const base = page.getByTestId("rental-progress-connector-base");
  const box = await base.boundingBox();
  expect(box).toBeTruthy();
  expect(box!.width, "main connector width").toBeGreaterThan(120);
  const paint = await base.evaluate((el) => {
    const style = getComputedStyle(el);
    return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage };
  });
  expect(
    paint.backgroundImage !== "none" || paint.backgroundColor !== "rgba(0, 0, 0, 0)",
    "connector gold paint",
  ).toBeTruthy();
  return { width: box!.width };
}

/** Main connector gold comet runs continuously (no hover). */
export async function expectMainProgressAutoMotion(page: Page): Promise<void> {
  const segment = page.getByTestId("rental-progress-connector-pulse-segment");
  await expect(segment).toBeAttached();
  const motion = await segment.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      animationName: style.animationName,
      playState: style.animationPlayState,
    };
  });
  expect(motion.animationName).not.toBe("none");
  expect(motion.animationName).toMatch(/rentalConnectorComet/);
  expect(motion.playState).toBe("running");

  const t0 = await segment.evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(650);
  const t1 = await segment.evaluate((el) => getComputedStyle(el).transform);
  expect(t0).not.toBe(t1);

  await page.waitForTimeout(2600);
  const stillRunning = await segment.evaluate((el) => getComputedStyle(el).animationPlayState);
  expect(stillRunning).toBe("running");
}

/** @deprecated Use expectMainProgressAutoMotion — comet is always-on. */
export async function expectMainProgressPulseActive(page: Page): Promise<void> {
  await expectMainProgressAutoMotion(page);
}

export async function expectSubProgressAutoMotion(page: Page): Promise<void> {
  const comet = page.getByTestId("document-sub-progress-comet");
  await expect(comet).toBeAttached();
  const motion = await comet.evaluate((el) => {
    const style = getComputedStyle(el);
    return { animationName: style.animationName, playState: style.animationPlayState };
  });
  expect(motion.animationName).not.toBe("none");
  expect(motion.animationName).toMatch(/subProgress/);
  expect(motion.playState).toBe("running");

  const readMotionSample = () =>
    comet.evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.transform}|${style.opacity}`;
    });
  const samples = new Set<string>();
  for (let i = 0; i < 8; i += 1) {
    samples.add(await readMotionSample());
    await page.waitForTimeout(350);
  }
  expect(samples.size, `sub-progress motion samples=${samples.size}`).toBeGreaterThan(1);
}

export async function expectStageSuccessSvgAnimating(page: Page): Promise<void> {
  const transition = page.getByTestId("stage-success-transition");
  await expect(transition).toBeVisible();
  await expect(page.getByTestId("stage-success-svg")).toBeVisible();
  await expect(transition.locator("img")).toHaveCount(0);
  const circle = page.getByTestId("stage-success-circle");
  const check = page.getByTestId("stage-success-check");
  const early = await circle.evaluate((el) => getComputedStyle(el).strokeDashoffset);
  await page.waitForTimeout(900);
  const laterCircle = await circle.evaluate((el) => getComputedStyle(el).strokeDashoffset);
  const laterCheck = await check.evaluate((el) => getComputedStyle(el).strokeDashoffset);
  expect(Number.parseFloat(early)).toBeGreaterThan(0);
  expect(Number.parseFloat(laterCircle)).toBeLessThan(Number.parseFloat(early));
  expect(Number.parseFloat(laterCheck)).toBeLessThan(64);
}

export async function expectStage1SubProgressAboveCard(
  subProgress: Locator,
  activeCard: Locator,
  tolerancePx = STAGE1_SUB_PROGRESS_GAP_TOLERANCE_PX,
): Promise<{ gapPx: number; columnDeltaPx: number }> {
  await expect(subProgress).toBeVisible();
  await expect(activeCard).toBeVisible();
  const subBox = await subProgress.boundingBox();
  const cardBox = await activeCard.boundingBox();
  if (!subBox || !cardBox) {
    throw new Error("Missing bounding box for stage-1 sub-progress placement");
  }
  const gapPx = cardBox.y - (subBox.y + subBox.height);
  const columnDeltaPx = Math.abs(subBox.x - cardBox.x);
  expect(gapPx, `sub-progress → card gap ${gapPx}px`).toBeGreaterThanOrEqual(0);
  expect(gapPx, `sub-progress → card gap ${gapPx}px`).toBeLessThanOrEqual(tolerancePx);
  expect(columnDeltaPx, `column misalignment Δx=${columnDeltaPx}px`).toBeLessThanOrEqual(6);
  return { gapPx, columnDeltaPx };
}

export async function expectDocumentVerificationSuccessStack(
  page: Page,
  options: {
    successTestId: string;
    previewTestId?: string;
    replaceButtonName?: RegExp;
    captureTestId?: string;
    replaceTestId?: string;
    /** Scope capture control to the card that contains the success block. */
    stepTestId?: string;
    factTestIds: string[];
    requirePreview?: boolean;
  },
): Promise<void> {
  const stepScope = options.stepTestId
    ? page.getByTestId(options.stepTestId).filter({ has: page.getByTestId(options.successTestId) })
    : page;
  const success = stepScope.getByTestId(options.successTestId);
  await expect(success).toBeVisible();
  for (const factId of options.factTestIds) {
    await expect(success.getByTestId(factId)).toBeVisible();
    await expect(success.getByTestId(factId)).not.toHaveRole("textbox");
  }
  const replaceButton = options.replaceTestId
    ? stepScope.getByTestId(options.replaceTestId)
    : options.captureTestId
      ? stepScope.getByTestId(options.captureTestId).getByRole("button")
      : page.getByRole("button", { name: options.replaceButtonName! });
  await expect(replaceButton).toBeVisible();

  const successBox = await success.boundingBox();
  const buttonBox = await replaceButton.boundingBox();
  if (!successBox || !buttonBox) {
    throw new Error("Missing bounding box for document success stack");
  }

  const preview = options.previewTestId ? success.getByTestId(options.previewTestId) : null;
  const previewVisible = preview ? await preview.isVisible() : false;
  if (options.requirePreview) {
    expect(previewVisible, "document preview image").toBeTruthy();
  }

  if (previewVisible && preview) {
    const previewBox = await preview.boundingBox();
    if (!previewBox) throw new Error("Missing preview bounding box");
    expect(successBox.y, "success card above preview").toBeLessThan(previewBox.y);
    expect(previewBox.y, "preview above replace").toBeLessThan(buttonBox.y);
  } else {
    expect(successBox.y, "success card above replace").toBeLessThan(buttonBox.y);
  }
}

export async function expectStepHoverLift(stepButton: Locator): Promise<void> {
  await expect(stepButton).toBeEnabled();
  const readStyles = (el: HTMLElement) => {
    const stepStyle = getComputedStyle(el);
    const marker = el.firstElementChild;
    const markerStyle = marker ? getComputedStyle(marker) : null;
    return {
      transform: stepStyle.transform,
      color: stepStyle.color,
      markerTransform: markerStyle?.transform ?? "",
      markerShadow: markerStyle?.boxShadow ?? "",
      markerBorder: markerStyle?.borderColor ?? "",
    };
  };
  const before = await stepButton.evaluate(readStyles);
  await stepButton.hover({ force: true });
  await stepButton.page().waitForTimeout(300);
  const after = await stepButton.evaluate(readStyles);
  const transformChanged = before.transform !== after.transform && after.transform !== "none";
  const colorChanged = before.color !== after.color;
  const markerTransformChanged =
    before.markerTransform !== after.markerTransform && after.markerTransform !== "none";
  const markerShadowChanged = before.markerShadow !== after.markerShadow;
  const markerBorderChanged = before.markerBorder !== after.markerBorder;
  expect(
    transformChanged ||
      colorChanged ||
      markerTransformChanged ||
      markerShadowChanged ||
      markerBorderChanged,
    `expected hover style change, before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
  ).toBeTruthy();
}
