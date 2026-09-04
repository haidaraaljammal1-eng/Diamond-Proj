import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import { env } from "src/config/env";

/**
 * JWT for SHORT-LIVED access tokens only (signed with JWT_ACCESS_SECRET).
 * Refresh tokens are OPAQUE and stored hashed in AuthSession — they are never
 * JWTs. Access-token TTL is applied at sign time in the auth service.
 */
export const jwtPlugin = fp(
  async (fastify) => {
    await fastify.register(jwt, {
      secret: env.JWT_ACCESS_SECRET,
      cookie: { cookieName: "access_token", signed: false },
    });
  },
  { name: "jwt" },
);
