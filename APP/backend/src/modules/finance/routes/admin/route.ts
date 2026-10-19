import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { AppError } from "src/lib/errors/app-error";
import { ErrorCode } from "src/constants/error-codes";
import { UuidIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { requireAuth } from "src/lib/context/auth-context";
import { PERMISSIONS } from "src/constants/permissions";
import { createFinanceService } from "src/modules/finance/finance.service";
import { createManualExpenseService } from "src/modules/finance/manual-expense.service";
import {
  CorrectManualExpenseSchema,
  CreateManualExpenseSchema,
  FinanceAnalyticsSchema,
  FinancePeriodQuerySchema,
  FinanceSummarySchema,
  LedgerEntrySchema,
  LedgerListQuerySchema,
  ManualExpenseDetailSchema,
  OpenReceivableSchema,
  OpenReceivablesQuerySchema,
  VoidManualExpenseSchema,
} from "src/modules/finance/finance.schema";
import {
  FinanceStatementExportQuerySchema,
  resolveFinanceStatementBusinessToday,
} from "src/modules/finance/finance-statement-period";
import { createFinanceStatementService } from "src/modules/finance/finance-statement.service";
import {
  renderFinanceStatementPdf,
  statementPdfFilename,
} from "src/modules/finance/finance-statement-pdf.service";

const T = ["Finance"];

export default async function financeRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const finance = createFinanceService(fastify);
  const manualExpenses = createManualExpenseService(fastify);
  const statements = createFinanceStatementService(fastify.prisma);

  app.get(
    "/summary",
    {
      schema: {
        summary: "Finance summary KPIs",
        operationId: "getFinanceSummary",
        tags: T,
        permissions: [PERMISSIONS.FINANCE_READ],
        querystring: FinancePeriodQuerySchema,
        response: {
          200: dataResponse(FinanceSummarySchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await finance.summary(request.query) }),
  );

  app.get(
    "/analytics",
    {
      schema: {
        summary: "Finance analytics (trend and breakdowns)",
        operationId: "getFinanceAnalytics",
        tags: T,
        permissions: [PERMISSIONS.FINANCE_READ],
        querystring: FinancePeriodQuerySchema,
        response: {
          200: dataResponse(FinanceAnalyticsSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await finance.analytics(request.query) }),
  );

  app.get(
    "/ledger",
    {
      schema: {
        summary: "Financial ledger movements",
        operationId: "listFinanceLedger",
        tags: T,
        permissions: [PERMISSIONS.FINANCE_READ],
        querystring: LedgerListQuerySchema,
        response: {
          200: listResponse(LedgerEntrySchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => finance.ledger(request.query),
  );

  app.get(
    "/statements/business-today",
    {
      schema: {
        summary: "Current business calendar day for statement export UI",
        operationId: "getFinanceStatementBusinessToday",
        tags: T,
        permissions: [PERMISSIONS.FINANCE_READ],
        response: {
          200: dataResponse(
            z.object({
              businessDate: z.string(),
              displayAr: z.string(),
              displayEn: z.string(),
            }),
          ),
          ...commonErrorResponses,
        },
      },
    },
    async () => ({ data: resolveFinanceStatementBusinessToday() }),
  );

  app.get(
    "/statements/:companyCode/pdf",
    {
      schema: {
        summary: "Download company financial statement PDF",
        operationId: "downloadFinanceStatementPdf",
        tags: T,
        permissions: [PERMISSIONS.FINANCE_READ],
        params: z.object({
          companyCode: z.enum(["ELITE", "UNIQUE"]),
        }),
        querystring: FinanceStatementExportQuerySchema,
      },
    },
    async (request, reply) => {
      const snapshot = await statements.loadSnapshot(
        request.params.companyCode,
        request.query,
      );
      const buffer = await renderFinanceStatementPdf(snapshot);
      const names = statementPdfFilename(snapshot);
      return reply
        .header("Content-Type", "application/pdf")
        .header(
          "Content-Disposition",
          `attachment; filename="${names.asciiFilename}"; filename*=UTF-8''${encodeURIComponent(names.filename)}`,
        )
        .send(buffer);
    },
  );

  app.get(
    "/open-receivables",
    {
      schema: {
        summary: "Open customer receivables",
        operationId: "listFinanceOpenReceivables",
        tags: T,
        permissions: [PERMISSIONS.FINANCE_READ],
        querystring: OpenReceivablesQuerySchema,
        response: {
          200: listResponse(OpenReceivableSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => finance.openReceivables(request.query),
  );

  app.post(
    "/open-receivables/road-liabilities/:roadLiabilityId/cash-confirm",
    {
      schema: {
        summary: "Confirm external CASH/POS collection for an open road liability receivable",
        operationId: "confirmFinanceOpenReceivableRoadLiabilityCash",
        tags: T,
        permissions: [PERMISSIONS.FINANCE_READ, PERMISSIONS.VIOLATIONS_CHARGE],
        params: z.object({ roadLiabilityId: z.string().uuid() }),
        response: {
          200: dataResponse(z.object({ received: z.literal(true) })),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string" || !key.trim()) {
        throw new AppError({
          code: ErrorCode.VALIDATION_ERROR,
          message: "Idempotency-Key header is required",
        });
      }
      await finance.confirmOpenReceivableRoadLiabilityCash(
        request.params.roadLiabilityId,
        actor.id,
        key.trim(),
      );
      request.setAudit({
        action: "finance.open_receivable_road_liability_cash",
        entityType: "road_liability",
        entityId: request.params.roadLiabilityId,
      });
      return { data: { received: true as const } };
    },
  );

  app.post(
    "/expenses",
    {
      schema: {
        summary: "Create a manual expense",
        operationId: "createManualExpense",
        tags: T,
        permissions: [PERMISSIONS.FINANCE_MANAGE_EXPENSES],
        body: CreateManualExpenseSchema,
        response: {
          200: dataResponse(ManualExpenseDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({
      data: await manualExpenses.create(request.body, requireAuth(request)),
    }),
  );

  app.get(
    "/expenses/:id",
    {
      schema: {
        summary: "Get manual expense detail",
        operationId: "getManualExpense",
        tags: T,
        permissions: [PERMISSIONS.FINANCE_READ],
        params: UuidIdParam,
        response: {
          200: dataResponse(ManualExpenseDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await manualExpenses.get(request.params.id) }),
  );

  app.post(
    "/expenses/:id/void",
    {
      schema: {
        summary: "Void a manual expense",
        operationId: "voidManualExpense",
        tags: T,
        permissions: [PERMISSIONS.FINANCE_MANAGE_EXPENSES],
        params: UuidIdParam,
        body: VoidManualExpenseSchema,
        response: {
          200: dataResponse(ManualExpenseDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({
      data: await manualExpenses.void(
        request.params.id,
        request.body.voidReason,
        requireAuth(request),
      ),
    }),
  );

  app.post(
    "/expenses/:id/correct",
    {
      schema: {
        summary: "Correct a manual expense in place",
        operationId: "correctManualExpense",
        tags: T,
        permissions: [PERMISSIONS.FINANCE_MANAGE_EXPENSES],
        params: UuidIdParam,
        body: CorrectManualExpenseSchema,
        response: {
          200: dataResponse(ManualExpenseDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({
      data: await manualExpenses.correct(
        request.params.id,
        request.body,
        requireAuth(request),
      ),
    }),
  );
}
