import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
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

const T = ["Finance"];

export default async function financeRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const finance = createFinanceService(fastify);
  const manualExpenses = createManualExpenseService(fastify);

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
        summary: "Correct a manual expense through void + replacement",
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
