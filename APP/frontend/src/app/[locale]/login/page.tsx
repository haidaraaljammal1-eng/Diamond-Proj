import { auth } from "@/auth";
import { LoginScreen } from "@/modules/auth/components";
import { redirect } from "next/navigation";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();

  if (session?.user) redirect(`/${locale}/dashboard`);

  return <LoginScreen />;
}
