import { setRequestLocale } from "next-intl/server";
import { InvoicesScreen } from "@/modules/invoices";

/**
 * Invoices — read-only official invoice archive (`GET /invoices`).
 */
export default async function InvoicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <InvoicesScreen />;
}
