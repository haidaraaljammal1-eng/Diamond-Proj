import fp from "fastify-plugin";
import cookie from "@fastify/cookie";
import { env } from "src/config/env";

export const cookiesPlugin = fp(
  async (fastify) => {
    await fastify.register(cookie, {
      secret: env.COOKIE_SECRET,
      parseOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        path: "/",
      },
    });
  },
  { name: "cookies" },
);
