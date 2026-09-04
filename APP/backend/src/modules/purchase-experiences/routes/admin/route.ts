import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createPurchaseExperiencesService } from "src/modules/purchase-experiences/purchase-experiences.service";
import {
  CreatePurchaseExperienceSchema,
  ListPurchaseExperiencesQuerySchema,
  PurchaseExperienceEnrichedSchema,
  PurchaseExperiencePublicSchema,
  UpdatePurchaseExperienceSchema,
} from "src/modules/purchase-experiences/purchase-experiences.schema";
import { NumericIdParam } from "src/lib/http/common-schemas";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { requireAuth, hasPermission } from "src/lib/context/auth-context";
import { AppError } from "src/lib/errors/app-error";

export default async function purchaseExperiencesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const experiences = createPurchaseExperiencesService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List purchase/delivery experiences",
        operationId: "listPurchaseExperiences",
        tags: ["Purchase Experiences"],
        permissions: [PERMISSIONS.PURCHASE_EXPERIENCES_READ],
        querystring: ListPurchaseExperiencesQuerySchema,
        response: {
          200: listResponse(PurchaseExperienceEnrichedSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => experiences.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a purchase/delivery experience",
        operationId: "getPurchaseExperience",
        tags: ["Purchase Experiences"],
        permissions: [PERMISSIONS.PURCHASE_EXPERIENCES_READ],
        params: NumericIdParam,
        response: {
          200: dataResponse(PurchaseExperienceEnrichedSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => ({ data: await experiences.get(request.params.id) }),
  );

  app.post(
    "/",
    {
      schema: {
        summary: "Create a purchase/delivery experience",
        operationId: "createPurchaseExperience",
        tags: ["Purchase Experiences"],
        permissions: [PERMISSIONS.PURCHASE_EXPERIENCES_MANAGE],
        body: CreatePurchaseExperienceSchema,
        response: {
          201: dataResponse(PurchaseExperiencePublicSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      // Inline vehicle creation is a vehicles.manage capability. The route gate only
      // asserts purchase_experiences.manage, so require the second permission here.
      if (request.body.vehicle) {
        const user = requireAuth(request);
        if (!hasPermission(user, PERMISSIONS.VEHICLES_MANAGE)) {
          throw AppError.forbidden(
            "Creating a vehicle inline requires the vehicles.manage permission",
          );
        }
      }
      const experience = await experiences.create(request.body);
      request.setAudit({
        action: "purchase_experiences.create",
        entityType: "purchase_experience",
        entityId: String(experience.id),
      });
      reply.status(201);
      return { data: experience };
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        summary: "Update a purchase/delivery experience",
        operationId: "updatePurchaseExperience",
        tags: ["Purchase Experiences"],
        permissions: [PERMISSIONS.PURCHASE_EXPERIENCES_MANAGE],
        params: NumericIdParam,
        body: UpdatePurchaseExperienceSchema,
        response: {
          200: dataResponse(PurchaseExperiencePublicSchema),
          ...commonErrorResponses,
        },
      },
    },
    async (request) => {
      const experience = await experiences.update(request.params.id, request.body);
      request.setAudit({
        action: "purchase_experiences.update",
        entityType: "purchase_experience",
        entityId: String(request.params.id),
      });
      return { data: experience };
    },
  );
}
