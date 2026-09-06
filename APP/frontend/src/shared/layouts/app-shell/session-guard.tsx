"use client";

import { useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import { useLocale } from "next-intl";

/**
 * Ends a session whose Backend tokens can no longer be refreshed.
 *
 * Without this, a dead session still looks authenticated to the shell: every
 * page keeps rendering and every request comes back 401, so the user sees a
 * data-loading error ("could not load the fleet") instead of the real cause.
 * Signing out sends them to the login screen, which is the only thing that can
 * actually fix it.
 */
export function SessionGuard() {
  const { data: session } = useSession();
  const locale = useLocale();
  const expired = session?.error === "RefreshAccessTokenError";

  useEffect(() => {
    if (!expired) return;
    void signOut({ redirectTo: `/${locale}/login` });
  }, [expired, locale]);

  return null;
}
