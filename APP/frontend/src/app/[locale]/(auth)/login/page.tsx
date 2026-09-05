import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { LoginScreen } from "@/modules/auth/components";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();

  if (session?.user) redirect(`/${locale}/dashboard`);

  return <LoginScreen />;
}