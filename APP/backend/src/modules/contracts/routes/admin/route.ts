import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createContractsService } from "src/modules/contracts/contracts.service";
import {
  CarInDraftPatchSchema,
  CarInPhotoQuerySchema,
  CarInHandoverSchema,
  CarOutSchema,
  CarOutDraftPatchSchema,
  CarOutPhotoQuerySchema,
  CarOutHandoverSchema,
  ConfirmPaymentSchema,
  ConfirmRoadLiabilityChargeParam,
  ConfirmRoadLiabilityChargeSchema,
  ContractDetailSchema,
  ContractIdParam,
  ContractLinkIssuedSchema,
  ContractListItemSchema,
  CreateOfferSchema,
  OfficialContractStaffTermsSchema,
  OfficialContractViewSchema,
  OFFICIAL_SIGNATURE_SLOT_PATHS,
  ListContractsQuerySchema,
  PaymentCheckoutSchema,
  ReconcileSchema,
  ReconciliationRoadLiabilitiesSchema,
  RenewSchema,
} from "src/modules/contracts/contracts.schema";
import { ContractTarsResponseSchema } from "src/modules/integrations/tars/tars.schema";
import { createTarsWorkflowOrchestrator } from "src/modules/integrations/tars/tars-workflow.orchestrator";
import { commonErrorResponses, dataResponse, listResponse } from "src/lib/http/response";
import { PERMISSIONS } from "src/constants/permissions";
import { requireAuth } from "src/lib/context/auth-context";
import { AppError } from "src/lib/errors/app-error";

const InspectionPhotoParam = ContractIdParam.extend({ photoId: z.string().uuid() });
const PostCloseReceivableParam = ContractIdParam.extend({ receivableId: z.string().uuid() });
const OfficialSignatureStaffParam = ContractIdParam.extend({ slot: z.enum(["hirer", "additional-driver", "sponsor"]) });

