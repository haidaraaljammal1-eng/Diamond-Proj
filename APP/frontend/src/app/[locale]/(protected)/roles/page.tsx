import { setRequestLocale } from "next-intl/server";
import { RolesScreen } from "@/modules/roles";

/**
 * Roles & Permissions — read-only matrix of the Backend RBAC.
 *
 * The route stays thin: locale context plus the domain screen. Authentication
 * is enforced by the protected layout, and the Backend permissions the page
 * reads are checked inside the domain hook (and, authoritatively, by the
 * Backend on every request).
 */
export default async function RolesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <RolesScreen />;
}
