import fp from "fastify-plugin";
import cors from "@fastify/cors";
import { env, isDevelopment } from "src/config/env";

/**
 * CORS allow-list from env. No permissive "*" in production (env validation
 * also rejects it). Development with an empty list falls back to allowing all
 * origins for convenience only.
 */
export const corsPlugin = fp(
  async (fastify) => {
    await fastify.register(cors, {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true); // non-browser clients (curl, server-to-server)
        if (env.CORS_ORIGINS.length === 0) return cb(null, isDevelopment);
        if (env.CORS_ORIGINS.includes("*") || env.CORS_ORIGINS.includes(origin)) {
          return cb(null, true);
        }
        return cb(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      // File downloads are served from a different origin than the SPA, and a browser
      // hides every response header from cross-origin JS unless it is listed here. The
      // export endpoints name their own file (report / date, RFC 5987) — without this
      // the client cannot read that name and silently falls back to a generic one.
      exposedHeaders: ["content-disposition"],
    });
  },
  { name: "cors" },
);
