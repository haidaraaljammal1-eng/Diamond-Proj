import createMiddleware from "next-intl/middleware";
import { routing } from "./src/infrastructure/i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/", "/(ar|en)/:path*"],
};
