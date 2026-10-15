import fp from "fastify-plugin";
import cookie from "@fastify/cookie";
import { env, isCookieSecure } from "src/config/env";

export const cookiesPlugin = fp(
  async (fastify) => {
    await fastify.register(cookie, {
      secret: env.COOKIE_SECRET,
      parseOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: isCookieSecure(),
        path: "/",
      },
    });
  },
  { name: "cookies" },
);
