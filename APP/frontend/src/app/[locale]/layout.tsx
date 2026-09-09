import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { routing } from "@/infrastructure/i18n/routing";
import { Providers } from "@/app/providers";
import { SimulationChrome } from "@/modules/demo-simulation";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Diamond Rent Car",
  description: "Diamond Rent Car frontend foundation",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <SimulationChrome />
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
