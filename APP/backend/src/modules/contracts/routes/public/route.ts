import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { createContractsService } from "src/modules/contracts/contracts.service";
import {
  CarInSchema,
  ContractTokenParam,
  PublicAcceptSchema,
  PublicContractViewSchema,
  PublicFormSchema,
  RenewSchema,
} from "src/modules/contracts/contracts.schema";
import { commonErrorResponses, dataResponse } from "src/lib/http/response";

export default async function contractsPublicRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const contracts = createContractsService(fastify);

  app.get(
    "/rental/:token",
    {
      schema: {
        summary: "Load a rental offer by public token",
        operationId: "getPublicRentalContract",
        tags: ["Contracts"],
        public: true,
        params: ContractTokenParam,
        response: { 200: dataResponse(PublicContractViewSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({ data: await contracts.getPublic("RENTAL", request.params.token) }),
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
        response: { 200: dataResponse(PublicContractViewSchema), ...commonErrorResponses },
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
        response: { 200: dataResponse(PublicContractViewSchema), ...commonErrorResponses },
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
        body: RenewSchema,
        response: { 200: dataResponse(PublicContractViewSchema), ...commonErrorResponses },
      },
    },
    async (request) => ({
      data: await contracts.confirmRenewalPublic(request.params.token, request.body),
    }),
  );
}
