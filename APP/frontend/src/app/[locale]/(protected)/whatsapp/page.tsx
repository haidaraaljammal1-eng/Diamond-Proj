import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { WhatsAppScreen } from "@/modules/whatsapp";

export default async function WhatsAppPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <Suspense>
      <WhatsAppScreen />
    </Suspense>
  );
}
