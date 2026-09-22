import type { FastifyInstance } from "fastify";
import type { TarsOperationTypeKey } from "src/modules/integrations/tars/tars.constants";
import { resolveTarsContractContext } from "src/modules/integrations/tars/tars-company.guard";
import { createTarsOtpService } from "src/modules/integrations/tars/tars-otp.service";
import { tarsError } from "src/modules/integrations/tars/tars.errors";
import { createTarsIntegrationService } from "src/modules/integrations/tars/tars.service";
import type {
  TarsExecutionResult,
  TarsOtpPublicState,
} from "src/modules/integrations/tars/tars.types";

/**
 * Central TARS workflow orchestration. Domain routes and lifecycle handlers must
 * call this layer — not scatter provider calls across contracts, Car-Out, or
 * public pages.
 */
export function createTarsWorkflowOrchestrator(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const integration = createTarsIntegrationService(fastify);
  const otp = createTarsOtpService(fastify);

  async function assertProviderReady(contractId: string) {
    const ctx = await resolveTarsContractContext(prisma, contractId);
    if (!ctx.provider.configured) throw tarsError.notConfigured();
    return ctx;
  }

  async function getIntegrationState(contractId: string) {
    await resolveTarsContractContext(prisma, contractId);
    return integration.getIntegrationState(contractId);
  }

  async function executeOperation(
    contractId: string,
    operationType: TarsOperationTypeKey,
    options: { idempotencyKey?: string; correlationSubject?: string } = {},
  ): Promise<TarsExecutionResult> {
    const ctx = await assertProviderReady(contractId);
    if (ctx.provider.companyCode !== ctx.company.companyCode) {
      throw tarsError.providerCompanyMismatch();
    }
    return integration.execute(contractId, operationType, options);
  }

  async function refreshPendingOperation(operationId: string) {
    const operation = await prisma.tarsOperation.findUnique({
      where: { id: operationId },
      select: { contractId: true },
    });
    if (!operation) throw tarsError.contractNotFound();
    await resolveTarsContractContext(prisma, operation.contractId);
    return integration.refreshPendingOperation(operationId);
  }

  async function getOtpPublicState(contractId: string): Promise<TarsOtpPublicState> {
    await resolveTarsContractContext(prisma, contractId);
    return otp.getPublicState(contractId);
  }

  async function requestOtp(contractId: string) {
    const ctx = await resolveTarsContractContext(prisma, contractId);
    if (!ctx.provider.configured) throw tarsError.notConfigured();
    return otp.requestOtp(contractId);
  }

  async function verifyOtp(contractId: string, code: string) {
    const ctx = await resolveTarsContractContext(prisma, contractId);
    if (!ctx.provider.configured) throw tarsError.notConfigured();
    return otp.verifyOtp(contractId, code);
  }

  async function isOtpVerificationSatisfied(contractId: string) {
    await resolveTarsContractContext(prisma, contractId);
    return otp.isVerificationSatisfied(contractId);
  }

  return {
    resolveTarsContractContext: (contractId: string) =>
      resolveTarsContractContext(prisma, contractId),
    getIntegrationState,
    executeOperation,
    refreshPendingOperation,
    getOtpPublicState,
    requestOtp,
    verifyOtp,
    isOtpVerificationSatisfied,
    buildOperationInput: integration.buildOperationInput,
  };
}

export type TarsWorkflowOrchestrator = ReturnType<typeof createTarsWorkflowOrchestrator>;
