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
