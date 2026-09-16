import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { GpsScreen } from "@/modules/gps";

export default async function GpsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense>
      <GpsScreen />
    </Suspense>
  );
}
