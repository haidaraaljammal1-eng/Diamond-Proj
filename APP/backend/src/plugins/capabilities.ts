import fp from "fastify-plugin";
import { env } from "src/config/env";

/**
 * Runtime capability flags. Safe subset is exposed to the frontend (see the
 * public capabilities route) so the UI can hide/disable features WITH a reason
 * instead of faking functionality. Secrets are never exposed.
 */
export interface Capabilities {
  email: boolean;
  files: boolean;
  push: boolean;
  sms: boolean;
}

declare module "fastify" {
  interface FastifyInstance {
    capabilities: Capabilities;
  }
}

export const capabilitiesPlugin = fp(
  async (fastify) => {
    fastify.decorate("capabilities", {
      email: env.EMAIL_ENABLED,
      files: true,
      push: false,
      sms: false,
    });
  },
  { name: "capabilities" },
);
