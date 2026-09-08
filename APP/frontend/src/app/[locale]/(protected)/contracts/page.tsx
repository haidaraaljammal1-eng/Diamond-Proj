import { setRequestLocale } from "next-intl/server";
import { ContractsScreen } from "@/modules/contracts";

export default async function ContractsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ContractsScreen />;
}
