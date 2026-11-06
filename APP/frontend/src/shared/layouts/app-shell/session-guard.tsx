"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "next-intl";
import { apiRequest } from "@/infrastructure/api/client";
import { forceStaffLogout } from "@/infrastructure/auth/force-staff-logout";

/** How often to re-check that the Backend session behind the access token is still valid. */
const SESSION_PING_MS = 45_000;

/**
 * Ends a session whose Backend tokens can no longer be refreshed.
 *
 * Without this, a dead session still looks authenticated to the shell: every
 * page keeps rendering and every request comes back 401, so the user sees a
 * data-loading error ("could not load the fleet") instead of the real cause.
 * Signing out sends them to the login screen, which is the only thing that can
 * actually fix it.
 *
 * Periodic `/auth/me` catches admin password resets and other server-side
 * session revocations while the tab stays open (access JWT alone used to stay
 * valid until expiry even after `authSession.revokedAt` was set).
 */
export function SessionGuard() {
  const { data: session, status } = useSession();
  const locale = useLocale();
  const loggingOutRef = useRef(false);
  const expired = session?.error === "RefreshAccessTokenError";
  const authenticated = status === "authenticated" && !expired;

  useEffect(() => {
    if (!expired || loggingOutRef.current) return;
    loggingOutRef.current = true;
    void forceStaffLogout(locale === "en" ? "en" : "ar");
  }, [expired, locale]);

  useEffect(() => {
    if (!authenticated || loggingOutRef.current) return;

    const ping = () => {
      if (loggingOutRef.current) return;
      void apiRequest("/auth/me").catch(() => {
        /* apiRequest clears session and replaces location on dead session codes */
      });
    };

    ping();
    const timer = window.setInterval(ping, SESSION_PING_MS);
    const onFocus = () => ping();
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [authenticated]);

  return null;
}
