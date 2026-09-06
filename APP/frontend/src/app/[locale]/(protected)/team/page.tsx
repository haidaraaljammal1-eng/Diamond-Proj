import { setRequestLocale } from "next-intl/server";
import { UsersScreen } from "@/modules/users";

/**
 * Staff / team page — Backend users list with Demo `.team` presentation.
 */
export default async function TeamPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <UsersScreen />;
}
