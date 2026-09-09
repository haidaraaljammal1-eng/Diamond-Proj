import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createContractsService } from "src/modules/contracts/contracts.service";
import {
  CarInSchema,
  CarOutSchema,
  ConfirmPaymentSchema,
  ContractDetailSchema,
  ContractIdParam,
  ContractLinkIssuedSchema,
  ContractListItemSchema,
  CreateOfferSchema,
  ListContractsQuerySchema,
  ReconcileSchema,
  RenewSchema,
} from "src/modules/contracts/contracts.schema";
import { ContractTarsResponseSchema } from "src/modules/integrations/tars/tars.schema";
import { createTarsIntegrationService } from "src/modules/integrations/tars/tars.service";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { requireAuth } from "src/lib/context/auth-context";

const InspectionPhotoParam = ContractIdParam.extend({ photoId: z.string().uuid() });

export default async function contractsAdminRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const contracts = createContractsService(fastify);
  // Read-only integration state. Contracts business logic never calls TARS —
  // see DOCU/04-api-contracts/tars-integration.md.
  const tars = createTarsIntegrationService(fastify);

  app.get(
    "/",
    {
      schema: {
        summary: "List rental contracts",
        operationId: "listContracts",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_READ],
        querystring: ListContractsQuerySchema,
        response: { 200: listResponse(ContractListItemSchema), ...commonErrorResponses },
      },
    },
    async (request) => contracts.list(request.query),
  );

  app.get(
    "/:id",
    {
      schema: {
        summary: "Get a rental contract",
        operationId: "getContract",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_READ],
        params: ContractIdParam,
        response: { 200: dataResponse(ContractDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await contracts.get(request.params.id) }),
  );

  app.get(
    "/:id/tars",
    {
      schema: {
        summary: "Get TARS integration state for a contract",
        operationId: "getContractTarsState",
        tags: ["Contracts"],
        // Reading integration state is part of reading the contract — no
        // separate TARS permission is invented for a read-only projection.
        permissions: [PERMISSIONS.CONTRACTS_READ],
        params: ContractIdParam,
        response: { 200: dataResponse(ContractTarsResponseSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({
      data: { tars: await tars.getIntegrationState(request.params.id) },
    }),
  );

  app.post(
    "/offers",
    {
      schema: {
        summary: "Create a rental contract offer from a vehicle",
        operationId: "createContractOffer",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_MANAGE],
        body: CreateOfferSchema,
        response: { 201: dataResponse(ContractDetailSchema), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const actor = requireAuth(request);
      const contract = await contracts.createOffer(request.body, actor.id);
      request.setAudit({
        action: "contracts.create",
        entityType: "contract",
        entityId: contract.id,
      });
      reply.status(201);
      return { data: contract };
    },
  );

  app.post(
    "/:id/rental-link",
    {
      schema: {
        summary: "Generate a rental link for a contract offer",
        operationId: "generateContractRentalLink",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_MANAGE],
        params: ContractIdParam,
        response: { 200: dataResponse(ContractLinkIssuedSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const data = await contracts.generateLink(request.params.id, "RENTAL", actor.id);
      request.setAudit({
        action: "contracts.rental_link",
        entityType: "contract",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/payment/confirm",
    {
      schema: {
        summary: "Confirm payment and reserve the vehicle",
        operationId: "confirmContractPayment",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_MANAGE],
        params: ContractIdParam,
        body: ConfirmPaymentSchema,
        response: { 200: dataResponse(ContractDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await contracts.confirmPayment(
        request.params.id,
        request.body,
        actor.id,
        typeof key === "string" ? key : undefined,
      );
      request.setAudit({
        action: "contracts.payment_confirm",
        entityType: "contract",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/car-out",
    {
      schema: {
        summary: "Record Car-Out and activate the rental",
        operationId: "contractCarOut",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_CAR_OUT, PERMISSIONS.CONTRACTS_ACTIVATE],
        params: ContractIdParam,
        body: CarOutSchema,
        response: { 200: dataResponse(ContractDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await contracts.carOut(
        request.params.id,
        request.body,
        actor.id,
        typeof key === "string" ? key : undefined,
      );
      request.setAudit({
        action: "contracts.car_out",
        entityType: "contract",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/return-link",
    {
      schema: {
        summary: "Generate a return link and start RETOUT",
        operationId: "generateContractReturnLink",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_RETURN],
        params: ContractIdParam,
        response: { 200: dataResponse(ContractLinkIssuedSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const data = await contracts.generateLink(request.params.id, "RETURN", actor.id);
      request.setAudit({
        action: "contracts.return_link",
        entityType: "contract",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/car-in",
    {
      schema: {
        summary: "Record Car-In and move the contract to REVIEW",
        operationId: "contractCarIn",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_RETURN],
        params: ContractIdParam,
        body: CarInSchema,
        response: { 200: dataResponse(ContractDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await contracts.carInStaff(
        request.params.id,
        request.body,
        typeof key === "string" ? key : undefined,
      );
      request.setAudit({
        action: "contracts.car_in",
        entityType: "contract",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/reconcile",
    {
      schema: {
        summary: "Create or update contract reconciliation",
        operationId: "reconcileContract",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_RECONCILE],
        params: ContractIdParam,
        body: ReconcileSchema,
        response: { 200: dataResponse(ContractDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const data = await contracts.reconcile(request.params.id, request.body, actor.id);
      request.setAudit({
        action: "contracts.reconcile",
        entityType: "contract",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/close",
    {
      schema: {
        summary: "Close a reviewed contract and release the vehicle",
        operationId: "closeContract",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_CLOSE],
        params: ContractIdParam,
        response: { 200: dataResponse(ContractDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await contracts.close(
        request.params.id,
        actor.id,
        typeof key === "string" ? key : undefined,
      );
      request.setAudit({
        action: "contracts.close",
        entityType: "contract",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/renewal-link",
    {
      schema: {
        summary: "Generate a renewal link for an active contract",
        operationId: "generateContractRenewalLink",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_RENEW],
        params: ContractIdParam,
        body: RenewSchema,
        response: { 200: dataResponse(ContractLinkIssuedSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const data = await contracts.generateLink(
        request.params.id,
        "RENEWAL",
        actor.id,
        request.body,
      );
      request.setAudit({
        action: "contracts.renewal_link",
        entityType: "contract",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/renew",
    {
      schema: {
        summary: "Renew an active contract",
        operationId: "renewContract",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_RENEW],
        params: ContractIdParam,
        body: RenewSchema,
        response: { 200: dataResponse(ContractDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await contracts.renew(
        request.params.id,
        request.body,
        actor.id,
        typeof key === "string" ? key : undefined,
      );
      request.setAudit({
        action: "contracts.renew",
        entityType: "contract",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.get(
    "/:id/car-out/photos/:photoId/stream",
    {
      schema: {
        summary: "Stream a Car-Out inspection photo",
        operationId: "streamContractCarOutPhoto",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_READ],
        params: InspectionPhotoParam,
        response: { 200: z.any(), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const { attachment, stream } = await contracts.openInspectionStream(
        request.params.id,
        "out",
        request.params.photoId,
      );
      return reply.header("content-type", attachment.mimeType).send(stream);
    },
  );

  app.get(
    "/:id/car-in/photos/:photoId/stream",
    {
      schema: {
        summary: "Stream a Car-In inspection photo",
        operationId: "streamContractCarInPhoto",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_READ],
        params: InspectionPhotoParam,
        response: { 200: z.any(), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const { attachment, stream } = await contracts.openInspectionStream(
        request.params.id,
        "in",
        request.params.photoId,
      );
      return reply.header("content-type", attachment.mimeType).send(stream);
    },
  );
}
