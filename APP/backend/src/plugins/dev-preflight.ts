import fp from "fastify-plugin";
import { isDevelopment } from "src/config/env";
import { DEMO_FLEET, DEMO_FLEET_EXTERNAL_ID_PREFIX } from "prisma/seed/demo-fleet";

/**
 * Development-only warning when the local database is missing the minimum
 * Demo Fleet seed. Never migrates or seeds on startup.
 */
export const devPreflightPlugin = fp(
  async (fastify) => {
    if (!isDevelopment) return;

    try {
      const found = await fastify.prisma.vehicle.count({
        where: { externalId: { startsWith: DEMO_FLEET_EXTERNAL_ID_PREFIX } },
      });
      if (found < DEMO_FLEET.length) {
        fastify.log.warn(
          { found, expected: DEMO_FLEET.length },
          "Development database is not bootstrapped. Run: npm run dev:bootstrap",
        );
      }
    } catch {
      fastify.log.warn(
        "Development database is not bootstrapped. Run: npm run dev:bootstrap",
      );
    }
  },
  { name: "dev-preflight", dependencies: ["prisma"] },
);
