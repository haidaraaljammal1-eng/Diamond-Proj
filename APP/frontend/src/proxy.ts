import createMiddleware from "next-intl/middleware";
import { routing } from "@/infrastructure/i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};