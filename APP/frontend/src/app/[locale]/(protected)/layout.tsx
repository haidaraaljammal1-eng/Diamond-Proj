import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { AppShell } from "@/shared/layouts/app-shell";

/**
 * Protected application layout.
 *
 * Stays intentionally thin:
 * - server-side auth guard (no UI flash — protection happens before render),
 * - locale request context,
 * - render of the shared AppShell that hosts every protected page.
 *
 * No sidebar/navigation/permission/business logic lives here.
 */
export default async function ProtectedLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user) redirect(`/${locale}/login`);

  setRequestLocale(locale);

  return <AppShell>{children}</AppShell>;
}