export default async function contractsAdminRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const contracts = createContractsService(fastify);
  // Read-only integration state. Contracts business logic never calls TARS —
  // see DOCU/04-api-contracts/tars-integration.md.
  const tars = createTarsWorkflowOrchestrator(fastify);

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

  app.patch(
    "/:id/official-contract/terms",
    {
      schema: {
        summary: "Set staff-owned official contract terms",
        description:
          "Plate Code, contract-visible Notes, included km per day, extra-km rate (before signing) and Vehicle IN damage marks. Customers see these read-only.",
        operationId: "updateOfficialContractTerms",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_MANAGE],
        params: ContractIdParam,
        body: OfficialContractStaffTermsSchema,
        response: { 200: dataResponse(OfficialContractViewSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      requireAuth(request);
      const result = await contracts.updateOfficialContractTerms(request.params.id, request.body);
      request.setAudit({
        action: "contracts.official_contract_terms",
        entityType: "contract",
        entityId: request.params.id,
        metadata: { fields: result.fields },
      });
      return { data: result.view };
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
        summary: "[Deprecated] Manual payment confirmation is disabled in V1",
        description:
          "Stripe is the only supported V1 customer payment method. This route always returns MANUAL_PAYMENT_DISABLED.",
        operationId: "confirmContractPayment",
        tags: ["Contracts"],
        deprecated: true,
        hide: true,
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

  app.get(
    "/:id/official-contract/signatures/:slot/stream",
    {
      schema: {
        summary: "Stream a signed official contract signature to staff",
        operationId: "streamStaffOfficialContractSignature",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_READ],
        params: OfficialSignatureStaffParam,
        response: { 200: z.any(), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      requireAuth(request);
      const slot = OFFICIAL_SIGNATURE_SLOT_PATHS[request.params.slot];
      const { mimeType, stream } = await contracts.openStaffOfficialSignature(request.params.id, slot);
      return reply.header("content-type", mimeType).header("cache-control", "private, no-store").send(stream);
    },
  );

  app.get(
    "/:id/car-out",
    {
      schema: {
        summary: "Read Contract Car-Out preparation and completed handover",
        operationId: "getContractCarOut",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_READ],
        params: ContractIdParam,
        response: { 200: dataResponse(CarOutHandoverSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: (await contracts.get(request.params.id)).carOutHandover }),
  );

  app.patch(
    "/:id/car-out",
    {
      schema: {
        summary: "Save PAID Contract Car-Out draft without handover",
        operationId: "saveContractCarOutDraft",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_CAR_OUT],
        params: ContractIdParam, body: CarOutDraftPatchSchema,
        response: { 200: dataResponse(CarOutHandoverSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      requireAuth(request);
      const data = await contracts.saveCarOutDraft(request.params.id, request.body);
      request.setAudit({ action: "contracts.car_out_draft", entityType: "contract", entityId: request.params.id });
      return { data };
    },
  );

  app.post(
    "/:id/car-out/photos",
    {
      schema: {
        summary: "Upload or replace one PAID Contract OUT photo slot",
        operationId: "uploadContractCarOutPhoto",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_CAR_OUT],
        params: ContractIdParam, querystring: CarOutPhotoQuerySchema,
        consumes: ["multipart/form-data"],
        response: { 200: dataResponse(CarOutHandoverSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const file = await request.file();
      if (!file) throw AppError.validation("OUT photo is required");
      const data = await contracts.uploadCarOutPhoto(request.params.id, request.query.angle, file, requireAuth(request).id);
      request.setAudit({ action: "contracts.car_out_photo", entityType: "contract", entityId: request.params.id });
      return { data };
    },
  );

  app.delete(
    "/:id/car-out/photos/:photoId",
    {
      schema: {
        summary: "Delete one draft OUT photo slot",
        operationId: "deleteContractCarOutPhoto",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_CAR_OUT],
        params: InspectionPhotoParam,
        response: { 200: dataResponse(CarOutHandoverSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      requireAuth(request);
      const data = await contracts.deleteCarOutPhoto(request.params.id, request.params.photoId);
      request.setAudit({ action: "contracts.car_out_photo_delete", entityType: "contract", entityId: request.params.id });
      return { data };
    },
  );

  app.post(
    "/:id/car-out/signature",
    {
      schema: {
        summary: "Capture or replace the PAID Contract hirer OUT signature",
        operationId: "uploadContractCarOutSignature",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_CAR_OUT],
        params: ContractIdParam, consumes: ["multipart/form-data"],
        response: { 200: dataResponse(CarOutHandoverSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const file = await request.file();
      if (!file) throw AppError.validation("Hirer OUT signature is required");
      const data = await contracts.uploadCarOutSignature(request.params.id, file, requireAuth(request).id);
      request.setAudit({ action: "contracts.car_out_signature", entityType: "contract", entityId: request.params.id });
      return { data };
    },
  );

  app.get(
    "/:id/car-out/signature/stream",
    {
      schema: {
        summary: "Stream secured hirer OUT signature",
        operationId: "streamContractCarOutSignature",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_READ],
        params: ContractIdParam, response: { 200: z.any(), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const { attachment, stream } = await contracts.openCarOutSignatureStream(request.params.id);
      return reply.header("content-type", attachment.mimeType).send(stream);
    },
  );

  app.post(
    "/:id/car-out/complete",
    {
      schema: {
        summary: "Complete saved Car-Out handover and activate rental",
        operationId: "completeContractCarOut",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_CAR_OUT, PERMISSIONS.CONTRACTS_ACTIVATE],
        params: ContractIdParam,
        response: { 200: dataResponse(ContractDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const key = request.headers["idempotency-key"];
      const data = await contracts.carOut(request.params.id, undefined, requireAuth(request).id,
        typeof key === "string" ? key : undefined);
      request.setAudit({ action: "contracts.car_out", entityType: "contract", entityId: request.params.id });
      return { data };
    },
  );

  app.post(
    "/:id/return-link",
    {
      schema: {
        summary: "Generate a return link (contract stays ACTIVE until the hirer confirms)",
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

  app.get(
    "/:id/car-in",
    {
      schema: {
        summary: "Read the staged Car-In draft and completed handover",
        operationId: "getContractCarIn",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_READ],
        params: ContractIdParam,
        response: { 200: dataResponse(CarInHandoverSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: (await contracts.get(request.params.id)).carInHandover }),
  );

  app.patch(
    "/:id/car-in",
    {
      schema: {
        summary: "Save RETOUT Contract Car-In draft without completing the return",
        operationId: "saveContractCarInDraft",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_RETURN],
        params: ContractIdParam, body: CarInDraftPatchSchema,
        response: { 200: dataResponse(CarInHandoverSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      requireAuth(request);
      const data = await contracts.saveCarInDraft(request.params.id, request.body);
      request.setAudit({ action: "contracts.car_in_draft", entityType: "contract", entityId: request.params.id });
      return { data };
    },
  );

  app.post(
    "/:id/car-in/photos",
    {
      schema: {
        summary: "Upload or replace one RETOUT Contract IN photo slot",
        operationId: "uploadContractCarInPhoto",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_RETURN],
        params: ContractIdParam, querystring: CarInPhotoQuerySchema,
        consumes: ["multipart/form-data"],
        response: { 200: dataResponse(CarInHandoverSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const file = await request.file();
      if (!file) throw AppError.validation("IN photo is required");
      const data = await contracts.uploadCarInPhoto(request.params.id, request.query.angle, file, requireAuth(request).id);
      request.setAudit({ action: "contracts.car_in_photo", entityType: "contract", entityId: request.params.id });
      return { data };
    },
  );

  app.delete(
    "/:id/car-in/photos/:photoId",
    {
      schema: {
        summary: "Delete one draft IN photo slot",
        operationId: "deleteContractCarInPhoto",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_RETURN],
        params: InspectionPhotoParam,
        response: { 200: dataResponse(CarInHandoverSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      requireAuth(request);
      const data = await contracts.deleteCarInPhoto(request.params.id, request.params.photoId);
      request.setAudit({ action: "contracts.car_in_photo_delete", entityType: "contract", entityId: request.params.id });
      return { data };
    },
  );

  app.post(
    "/:id/car-in/signature",
    {
      schema: {
        summary: "Capture or replace the RETOUT Contract hirer IN signature",
        operationId: "uploadContractCarInSignature",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_RETURN],
        params: ContractIdParam, consumes: ["multipart/form-data"],
        response: { 200: dataResponse(CarInHandoverSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const file = await request.file();
      if (!file) throw AppError.validation("Hirer IN signature is required");
      const data = await contracts.uploadCarInSignature(request.params.id, file, requireAuth(request).id);
      request.setAudit({ action: "contracts.car_in_signature", entityType: "contract", entityId: request.params.id });
      return { data };
    },
  );

  app.get(
    "/:id/car-in/signature/stream",
    {
      schema: {
        summary: "Stream secured hirer IN signature",
        operationId: "streamContractCarInSignature",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_READ],
        params: ContractIdParam, response: { 200: z.any(), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const { attachment, stream } = await contracts.openCarInSignatureStream(request.params.id);
      return reply.header("content-type", attachment.mimeType).send(stream);
    },
  );

  app.post(
    "/:id/car-in/complete",
    {
      schema: {
        summary: "Complete the saved Car-In draft and move the contract to REVIEW",
        operationId: "completeContractCarIn",
        tags: ["Contracts"], permissions: [PERMISSIONS.CONTRACTS_RETURN],
        params: ContractIdParam,
        response: { 200: dataResponse(ContractDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await contracts.completeCarInStaff(
        request.params.id,
        actor.id,
        typeof key === "string" ? key : undefined,
      );
      request.setAudit({ action: "contracts.car_in", entityType: "contract", entityId: request.params.id });
      return { data };
    },
  );

  app.post(
    "/:id/car-in",
    {
      schema: {
        summary: "[Deprecated] Alias for the Car-In complete route",
        description:
          "Superseded by PATCH /:id/car-in (save the draft) and POST /:id/car-in/complete " +
          "(finish it). This route no longer reads a body; it completes whatever draft " +
          "was already saved, exactly like /:id/car-in/complete.",
        operationId: "contractCarIn",
        tags: ["Contracts"],
        deprecated: true,
        hide: true,
        permissions: [PERMISSIONS.CONTRACTS_RETURN],
        params: ContractIdParam,
        response: { 200: dataResponse(ContractDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await contracts.completeCarInStaff(
        request.params.id,
        actor.id,
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

  app.get(
    "/:id/reconciliation/road-liabilities",
    {
      schema: {
        summary: "List chargeable and attached road liabilities for reconciliation",
        operationId: "listContractReconciliationRoadLiabilities",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_RECONCILE],
        params: ContractIdParam,
        response: { 200: dataResponse(ReconciliationRoadLiabilitiesSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      requireAuth(request);
      const data = await contracts.listReconciliationRoadLiabilities(request.params.id);
      return { data };
    },
  );

  app.post(
    "/:id/reconciliation/road-liabilities/:roadLiabilityId/confirm-charge",
    {
      schema: {
        summary: "Confirm the customer charge for a confirmed road liability",
        operationId: "confirmContractRoadLiabilityCharge",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_RECONCILE],
        params: ConfirmRoadLiabilityChargeParam,
        body: ConfirmRoadLiabilityChargeSchema,
        response: { 200: dataResponse(ContractDetailSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const key = request.headers["idempotency-key"];
      const data = await contracts.confirmRoadLiabilityCharge(
        request.params.id,
        request.params.roadLiabilityId,
        request.body,
        actor.id,
        typeof key === "string" ? key : undefined,
      );
      request.setAudit({
        action: "contracts.confirm_road_liability_charge",
        entityType: "contract",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/reconciliation/payment",
    {
      schema: {
        summary: "Start Stripe checkout for an approved reconciliation balance",
        operationId: "startReconciliationPayment",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.CONTRACTS_RECONCILE],
        params: ContractIdParam,
        response: { 200: dataResponse(PaymentCheckoutSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const data = await contracts.startReconciliationPayment(request.params.id, actor.id);
      request.setAudit({
        action: "contracts.reconciliation_payment",
        entityType: "contract",
        entityId: request.params.id,
      });
      return { data };
    },
  );

  app.post(
    "/:id/post-close-receivables/:receivableId/payment",
    {
      schema: {
        summary: "Start Stripe checkout for an open post-close receivable",
        operationId: "startPostCloseReceivablePayment",
        tags: ["Contracts"],
        permissions: [PERMISSIONS.VIOLATIONS_CHARGE],
        params: PostCloseReceivableParam,
        response: { 200: dataResponse(PaymentCheckoutSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const actor = requireAuth(request);
      const data = await contracts.startPostClosePayment(
        request.params.id,
        request.params.receivableId,
        actor.id,
      );
      request.setAudit({
        action: "contracts.post_close_payment",
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
