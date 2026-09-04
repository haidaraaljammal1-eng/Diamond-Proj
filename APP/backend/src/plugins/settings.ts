import fp from "fastify-plugin";
import type { PrismaClient } from "@prisma/client";

/**
 * Typed settings accessors backed by the Setting table. Critical/secret config
 * should prefer env; secret settings are never returned by the public settings
 * route.
 */
export interface SettingsService {
  get(key: string): Promise<string | null>;
  getNumber(key: string, fallback: number): Promise<number>;
  getBoolean(key: string, fallback: boolean): Promise<boolean>;
  getJson<T>(key: string, fallback: T): Promise<T>;
}

declare module "fastify" {
  interface FastifyInstance {
    settings: SettingsService;
  }
}

function buildSettingsService(prisma: PrismaClient): SettingsService {
  return {
    async get(key) {
      const setting = await prisma.setting.findUnique({ where: { key } });
      return setting?.value ?? null;
    },
    async getNumber(key, fallback) {
      const value = await this.get(key);
      const parsed = value === null ? NaN : Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    },
    async getBoolean(key, fallback) {
      const value = await this.get(key);
      if (value === null) return fallback;
      return value === "true" || value === "1";
    },
    async getJson<T>(key: string, fallback: T): Promise<T> {
      const value = await this.get(key);
      if (value === null) return fallback;
      try {
        return JSON.parse(value) as T;
      } catch {
        return fallback;
      }
    },
  };
}

export const settingsPlugin = fp(
  async (fastify) => {
    fastify.decorate("settings", buildSettingsService(fastify.prisma));
  },
  { name: "settings", dependencies: ["prisma"] },
);
