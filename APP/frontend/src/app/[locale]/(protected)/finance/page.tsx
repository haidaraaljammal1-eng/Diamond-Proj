import { setRequestLocale } from "next-intl/server";
import { FinanceScreen } from "@/modules/finance";

/**
 * Finance — administrative financial operations center backed by `/finance/*`.
 */
export default async function FinancePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <FinanceScreen />;
}
