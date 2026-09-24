import type { Page, Response } from "@playwright/test";
import { BACKEND } from "./e2e-api";

const FORBIDDEN_BUSINESS_PREFIXES = [
  "/contracts",
  "/customers",
  "/finance",
  "/payments",
  "/maintenance",
  "/gps",
  "/tars",
  "/road-liabilities",
  "/stripe",
];

const ALLOWED_PREFIXES = ["/archive", "/auth", "/users", "/operating-companies", "/notifications"];

export function attachArchiveApiGuard(page: Page) {
  const archiveCalls: Array<{ method: string; url: string; status: number }> = [];
  const apiBase = BACKEND.replace(/\/$/, "");

  page.on("response", (response: Response) => {
    const url = response.url();
    if (!url.startsWith(apiBase)) return;

    const pathname = new URL(url).pathname;
    if (pathname.startsWith("/archive")) {
      archiveCalls.push({
        method: response.request().method(),
        url,
        status: response.status(),
      });
      return;
    }

    if (ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return;

    for (const prefix of FORBIDDEN_BUSINESS_PREFIXES) {
      if (pathname.startsWith(prefix)) {
        throw new Error(`Archive page triggered forbidden API: ${response.request().method()} ${url}`);
      }
    }
  });

  return archiveCalls;
}
