import { setRequestLocale } from "next-intl/server";
import { DashboardScreen } from "@/modules/dashboard";

/** Home dashboard — the Demo owner/employee overview. */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <DashboardScreen />;
}
