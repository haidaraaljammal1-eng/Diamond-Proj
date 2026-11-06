import { STAFF_REAUTH_QUERY } from "./staff-login-guard.ts";

/** Target URL after clearing the Auth.js session (full navigation, not router.refresh). */
export function staffLoginRedirectPath(
  locale: "ar" | "en",
  reauth = true,
): string {
  const base = `/${locale}/login`;
  return reauth ? `${base}?${STAFF_REAUTH_QUERY}=1` : base;
}

export async function forceStaffLogout(locale: "ar" | "en"): Promise<void> {
  if (typeof window === "undefined") return;
  const target = staffLoginRedirectPath(locale);
  try {
    const { signOut } = await import("next-auth/react");
    await signOut({ redirect: false });
  } catch {
    /* still leave the protected shell */
  }
  window.location.replace(target);
}
