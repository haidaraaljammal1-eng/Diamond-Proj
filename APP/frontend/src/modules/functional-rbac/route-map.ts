import type { FunctionalPageId } from "./types";

const PATH_TO_PAGE: Record<string, FunctionalPageId> = {
  "/dashboard": "dashboard",
  "/vehicles": "vehicles",
  "/gps": "gps",
  "/maintenance": "maintenance",
  "/archive": "archive",
  "/violations": "violations",
  "/finance": "finance",
  "/invoices": "invoices",
  "/contracts": "contracts",
  "/whatsapp": "whatsapp",
  "/team": "users",
  "/roles": "roles",
};

export function resolveFunctionalPageIdFromPath(pathWithoutLocale: string): FunctionalPageId | null {
  const normalized = pathWithoutLocale.replace(/\/+$/, "") || "/";
  if (PATH_TO_PAGE[normalized]) return PATH_TO_PAGE[normalized];

  for (const [prefix, pageId] of Object.entries(PATH_TO_PAGE)) {
    if (prefix !== "/" && normalized.startsWith(`${prefix}/`)) {
      return pageId;
    }
  }
  return null;
}
