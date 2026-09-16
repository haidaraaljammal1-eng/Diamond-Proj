import type { FastifyInstance } from "fastify";
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

const T = ["Road Liabilities"];

export default async function roadLiabilityRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = createRoadLiabilityService(fastify);
  const charges = createRoadLiabilityCustomerChargeService(fastify);
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
}
