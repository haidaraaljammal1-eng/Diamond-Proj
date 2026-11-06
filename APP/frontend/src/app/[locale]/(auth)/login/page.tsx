import { Suspense } from "react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { shouldRedirectAuthenticatedStaffFromLogin } from "@/infrastructure/auth/staff-login-guard";
import { LoginScreen } from "@/modules/auth/components";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ reauth?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  setRequestLocale(locale);
  const session = await auth();

  if (shouldRedirectAuthenticatedStaffFromLogin(session, query.reauth === "1")) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}