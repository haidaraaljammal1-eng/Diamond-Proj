import { setRequestLocale } from "next-intl/server";
import { MaintenanceScreen } from "@/modules/maintenance";

/**
 * Maintenance Center — Demo `.maint` presentation backed by `/maintenance`.
 */
export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <MaintenanceScreen />;
}
