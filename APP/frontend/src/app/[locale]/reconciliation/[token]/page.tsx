import { setRequestLocale } from "next-intl/server";
import { PublicReconciliationScreen } from "@/modules/public-reconciliation";

export default async function PublicReconciliationPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  return <PublicReconciliationScreen token={token} />;
}
