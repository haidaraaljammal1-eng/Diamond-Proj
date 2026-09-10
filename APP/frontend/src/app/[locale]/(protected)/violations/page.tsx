import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { RoadLiabilitiesScreen } from "@/modules/road-liabilities";

export default async function ViolationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense>
      <RoadLiabilitiesScreen />
    </Suspense>
  );
}
