import fp from "fastify-plugin";
import fastifyAutoload from "@fastify/autoload";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { publicHook } from "src/services/roles/public/hook";
import { userHook } from "src/services/roles/user/hook";
import { adminHook } from "src/services/roles/admin/hook";
import { externalHook } from "src/services/roles/external/hook";

/**
 * Role-based route autoloading.
 *
 * Convention: src/modules/<feature>/routes/<accessLevel>/.../route.ts
 *   → the "routes" and "<accessLevel>" folders are stripped from the URL.
 *   e.g. modules/auth/routes/public/login/route.ts → POST /auth/login
 *        modules/users/routes/admin/route.ts       → /users
 *
 * Each access level runs in its own encapsulated context with its auth hook
 * applied first, then only that level's routes are loaded into it. To add a new
 * access level: create src/services/roles/<name>/hook.ts and add it to the map
 * below, then place routes under routes/<name>/.
 */
const ACCESS_LEVELS = ["public", "user", "admin", "external"] as const;
type AccessLevel = (typeof ACCESS_LEVELS)[number];

const HOOKS: Record<AccessLevel, (instance: FastifyInstance) => void> = {
  public: publicHook,
  user: userHook,
  admin: adminHook,
  external: externalHook,
};

const accessLevelSet = new Set<string>(ACCESS_LEVELS);

export const autoloadPlugin = fp(
  async (fastify) => {
    const modulesDir = path.join(__dirname, "..", "modules");

    for (const level of ACCESS_LEVELS) {
      await fastify.register(async (instance) => {
        HOOKS[level](instance);
        await instance.register(fastifyAutoload, {
          dir: modulesDir,
          indexPattern: /route\.(js|ts)$/,
          matchFilter: (filePath) =>
            filePath.includes(`/${level}/`) || filePath.includes(`\\${level}\\`),
          dirNameRoutePrefix: (_folderParent, folderName) =>
            folderName === "routes" || accessLevelSet.has(folderName)
              ? false
              : folderName,
        });
      });
    }
  },
  { name: "autoload", dependencies: ["prisma", "jwt", "audit"] },
);
