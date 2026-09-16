import { setRequestLocale } from "next-intl/server";
import { DashboardScreen } from "@/modules/dashboard";

/** Home dashboard — live operational aggregation from GET /dashboard/overview. */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <DashboardScreen />;
}
