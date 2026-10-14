import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const BACKEND = process.env.PLAYWRIGHT_API_URL ?? "http://localhost:8000";

export const RBAC_V2_E2E_ENABLED = process.env.PLAYWRIGHT_RBAC_V2_E2E === "true";

export const EXPECTED_FUNCTIONAL_GROUPS = 12;
export const EXPECTED_FUNCTIONAL_CAPABILITIES = 34;

export function requireRbacV2E2E(): void {
  if (!RBAC_V2_E2E_ENABLED) {
    throw new Error(
      "Set PLAYWRIGHT_RBAC_V2_E2E=true with V2 backend+frontend running (see e2e/rbac-v2-roles.spec.ts header).",
    );
  }
}

async function establishNextAuthSession(
  page: Page,
  email: string,
  password: string,
  locale: "ar" | "en",
): Promise<void> {
  const baseURL = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100").replace(
    /\/$/,
    "",
  );
  await page.goto(`${baseURL}/${locale}/login`, { waitUntil: "load" });
  await page
    .locator('[data-testid="login-shell"], #login')
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  const csrfRes = await page.request.get(`${baseURL}/api/auth/csrf`);
  expect(csrfRes.ok(), `CSRF failed: ${csrfRes.status()}`).toBeTruthy();
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const signInRes = await page.request.post(`${baseURL}/api/auth/callback/credentials`, {
    form: {
      csrfToken,
      email,
      password,
      callbackUrl: `${baseURL}/${locale}/dashboard`,
    },
    headers: {
      Origin: baseURL,
      Referer: `${baseURL}/${locale}/login`,
    },
  });
  expect(
    signInRes.ok() || signInRes.status() === 302,
    `Credentials sign-in HTTP ${signInRes.status()}`,
  ).toBeTruthy();
  const sessionRes = await page.request.get(`${baseURL}/api/auth/session`);
  expect(sessionRes.ok()).toBeTruthy();
  const session = (await sessionRes.json()) as {
    user?: { email?: string };
    accessToken?: string;
  } | null;
  expect(session?.user?.email).toBe(email);
  expect(session?.accessToken, "NextAuth session must expose accessToken for staff API calls").toBeTruthy();
}

export async function loginStaffWithCredentials(
  page: Page,
  locale: "ar" | "en",
  email: string,
  password: string,
): Promise<void> {
  await establishNextAuthSession(page, email, password, locale);
  await page.goto(`/${locale}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(
    (url) => url.pathname.includes(`/${locale}/`) && !url.pathname.includes("/login"),
    { timeout: 60_000 },
  );
}

export async function loginStaff(page: Page, locale: "ar" | "en") {
  const email = process.env.PLAYWRIGHT_LOGIN_EMAIL;
  const password = process.env.PLAYWRIGHT_LOGIN_PASSWORD;
  if (!email || !password) {
    throw new Error("PLAYWRIGHT_LOGIN_EMAIL and PLAYWRIGHT_LOGIN_PASSWORD are required");
  }
  await loginStaffWithCredentials(page, locale, email, password);
}

export async function gotoRolesMatrixReady(page: Page, locale: "ar" | "en") {
  const captureFile = process.env.PLAYWRIGHT_CAPTURE_NETWORK_FILE;
  const consoleErrors: string[] = [];
  let rolesRequestUrl: string | undefined;
  let rolesStatus: number | undefined;

  if (captureFile) {
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("/roles") && u.includes("page=")) rolesRequestUrl = u;
    });
    page.on("response", async (res) => {
      const u = res.url();
      if (u.includes("/roles") && u.includes("page=")) rolesStatus = res.status();
    });
  }

  await page.goto(`/${locale}/roles`, { waitUntil: "load", timeout: 90_000 });
  await expect(page.getByTestId("roles-search")).toBeVisible({ timeout: 90_000 });

  if (captureFile) {
    const groupsCount = await page.getByTestId(/^functional-rbac-group-/).count();
    const capabilitiesCount = await page.getByTestId("functional-rbac-capability-row").count();
    const fs = await import("node:fs");
    fs.writeFileSync(
      captureFile,
      JSON.stringify(
        {
          rolesRequestUrl,
          rolesStatus,
          rolesSearchVisible: true,
          groupsCount,
          capabilitiesCount,
          consoleErrors,
        },
        null,
        2,
      ),
    );
  }
}

export async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${BACKEND}/auth/login`, {
    data: { email, password },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

export async function createRoleViaApi(
  request: APIRequestContext,
  token: string,
  key: string,
  name: string,
) {
  const res = await request.post(`${BACKEND}/roles`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { key, name, permissionKeys: [] },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).data as {
    id: number;
    key: string;
    name: string;
    permissions: string[];
  };
}
