import fp from "fastify-plugin";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env, isDevelopment } from "src/config/env";
import { normalizedNameExtension } from "src/lib/db/prisma-extensions";

/**
 * Prisma client (PostgreSQL driver adapter). Global field omission is a
 * defense-in-depth safety net: secret hashes are NEVER returned unless a query
 * explicitly overrides the omit (e.g. the auth repository selecting passwordHash
 * to verify a login). No API response should ever carry these fields.
 */
const globalOmit = {
  user: {
    passwordHash: true,
    twoFactorSecretEncrypted: true,
    twoFactorPendingSecretEncrypted: true,
  },
  authSession: { refreshTokenHash: true },
  securityToken: { tokenHash: true },
  twoFactorRecoveryCode: { codeHash: true },
} satisfies Prisma.GlobalOmitConfig;

export const prismaPlugin = fp(
  async (fastify) => {
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    const base = new PrismaClient({
      adapter,
      omit: globalOmit,
      log: isDevelopment ? ["warn", "error"] : ["error"],
    });

    await base.$connect();
    // Derive `normalizedName` from `name` on master-data writes (branch / vehicle
    // model / salesperson) so the sales importer's name-based matching stays
    // consistent everywhere.
    const prisma = base.$extends(normalizedNameExtension);
    // The concrete client carries the global-omit config in its type params; the
    // decoration slot is the base PrismaClient. Runtime omit behavior is
    // unaffected — this only aligns the (structurally compatible) types.
    fastify.decorate("prisma", prisma as unknown as PrismaClient);

    fastify.addHook("onClose", async () => {
      await base.$disconnect();
    });
  },
  { name: "prisma" },
);
