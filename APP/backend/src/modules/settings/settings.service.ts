import type { FastifyInstance } from "fastify";
import type { Setting } from "@prisma/client";
import { AppError } from "src/lib/errors/app-error";
import type { z } from "zod";
import type { UpsertSettingSchema } from "src/modules/settings/settings.schema";

/** Secret values are masked even for authorized admins reading them back. */
function toSettingView(setting: Setting) {
  return {
    key: setting.key,
    value: setting.isSecret ? "[SECRET]" : setting.value,
    type: setting.type,
    scope: setting.scope,
    isPublic: setting.isPublic,
    isSecret: setting.isSecret,
    description: setting.description,
    updatedAt: setting.updatedAt,
  };
}

export function createSettingsService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function list() {
    const settings = await prisma.setting.findMany({ orderBy: { key: "asc" } });
    return settings.map(toSettingView);
  }

  async function get(key: string) {
    const setting = await prisma.setting.findUnique({ where: { key } });
    if (!setting) throw AppError.notFound("Setting not found");
    return toSettingView(setting);
  }

  async function upsert(key: string, input: z.infer<typeof UpsertSettingSchema>) {
    const setting = await prisma.setting.upsert({
      where: { key },
      update: {
        value: input.value,
        ...(input.type ? { type: input.type } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
        ...(input.isSecret !== undefined ? { isSecret: input.isSecret } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      create: {
        key,
        value: input.value,
        type: input.type ?? "STRING",
        scope: input.scope,
        isPublic: input.isPublic ?? false,
        isSecret: input.isSecret ?? false,
        description: input.description,
      },
    });
    return toSettingView(setting);
  }

  async function listPublic() {
    const settings = await prisma.setting.findMany({
      where: { isPublic: true, isSecret: false },
      orderBy: { key: "asc" },
      select: { key: true, value: true, type: true },
    });
    return settings;
  }

  return { list, get, upsert, listPublic };
}
