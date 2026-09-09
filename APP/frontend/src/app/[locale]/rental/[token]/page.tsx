import { setRequestLocale } from "next-intl/server";
import { PublicRentalScreen } from "@/modules/public-rental";

export default async function PublicRentalPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  return <PublicRentalScreen token={token} />;
}
