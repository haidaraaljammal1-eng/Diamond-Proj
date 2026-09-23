import { setRequestLocale } from "next-intl/server";
import { ArchiveScreen } from "@/modules/archive";

export default async function ArchivePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <ArchiveScreen />;
}
