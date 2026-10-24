import type { Browser } from "playwright";

let browserInstance: Browser | null = null;
let browserLaunch: Promise<Browser> | null = null;

const MAX_CONCURRENT = 2;
let inFlight = 0;
const waitQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight += 1;
    return;
  }
  await new Promise<void>((resolve) => waitQueue.push(resolve));
  inFlight += 1;
}

function releaseSlot(): void {
  inFlight -= 1;
  const next = waitQueue.shift();
  if (next) next();
}

export async function withContractPdfBrowser<T>(
  chromium: typeof import("playwright").chromium,
  fn: (browser: Browser) => Promise<T>,
): Promise<T> {
  await acquireSlot();
  try {
    if (!browserInstance?.isConnected()) {
      browserLaunch ??= chromium.launch({ headless: true });
      browserInstance = await browserLaunch;
      browserLaunch = null;
    }
    return await fn(browserInstance);
  } finally {
    releaseSlot();
  }
}

export async function shutdownContractPdfBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close().catch(() => undefined);
    browserInstance = null;
  }
  browserLaunch = null;
}
