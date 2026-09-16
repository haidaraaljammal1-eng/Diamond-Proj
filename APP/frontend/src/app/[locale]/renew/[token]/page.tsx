import { setRequestLocale } from "next-intl/server";
import { PublicRenewalScreen } from "@/modules/public-renewal";

export default async function PublicRenewalPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  return <PublicRenewalScreen token={token} />;
}
