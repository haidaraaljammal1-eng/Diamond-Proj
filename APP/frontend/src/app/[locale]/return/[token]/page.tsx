import { setRequestLocale } from "next-intl/server";
import { PublicReturnScreen } from "@/modules/public-return";

export default async function PublicReturnPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  return <PublicReturnScreen token={token} />;
}
