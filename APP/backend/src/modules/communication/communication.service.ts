import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import type { CommunicationChannel, MessageTemplate } from "@prisma/client";
import type { z } from "zod";
import { env } from "src/config/env";
import { AppError } from "src/lib/errors/app-error";
import { isUniqueViolation } from "src/lib/db/prisma-error";
import { withTransaction } from "src/lib/db/transaction";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { paginate, parseSort } from "src/lib/http/pagination";
import { normalizeCode } from "src/lib/master-data/code";
import { sanitizeEmailHtml } from "src/modules/communication/template-security";
import { validateVariants, type VariantForValidation } from "src/modules/communication/template-validation";
import { buildRenderContext, renderVariant } from "src/modules/communication/template-render";
import { sampleContext, TEMPLATE_VARIABLES } from "src/modules/communication/variables";
import {
  invalidTemplateContentError,
  templateCodeConflict,
  templateDraftAlreadyExistsError,
  templateImmutableFieldError,
  templatePublishedImmutableError,
  templateStaleRevisionError,
} from "src/modules/communication/communication.errors";
import type {
  CreateTemplateSchema,
  ListTemplatesQuerySchema,
  ListTemplateVersionsQuerySchema,
  SaveTemplateContentBody,
  TemplatePreviewSchema,
  UpdateTemplateContentBody,
  UpdateTemplateSchema,
} from "src/modules/communication/communication.schema";

const TEMPLATE_SORTABLE = ["code", "name", "createdAt", "updatedAt", "isActive"] as const;

const VERSION_INCLUDE = {
  template: { select: { channel: true, currentVersionId: true } },
  variants: {
    orderBy: { language: "asc" },
    include: { buttons: { orderBy: { sortOrder: "asc" } } },
  },
} satisfies Prisma.MessageTemplateVersionInclude;

type VersionWithContent = Prisma.MessageTemplateVersionGetPayload<{ include: typeof VERSION_INCLUDE }>;
type VersionRow = Prisma.MessageTemplateVersionGetPayload<Record<string, never>>;

