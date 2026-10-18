import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { UuidIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { requireAuth } from "src/lib/context/auth-context";
import { registerGpsAcceptedPositionObserver } from "src/modules/gps/gps.observers";
import { createRoadLiabilityService } from "src/modules/road-liabilities/road-liability.service";
import { createSalikCrossingInferenceService } from "src/modules/road-liabilities/inference/salik-crossing-inference.service";
import {
  ListRoadLiabilitiesQuerySchema,
  RoadLiabilityCustomerChargeReviewSchema,
  RoadLiabilityDetailSchema,
  RoadLiabilityListItemSchema,
  RoadLiabilitySummarySchema,
} from "src/modules/road-liabilities/road-liability.schema";
import { ConfirmRoadLiabilityChargeSchema } from "src/modules/contracts/contracts.schema";
import { createRoadLiabilityCustomerChargeService } from "src/modules/road-liabilities/road-liability-customer-charge.service";
import { createRoadLiabilityCollectionService } from "src/modules/road-liabilities/road-liability-collection.service";
import { createStaffManualChargeService } from "src/modules/road-liabilities/staff-manual-charge.service";
import { listReturnedContracts } from "src/modules/road-liabilities/staff-returned-contracts.service";
import {
  ReturnedContractListItemSchema,
  ReturnedContractsQuerySchema,
  StaffManualChargeInputSchema,
  StaffManualChargeResultSchema,
} from "src/modules/road-liabilities/staff-manual-charge.schema";
import {
  ManualCollectionConfirmInputSchema,
  OffSessionCollectionInputSchema,
  OffSessionCollectionResultSchema,
  RoadLiabilityCollectionViewSchema,
} from "src/modules/road-liabilities/road-liability-collection.schema";

const T = ["Road Liabilities"];

export default async function roadLiabilityRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = createRoadLiabilityService(fastify);
  const charges = createRoadLiabilityCustomerChargeService(fastify);
  const collection = createRoadLiabilityCollectionService(fastify);
  const staffCharges = createStaffManualChargeService(fastify);
  const inference = createSalikCrossingInferenceService(fastify);
  const unregister = registerGpsAcceptedPositionObserver({
    onAcceptedPosition: (event) => inference.handleAcceptedPosition(event),
  });
  fastify.addHook("onClose", async () => {
    unregister();
  });

  app.get(
    "/summary",
    {
      schema: {
        summary: "Road liabilities KPI summary",
        operationId: "getRoadLiabilitiesSummary",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_READ],
        response: {
          200: dataResponse(RoadLiabilitySummarySchema),
          ...commonErrorResponses,
        },
      },
    },
    async () => ({ data: await service.summary() }),
  );

  app.get(
    "/",
    {
      schema: {
        summary: "List road liabilities",
        operationId: "listRoadLiabilities",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_READ],
        querystring: ListRoadLiabilitiesQuerySchema,
        response: {
          200: listResponse(RoadLiabilityListItemSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => service.list(request.query),
  );

  app.get(
    "/returned-contracts",
    {
      schema: {
        summary:
          "Active rentals and returned contracts within the post-Car-In collection window",
        operationId: "listReturnedContractsForRoadCharges",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_READ],
        querystring: ReturnedContractsQuerySchema,
        response: {
          200: listResponse(ReturnedContractListItemSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const q = request.query;
      const data = await listReturnedContracts(fastify.prisma, {
        page: q.page,
        pageSize: q.pageSize,
        companyId: q.companyId,
        search: q.search,
      });
      return { data: data.items, meta: data.meta };
    },
  );

  const ContractIdPathParam = z.object({ contractId: z.string().uuid() });

  app.post(
    "/returned-contracts/:contractId/manual-charge",
    {
      schema: {
        summary: "Create a staff manual road liability and collect off-session",
        operationId: "staffManualChargeReturnedContract",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_CHARGE],
        params: ContractIdPathParam,
        body: StaffManualChargeInputSchema,
        response: {
          200: dataResponse(StaffManualChargeResultSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      if (typeof key !== "string" || !key.trim()) {
        const { AppError } = await import("src/lib/errors/app-error");
        const { ErrorCode } = await import("src/constants/error-codes");
        throw new AppError({
          code: ErrorCode.VALIDATION_ERROR,
          message: "Idempotency-Key header is required",
        });
      }
      const data = await staffCharges.manualChargeAndCollect(
        request.params.contractId,
        request.body,
        actor.id,
        key.trim(),
      );
      request.setAudit({
        action: "road_liabilities.staff_manual_charge",
        entityType: "contract",
        entityId: request.params.contractId,
      });
      return { data };
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a road liability with provenance",
        operationId: "getRoadLiability",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_READ],
        params: UuidIdParam,
        response: {
          200: dataResponse(RoadLiabilityDetailSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await service.get(request.params.id) }),
  );

  app.get(
    "/:id/customer-charge",
    {
      schema: {
        summary: "Customer charge review for a road liability",
        operationId: "getRoadLiabilityCustomerCharge",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_READ],
        params: UuidIdParam,
        response: {
          200: dataResponse(RoadLiabilityCustomerChargeReviewSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await charges.getReview(request.params.id) }),
  );

  app.post(
    "/:id/customer-charge/confirm",
    {
      schema: {
        summary: "Confirm the customer charge for a road liability",
        operationId: "confirmRoadLiabilityCustomerCharge",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_CHARGE],
        params: UuidIdParam,
        body: ConfirmRoadLiabilityChargeSchema,
        response: {
          200: dataResponse(RoadLiabilityCustomerChargeReviewSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await charges.confirmWithIdempotency(
        request.params.id,
        request.body,
        actor.id,
        typeof key === "string" ? key : undefined,
      );
      request.setAudit({
        action: "road_liabilities.confirm_customer_charge",
        entityType: "road_liability",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.get(
    "/:id/collection",
    {
      schema: {
        summary: "Road liability collection capability and state",
        operationId: "getRoadLiabilityCollection",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_READ],
        params: UuidIdParam,
        response: {
          200: dataResponse(RoadLiabilityCollectionViewSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await collection.getCollection(request.params.id) }),
  );

  app.post(
    "/:id/collection/off-session",
    {
      schema: {
        summary: "Collect a road liability from the saved card off-session",
        operationId: "collectRoadLiabilityOffSession",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_CHARGE],
        params: UuidIdParam,
        body: OffSessionCollectionInputSchema,
        response: {
          200: dataResponse(OffSessionCollectionResultSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await collection.collectOffSession(
        request.params.id,
        request.body,
        actor.id,
        typeof key === "string" ? key : undefined,
      );
      request.setAudit({
        action: "road_liabilities.collect_off_session",
        entityType: "road_liability",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/collection/payment-link",
    {
      schema: {
        summary: "Generate a hosted checkout payment link for a road liability",
        operationId: "createRoadLiabilityPaymentLink",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_CHARGE],
        params: UuidIdParam,
        response: {
          200: dataResponse(
            z.object({
              checkoutUrl: z.string().url().nullable(),
              paymentId: z.string(),
            }),
          ),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await collection.createPaymentLink(
        request.params.id,
        actor.id,
        typeof key === "string" ? key : undefined,
      );
      request.setAudit({
        action: "road_liabilities.create_payment_link",
        entityType: "road_liability",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/collection/manual",
    {
      schema: {
        summary: "Move road liability collection to manual pending receipt",
        operationId: "startRoadLiabilityManualCollection",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_CHARGE],
        params: UuidIdParam,
        response: {
          200: dataResponse(RoadLiabilityCollectionViewSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const data = await collection.startManualCollection(request.params.id, actor.id);
      request.setAudit({
        action: "road_liabilities.manual_collection_start",
        entityType: "road_liability",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/collection/cash/confirm",
    {
      schema: {
        summary: "Confirm cash receipt for a road liability on a cash rental contract",
        operationId: "confirmRoadLiabilityCashCollection",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_CHARGE],
        params: UuidIdParam,
        response: {
          200: dataResponse(RoadLiabilityCollectionViewSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await collection.confirmCashCollection(
        request.params.id,
        actor.id,
        typeof key === "string" ? key : undefined,
      );
      request.setAudit({
        action: "road_liabilities.cash_collection_confirm",
        entityType: "road_liability",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/collection/manual/confirm",
    {
      schema: {
        summary: "Confirm manual receipt for a road liability",
        operationId: "confirmRoadLiabilityManualCollection",
        tags: T,
        permissions: [PERMISSIONS.VIOLATIONS_CHARGE],
        params: UuidIdParam,
        body: ManualCollectionConfirmInputSchema,
        response: {
          200: dataResponse(RoadLiabilityCollectionViewSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const data = await collection.confirmManualCollection(
        request.params.id,
        request.body,
        actor.id,
      );
      request.setAudit({
        action: "road_liabilities.manual_collection_confirm",
        entityType: "road_liability",
        entityId: request.params.id,
      });
      return { data };
    },
  );
}
