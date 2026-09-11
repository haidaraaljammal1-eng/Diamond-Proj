import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createContractsService } from "src/modules/contracts/contracts.service";
import {
  CarInSchema,
  ContractTokenParam,
  PaymentStatusTokenParam,
  PublicAcceptSchema,
  PublicContractViewSchema,
  PublicFormSchema,
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