export function createCommunicationService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function loadTemplateOrThrow(id: number) {
    const t = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!t) throw AppError.notFound("Communication template not found");
    return t;
  }
  async function loadVersionOrThrow(id: number): Promise<VersionWithContent> {
    const v = await prisma.messageTemplateVersion.findFirst({
      where: { id },
      include: VERSION_INCLUDE,
    });
    if (!v) throw AppError.notFound("Template version not found");
    return v;
  }

  function toTemplatePublic(t: MessageTemplate) {
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      channel: t.channel,
      description: t.description,
      isActive: t.isActive,
      currentVersionId: t.currentVersionId,
      createdById: t.createdById,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
  function toVersionSummary(v: VersionRow, currentVersionId: number | null) {
    return {
      id: v.id,
      templateId: v.templateId,
      versionNumber: v.versionNumber,
      status: v.status,
      revision: v.revision,
      publishedAt: v.publishedAt,
      publishedById: v.publishedById,
      isCurrent: currentVersionId === v.id,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    };
  }
  function toVersionDetail(v: VersionWithContent) {
    return {
      ...toVersionSummary(v, v.template.currentVersionId),
      channel: v.template.channel,
      variants: v.variants.map((va) => ({
        id: va.id,
        language: va.language,
        subject: va.subject,
        bodyHtml: va.bodyHtml,
        bodyText: va.bodyText,
        providerTemplateName: va.providerTemplateName,
        providerLanguageCode: va.providerLanguageCode,
        buttons: va.buttons.map((b) => ({ id: b.id, label: b.label, urlTemplate: b.urlTemplate, sortOrder: b.sortOrder })),
      })),
    };
  }

  async function listTemplates(query: z.infer<typeof ListTemplatesQuerySchema>) {
    const where: Prisma.MessageTemplateWhereInput = {
      ...(query.channel ? { channel: query.channel } : {}),
      ...(query.active !== undefined ? { isActive: query.active } : {}),
      ...(query.search
        ? { OR: [{ code: { contains: query.search, mode: "insensitive" } }, { name: { contains: query.search, mode: "insensitive" } }] }
        : {}),
    };
    const { field, direction } = parseSort(query.sort, TEMPLATE_SORTABLE, { field: "createdAt", direction: "desc" });
    return paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.messageTemplate.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.messageTemplate.findMany({
          where,
          orderBy: { [field]: direction } as Prisma.MessageTemplateOrderByWithRelationInput,
          skip,
          take,
        });
        return rows.map(toTemplatePublic);
      },
    });
  }

  async function getTemplate(id: number) {
    return toTemplatePublic(await loadTemplateOrThrow(id));
  }

  async function createTemplate(input: z.infer<typeof CreateTemplateSchema>, userId: number) {
    const code = normalizeCode(input.code);
    try {
      return await withTransaction(prisma, async (tx) => {
        const template = await tx.messageTemplate.create({
          data: { code, name: input.name, channel: input.channel, description: input.description ?? null, createdById: userId },
        });
        await tx.messageTemplateVersion.create({
          data: { templateId: template.id, versionNumber: 1, status: "DRAFT" },
        });
        return toTemplatePublic(template);
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw templateCodeConflict();
      throw err;
    }
  }

  async function updateTemplate(id: number, input: z.infer<typeof UpdateTemplateSchema>) {
    const t = await loadTemplateOrThrow(id);
    if (input.code !== undefined && normalizeCode(input.code) !== t.code) {
      throw templateImmutableFieldError("code");
    }
    const data: Prisma.MessageTemplateUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    return toTemplatePublic(await prisma.messageTemplate.update({ where: { id }, data }));
  }

  // Delete a template only when nothing references it: no campaign step uses any of
  // its versions and no delivery was ever sent from one. Those FKs are nullable
  // (SetNull), so the DB wouldn't stop us — the rule is enforced here so a linked
  // template is never silently unhooked. Unreferenced → delete versions (which
  // cascades variants + buttons) then the template, in one transaction.
  async function deleteTemplate(id: number) {
    await loadTemplateOrThrow(id);
    await withTransaction(prisma, async (tx) => {
      // Detach the current-version pointer first (self-referential unique FK), then
      // drop the versions (variants + buttons cascade), then the template itself.
      await tx.messageTemplate.update({ where: { id }, data: { currentVersionId: null } });
      await tx.messageTemplateVersion.deleteMany({ where: { templateId: id } });
      await tx.messageTemplate.delete({ where: { id } });
    });
  }

  async function listVersions(templateId: number, query: z.infer<typeof ListTemplateVersionsQuerySchema>) {
    const template = await loadTemplateOrThrow(templateId);
    const where: Prisma.MessageTemplateVersionWhereInput = {
      templateId,
      ...(query.status ? { status: query.status } : {}),
    };
    return paginate({
      page: query.page,
      pageSize: query.pageSize,
      count: () => prisma.messageTemplateVersion.count({ where }),
      findMany: async (skip, take) => {
        const rows = await prisma.messageTemplateVersion.findMany({ where, orderBy: { versionNumber: "desc" }, skip, take });
        return rows.map((v) => toVersionSummary(v, template.currentVersionId));
      },
    });
  }

  async function getVersion(id: number) {
    return toVersionDetail(await loadVersionOrThrow(id));
  }

  async function createDraft(templateId: number) {
    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, "message_template", templateId);
      const template = await tx.messageTemplate.findFirst({ where: { id: templateId } });
      if (!template) throw AppError.notFound("Communication template not found");
      const existingDraft = await tx.messageTemplateVersion.findFirst({ where: { templateId, status: "DRAFT" }, select: { id: true } });
      if (existingDraft) throw templateDraftAlreadyExistsError(existingDraft.id);
      if (!template.currentVersionId) throw AppError.notFound("No published version to base a new draft on");
      const source = await tx.messageTemplateVersion.findUnique({ where: { id: template.currentVersionId }, include: VERSION_INCLUDE });
      if (!source) throw AppError.notFound("Template version not found");
      const max = await tx.messageTemplateVersion.aggregate({ where: { templateId }, _max: { versionNumber: true } });
      const draft = await tx.messageTemplateVersion.create({
        data: {
          templateId,
          versionNumber: (max._max.versionNumber ?? 0) + 1,
          status: "DRAFT",
          variants: {
            create: source.variants.map((va) => ({
              language: va.language,
              subject: va.subject,
              bodyHtml: va.bodyHtml,
              bodyText: va.bodyText,
              providerTemplateName: va.providerTemplateName,
              providerLanguageCode: va.providerLanguageCode,
              buttons: { create: va.buttons.map((b, i) => ({ label: b.label, urlTemplate: b.urlTemplate, sortOrder: i })) },
            })),
          },
        },
        include: VERSION_INCLUDE,
      });
      return toVersionDetail(draft);
    });
  }

  /** Normalize + sanitize a request body's variants for validation/persistence. */
  function normalizeVariants(
    channel: CommunicationChannel,
    body: { variants: UpdateTemplateContentBody["variants"] },
  ): VariantForValidation[] {
    return body.variants.map((v) => ({
      language: v.language,
      subject: v.subject ?? null,
      // HTML only survives on EMAIL, and is always sanitized server-side.
      bodyHtml: channel === "EMAIL" && v.bodyHtml ? sanitizeEmailHtml(v.bodyHtml) : null,
      bodyText: v.bodyText ?? null,
      buttons: (channel === "SMS" ? [] : (v.buttons ?? [])).map((b) => ({ label: b.label, urlTemplate: b.urlTemplate })),
    }));
  }

  async function updateContent(id: number, body: UpdateTemplateContentBody) {
    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, "message_template_version", id);
      const version = await tx.messageTemplateVersion.findFirst({ where: { id }, include: { template: { select: { channel: true } } } });
      if (!version) throw AppError.notFound("Template version not found");
      if (version.status !== "DRAFT") throw templatePublishedImmutableError(version.status);
      if (body.revision !== version.revision) throw templateStaleRevisionError(body.revision, version.revision);

      const channel = version.template.channel;
      const normalized = normalizeVariants(channel, body);
      const issues = validateVariants(channel, normalized, { requireComplete: false });
      if (issues.length > 0) throw invalidTemplateContentError(issues);

      // Full replace of variants (cascades buttons), then recreate.
      await tx.templateVariant.deleteMany({ where: { versionId: id } });
      const rawByLang = new Map(body.variants.map((v) => [v.language as string, v]));
      const updated = await tx.messageTemplateVersion.update({
        where: { id },
        data: {
          revision: { increment: 1 },
          variants: {
            create: normalized.map((v) => {
              const raw = rawByLang.get(v.language);
              return {
                language: v.language,
                subject: v.subject,
                bodyHtml: v.bodyHtml,
                bodyText: v.bodyText,
                providerTemplateName: raw?.providerTemplateName ?? null,
                providerLanguageCode: raw?.providerLanguageCode ?? null,
                buttons: { create: v.buttons.map((b, i) => ({ label: b.label, urlTemplate: b.urlTemplate, sortOrder: i })) },
              };
            }),
          },
        },
        include: VERSION_INCLUDE,
      });
      return toVersionDetail(updated);
    });
  }

  function variantsForValidation(v: VersionWithContent): VariantForValidation[] {
    return v.variants.map((va) => ({
      language: va.language,
      subject: va.subject,
      bodyHtml: va.bodyHtml,
      bodyText: va.bodyText,
      buttons: va.buttons.map((b) => ({ label: b.label, urlTemplate: b.urlTemplate })),
    }));
  }

  async function validateVersion(id: number) {
    const version = await loadVersionOrThrow(id);
    const issues = validateVariants(version.template.channel, variantsForValidation(version), { requireComplete: true });
    return { valid: issues.length === 0, issues };
  }

  async function publish(id: number, userId: number) {
    return withTransaction(prisma, async (tx) => {
      const base = await tx.messageTemplateVersion.findFirst({ where: { id }, select: { templateId: true } });
      if (!base) throw AppError.notFound("Template version not found");
      await acquireAdvisoryLock(tx, "message_template", base.templateId);
      const version = await tx.messageTemplateVersion.findUnique({ where: { id }, include: VERSION_INCLUDE });
      if (!version) throw AppError.notFound("Template version not found");
      if (version.status !== "DRAFT") throw templatePublishedImmutableError(version.status);

      const issues = validateVariants(version.template.channel, variantsForValidation(version), { requireComplete: true });
      if (issues.length > 0) throw invalidTemplateContentError(issues);

      const template = await tx.messageTemplate.findUnique({ where: { id: version.templateId }, select: { currentVersionId: true } });
      if (template?.currentVersionId && template.currentVersionId !== id) {
        await tx.messageTemplateVersion.update({ where: { id: template.currentVersionId }, data: { status: "SUPERSEDED" } });
      }
      const published = await tx.messageTemplateVersion.update({
        where: { id },
        data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: userId, revision: { increment: 1 } },
      });
      await tx.messageTemplate.update({ where: { id: version.templateId }, data: { currentVersionId: id } });
      return toVersionSummary(published, id);
    });
  }

  function mapVariants(variants: VersionWithContent["variants"]) {
    return variants.map((va) => ({
      id: va.id,
      language: va.language,
      subject: va.subject,
      bodyHtml: va.bodyHtml,
      bodyText: va.bodyText,
      providerTemplateName: va.providerTemplateName,
      providerLanguageCode: va.providerLanguageCode,
      buttons: va.buttons.map((b) => ({ id: b.id, label: b.label, urlTemplate: b.urlTemplate, sortOrder: b.sortOrder })),
    }));
  }

  /** The collapsed edit screen's single load: the template + its LIVE editable
   *  content (the published current version, or a lingering/initial draft when the
   *  template was never published). Versioning is never surfaced to the caller. */
  async function getTemplateContent(id: number) {
    const template = await loadTemplateOrThrow(id);
    const versionId =
      template.currentVersionId ??
      (
        await prisma.messageTemplateVersion.findFirst({
          where: { templateId: id, status: "DRAFT" },
          orderBy: { versionNumber: "desc" },
          select: { id: true },
        })
      )?.id ??
      null;
    const variants = versionId ? mapVariants((await loadVersionOrThrow(versionId)).variants) : [];
    return { ...toTemplatePublic(template), variants };
  }

  /** Save the template's content in ONE call, hiding versioning entirely. Reuses a
   *  lingering draft (or opens a fresh version), replaces its content, then
   *  publishes it — superseding the previous published version. That old version
   *  stays immutable, so any message ALREADY SENT from it keeps its exact
   *  historical content while new campaigns pick up the new content. */
  async function saveTemplateContent(id: number, body: SaveTemplateContentBody, userId: number) {
    return withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, "message_template", id);
      const template = await tx.messageTemplate.findFirst({
        where: { id },
        select: { id: true, channel: true, currentVersionId: true },
      });
      if (!template) throw AppError.notFound("Communication template not found");
      const channel = template.channel;

      // 1. Resolve the working DRAFT — reuse a lingering one, else open a fresh
      //    version. The published current is never edited in place → immutable.
      const existingDraft = await tx.messageTemplateVersion.findFirst({
        where: { templateId: id, status: "DRAFT" },
        select: { id: true },
      });
      let draftId = existingDraft?.id;
      if (!draftId) {
        const max = await tx.messageTemplateVersion.aggregate({ where: { templateId: id }, _max: { versionNumber: true } });
        const created = await tx.messageTemplateVersion.create({
          data: { templateId: id, versionNumber: (max._max.versionNumber ?? 0) + 1, status: "DRAFT" },
          select: { id: true },
        });
        draftId = created.id;
      }

      // 2. Validate (complete — it goes live immediately) + full-replace variants.
      const normalized = normalizeVariants(channel, body);
      const issues = validateVariants(channel, normalized, { requireComplete: true });
      if (issues.length > 0) throw invalidTemplateContentError(issues);
      await tx.templateVariant.deleteMany({ where: { versionId: draftId } });
      const rawByLang = new Map(body.variants.map((v) => [v.language as string, v]));
      await tx.messageTemplateVersion.update({
        where: { id: draftId },
        data: {
          revision: { increment: 1 },
          variants: {
            create: normalized.map((v) => {
              const raw = rawByLang.get(v.language);
              return {
                language: v.language,
                subject: v.subject,
                bodyHtml: v.bodyHtml,
                bodyText: v.bodyText,
                providerTemplateName: raw?.providerTemplateName ?? null,
                providerLanguageCode: raw?.providerLanguageCode ?? null,
                buttons: { create: v.buttons.map((b, i) => ({ label: b.label, urlTemplate: b.urlTemplate, sortOrder: i })) },
              };
            }),
          },
        },
      });

      // 3. Publish: supersede the previous current, then point the template here.
      if (template.currentVersionId && template.currentVersionId !== draftId) {
        await tx.messageTemplateVersion.update({
          where: { id: template.currentVersionId },
          data: { status: "SUPERSEDED" },
        });
      }
      await tx.messageTemplateVersion.update({
        where: { id: draftId },
        data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: userId },
      });
      await tx.messageTemplate.update({ where: { id }, data: { currentVersionId: draftId } });

      // 4. Return the template + its now-live content.
      const saved = await tx.messageTemplate.findUniqueOrThrow({ where: { id } });
      const version = await tx.messageTemplateVersion.findUniqueOrThrow({ where: { id: draftId }, include: VERSION_INCLUDE });
      return { ...toTemplatePublic(saved), variants: mapVariants(version.variants) };
    });
  }

  async function preview(body: z.infer<typeof TemplatePreviewSchema>) {
    const version = await loadVersionOrThrow(body.templateVersionId);
    const channel = version.template.channel;
    const language = body.language ?? version.variants[0]?.language ?? "en";
    const variant = version.variants.find((v) => v.language === language) ?? version.variants[0];
    if (!variant) throw AppError.validation("Template version has no content to preview");

    let ctx: Record<string, string>;
    let usedSampleData = true;
    const sampleLink = `${env.FRONTEND_URL}/s/PREVIEW`;
    if (body.purchaseExperienceId) {
      const exp = await prisma.purchaseExperience.findUnique({
        where: { id: body.purchaseExperienceId },
        include: {
          customer: true,
          vehicle: { include: { model: true } },
          branch: true,
          salesperson: true,
        },
      });
      if (!exp) throw AppError.notFound("Purchase experience not found");
      usedSampleData = false;
      ctx = buildRenderContext({
        customerName: exp.customer.name,
        customerExternalId: exp.customer.externalId,
        vehicleModel: exp.vehicle.model.name,
        vehicleYear: exp.vehicle.modelYear,
        vehicleVin: exp.vehicle.vin,
        branchName: exp.branch.name,
        salespersonName: exp.salesperson?.name ?? null,
        purchaseDate: exp.purchaseDate,
        deliveryDate: exp.deliveryDate,
        externalSaleId: exp.externalSaleId,
        linkTitle: "Your request",
        actionLink: sampleLink,
      });
    } else {
      ctx = { ...sampleContext(), action_link: sampleLink };
    }

    const rendered = renderVariant(channel, variant, ctx, { lang: variant.language });
    return {
      channel,
      language: variant.language,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      buttons: rendered.buttons,
      usedSampleData,
    };
  }

  function listVariables() {
    return TEMPLATE_VARIABLES.map((v) => ({ ...v, channels: [...v.channels] }));
  }

  return {
    listTemplates,
    getTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    listVersions,
    getVersion,
    createDraft,
    updateContent,
    validateVersion,
    publish,
    getTemplateContent,
    saveTemplateContent,
    preview,
    listVariables,
  };
}
