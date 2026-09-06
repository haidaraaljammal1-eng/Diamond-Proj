import { setRequestLocale } from "next-intl/server";
import { VehiclesScreen } from "@/modules/vehicles";

/**
 * Fleet / vehicles page — Demo `.cars` presentation backed by `GET /vehicles`.
 */
export default async function VehiclesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <VehiclesScreen />;
}
