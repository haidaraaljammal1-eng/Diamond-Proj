import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createContractsService } from "src/modules/contracts/contracts.service";
import {
  CarInSchema,
  ContractTokenParam,
  PaymentStatusTokenParam,
  PublicAcceptSchema,
  PublicContractViewSchema,
  PublicFormSchema,
  PublicIdentityDraftSchema,
  OfficialContractReviewPatchSchema,
  OfficialContractSignSchema,
  OfficialContractViewSchema,
  OfficialSignatureSlotParam,
  OFFICIAL_SIGNATURE_SLOT_PATHS,
  PublicCardSetupSchema,
  PublicPaymentAttemptSchema,
  PublicPaymentContextSchema,
  PublicPaymentStatusSchema,
  PublicRentalContextSchema,
  ConfirmPublicRenewalSchema,
} from "src/modules/contracts/contracts.schema";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";
import { AppError } from "src/lib/errors/app-error";

export default async function contractsPublicRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const contracts = createContractsService(fastify);

  app.get(
    "/rental/:token",
    {
      schema: {
        summary: "Load public rental context by token",
        operationId: "getPublicRentalContract",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        response: { 200: dataResponse(PublicRentalContextSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await contracts.getPublicRental(request.params.token) }),
  );

  app.post(
    "/rental/:token/driving-license",
    {
      schema: {
        summary: "Upload a driving-license photo for the rental token",
        operationId: "uploadPublicRentalDrivingLicense",
        tags: ["Contracts"],
        public: true,
        consumes: ["multipart/form-data"],
        params: ContractTokenParam,
        response: { 200: dataResponse(PublicRentalContextSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const file = await request.file();
      if (!file) throw AppError.validation("Validation failed");
      return { data: await contracts.uploadDrivingLicense(request.params.token, file) };
    },
  );

  app.get(
    "/rental/:token/driving-license",
    {
      schema: {
        summary: "Current driving-license verification for the rental token",
        operationId: "getPublicRentalDrivingLicense",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        response: { 200: dataResponse(PublicRentalContextSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await contracts.getPublicRental(request.params.token) }),
  );

  app.post(
    "/rental/:token/passport",
    {
      schema: {
        summary: "Upload the passport information page for the rental token",
        description:
          "Requires a VALID driving license. Returns normalized identity state only; the OCR provider is server-side.",
        operationId: "uploadPublicRentalPassport",
        tags: ["Contracts"],
        public: true,
        consumes: ["multipart/form-data"],
        params: ContractTokenParam,
        response: { 200: dataResponse(PublicRentalContextSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const file = await request.file();
      if (!file) throw AppError.validation("Validation failed");
      return { data: await contracts.uploadPassport(request.params.token, file) };
    },
  );

  app.get(
    "/rental/:token/identity",
    {
      schema: {
        summary: "Normalized contract identity draft for the rental token",
        operationId: "getPublicRentalIdentityDraft",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        response: { 200: dataResponse(PublicIdentityDraftSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await contracts.getPublicIdentityDraft(request.params.token) }),
  );

  app.get(
    "/rental/:token/official-contract",
    {
      schema: {
        summary: "Official rental contract assembled from authoritative Diamond sources",
        operationId: "getPublicOfficialContract",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        response: { 200: dataResponse(OfficialContractViewSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await contracts.getPublicOfficialContract(request.params.token) }),
  );

  app.patch(
    "/rental/:token/official-contract",
    {
      schema: {
        summary: "Save customer review corrections for editable personal contract fields",
        description:
          "Strict whitelist. System-locked fields (vehicle, rate, days, dates, agreement number, Car-Out/Car-In) are rejected.",
        operationId: "reviewPublicOfficialContract",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        body: OfficialContractReviewPatchSchema,
        response: { 200: dataResponse(OfficialContractViewSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const result = await contracts.updatePublicOfficialContractReview(
        request.params.token,
        request.body,
      );
      // Field names only — reviewed values (PII) are never written to the audit log.
      request.setAudit({
        action: "contract.official_review_updated",
        entityType: "contract",
        entityId: result.contractId,
        metadata: { fields: result.changedFields },
      });
      return { data: result.view };
    },
  );

  app.put(
    "/rental/:token/official-contract/signatures/:slot",
    {
      schema: {
        summary: "Capture (or replace) an official contract signature image",
        description: "PNG only. Hirer, additional driver, sponsor and Vehicle OUT hirer slots before signing.",
        operationId: "savePublicOfficialContractSignature",
        tags: ["Contracts"],
        public: true,
        consumes: ["multipart/form-data"],
        params: OfficialSignatureSlotParam,
        response: { 200: dataResponse(OfficialContractViewSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const file = await request.file();
      if (!file) throw AppError.validation("Validation failed");
      const slot = OFFICIAL_SIGNATURE_SLOT_PATHS[request.params.slot];
      const result = await contracts.savePublicOfficialSignature(request.params.token, slot, file);
      // Slot name only — never the image.
      request.setAudit({
        action: "contract.official_signature_captured",
        entityType: "contract",
        entityId: result.contractId,
        metadata: { slot },
      });
      return { data: result.view };
    },
  );

  app.delete(
    "/rental/:token/official-contract/signatures/:slot",
    {
      schema: {
        summary: "Clear an official contract signature before signing",
        operationId: "clearPublicOfficialContractSignature",
        tags: ["Contracts"],
        public: true,
        params: OfficialSignatureSlotParam,
        response: { 200: dataResponse(OfficialContractViewSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const slot = OFFICIAL_SIGNATURE_SLOT_PATHS[request.params.slot];
      const result = await contracts.clearPublicOfficialSignature(request.params.token, slot);
      request.setAudit({
        action: "contract.official_signature_cleared",
        entityType: "contract",
        entityId: result.contractId,
        metadata: { slot },
      });
      return { data: result.view };
    },
  );

  app.get(
    "/rental/:token/official-contract/signatures/:slot",
    {
      schema: {
        summary: "Stream a captured official contract signature image",
        operationId: "streamPublicOfficialContractSignature",
        tags: ["Contracts"],
        public: true,
        params: OfficialSignatureSlotParam,
        response: { 200: z.any(), ...commonErrorResponses },
      },
    },
    async (request, reply) => {
      const slot = OFFICIAL_SIGNATURE_SLOT_PATHS[request.params.slot];
      const { mimeType, stream } = await contracts.openPublicOfficialSignature(request.params.token, slot);
      return reply
        .header("content-type", mimeType)
        .header("cache-control", "private, no-store")
        .send(stream);
    },
  );

  app.post(
    "/rental/:token/official-contract/sign",
    {
      schema: {
        summary: "Sign the official contract (AWAITING/FORM → SIGNED)",
        description:
          "Requires identity, hirer name/passport/license and the required signatures (hirer; additional driver and sponsor when filled). Freezes the official contract snapshot.",
        operationId: "signPublicOfficialContract",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        body: OfficialContractSignSchema,
        response: { 200: dataResponse(OfficialContractViewSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const result = await contracts.signPublicOfficialContract(request.params.token, request.body, {
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      });
      request.setAudit({
        action: "contract.official_contract_signed",
        entityType: "contract",
        entityId: result.contractId,
      });
      return { data: result.view };
    },
  );

  app.post(
    "/rental/:token/form",
    {
      schema: {
        summary: "Submit the public rental customer form",
        operationId: "submitPublicRentalForm",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        body: PublicFormSchema,
        response: { 200: dataResponse(PublicRentalContextSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await contracts.submitPublicForm(request.params.token, request.body) }),
  );

  app.post(
    "/rental/:token/accept",
    {
      schema: {
        summary: "Accept rental terms and freeze the contract snapshot",
        operationId: "acceptPublicRentalContract",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        body: PublicAcceptSchema,
        response: { 200: dataResponse(PublicRentalContextSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({
      data: await contracts.acceptPublic(request.params.token, request.body, {
        ip: request.ip,
        userAgent: request.headers["user-agent"],
      }),
    }),
  );

  app.get(
    "/rental/:token/payment",
    {
      schema: {
        summary: "Public payment page context",
        operationId: "getPublicRentalPayment",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        response: { 200: dataResponse(PublicPaymentContextSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await contracts.getPaymentContext(request.params.token) }),
  );

  app.post(
    "/rental/:token/card-link",
    {
      schema: {
        summary: "Start Stripe-hosted card setup without charging",
        operationId: "startPublicRentalCardLink",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        response: { 200: dataResponse(PublicCardSetupSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await contracts.startCardLink(request.params.token) }),
  );

  app.post(
    "/rental/:token/payment",
    {
      schema: {
        summary: "Start an electronic card payment attempt",
        operationId: "startPublicRentalPayment",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        response: { 200: dataResponse(PublicPaymentAttemptSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const key = request.headers["idempotency-key"];
      return {
        data: await contracts.startCardPayment(
          request.params.token,
          typeof key === "string" ? key : undefined,
        ),
      };
    },
  );

  app.get(
    "/payments/status/:statusToken",
    {
      schema: {
        summary: "Resolve an electronic payment by status token",
        operationId: "getPublicPaymentStatus",
        tags: ["Contracts"],
        public: true,
        params: PaymentStatusTokenParam,
        response: { 200: dataResponse(PublicPaymentStatusSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({
      data: await contracts.getPaymentStatusByToken(request.params.statusToken),
    }),
  );

  app.get(
    "/return/:token",
    {
      schema: {
        summary: "Load a return flow by public token",
        operationId: "getPublicReturnContract",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        response: { 200: dataResponse(PublicContractViewSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await contracts.getPublic("RETURN", request.params.token) }),
  );

  app.post(
    "/return/:token/car-in",
    {
      schema: {
        summary: "Submit Car-In for a return token",
        operationId: "submitPublicCarIn",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        body: CarInSchema,
        response: { 200: dataResponse(PublicContractViewSchema), ...commonErrorResponses },
      },
    },
    async (request) => {
      const key = request.headers["idempotency-key"];
      return {
        data: await contracts.carIn(
          request.params.token,
          request.body,
          typeof key === "string" ? key : undefined,
        ),
      };
    },
  );

  app.get(
    "/renew/:token",
    {
      schema: {
        summary: "Load a renewal offer by public token",
        operationId: "getPublicRenewalContract",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        response: { 200: dataResponse(PublicContractViewSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await contracts.getPublic("RENEWAL", request.params.token) }),
  );

  app.post(
    "/renew/:token/confirm",
    {
      schema: {
        summary: "Confirm a public contract renewal",
        operationId: "confirmPublicRenewal",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        body: ConfirmPublicRenewalSchema,
        response: { 200: dataResponse(PublicContractViewSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({
      data: await contracts.confirmRenewalPublic(request.params.token),
    }),
  );

  app.post(
    "/renew/:token/payment",
    {
      schema: {
        summary: "Start Stripe checkout for a confirmed renewal offer",
        operationId: "startPublicRenewalPayment",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        response: { 200: dataResponse(PublicPaymentAttemptSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({
      data: await contracts.startRenewalPaymentPublic(request.params.token),
    }),
  );
}
