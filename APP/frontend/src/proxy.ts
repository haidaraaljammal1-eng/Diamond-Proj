import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { auth } from "@/auth";
import { routing } from "@/infrastructure/i18n/routing";

const intlMiddleware = createMiddleware(routing);

export default auth((request) => {
  const pathname = request.nextUrl.pathname;
  const locale =
    routing.locales.find(
      (item) => pathname === `/${item}` || pathname.startsWith(`/${item}/`),
    ) ?? routing.defaultLocale;
  const route = pathname.slice(`/${locale}`.length) || "/";
  const isAuthRoute = ["/login", "/forgot-password", "/reset-password"].some(
    (item) => route === item || route.startsWith(`${item}/`),
  );
  const isProtectedRoute =
    route === "/dashboard" || route.startsWith("/dashboard/");
  const isAuthenticated = !!request.auth?.user;

  if (isAuthRoute && isAuthenticated)
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  if (isProtectedRoute && !isAuthenticated)
    return NextResponse.redirect(new URL(`/${locale}/login`, request.url));
  return intlMiddleware(request);
});

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
