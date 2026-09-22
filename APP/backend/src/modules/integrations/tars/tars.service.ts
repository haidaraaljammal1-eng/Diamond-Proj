import type { FastifyInstance } from "fastify";
import { withTransaction } from "src/lib/db/transaction";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { fingerprintIdempotentPayload, runIdempotent } from "src/lib/db/idempotency";
import {
  TARS_IDEMPOTENCY_SCOPE,
  TARS_OPERATION_LOCK_NS,
  TARS_REPEATABLE_OPERATION_TYPES,
  type TarsOperationTypeKey,
} from "src/modules/integrations/tars/tars.constants";
import { getTarsConfig } from "src/modules/integrations/tars/tars.config";
import { TARS_ERROR_REASONS, tarsError } from "src/modules/integrations/tars/tars.errors";
import {
  TARS_CONTRACT_INCLUDE,
  buildTarsOperationInput,
  type TarsContractRow,
} from "src/modules/integrations/tars/tars.mapper";
import { createTarsProvider } from "src/modules/integrations/tars/tars.provider";
import {
  isOperationInFlight,
  toTarsContractIntegrationState,
  type TarsContractIntegrationState,
} from "src/modules/integrations/tars/tars.projection";
import type {
  TarsExecutionResult,
  TarsOperationInput,
  TarsProvider,
  TarsProviderResult,
} from "src/modules/integrations/tars/tars.types";

function callProvider(
  provider: TarsProvider,
  input: TarsOperationInput,
): Promise<TarsProviderResult> {
  switch (input.operationType) {
    case "CREATE_RENTAL":
      return provider.createRental(input.payload);
    case "UPDATE_RENTAL":
      return provider.updateRental(input.payload);
    case "RETURN_RENTAL":
      return provider.returnRental(input.payload);
    case "SETTLE_RENTAL":
      return provider.settleRental(input.payload);
    case "REGISTER_CONTRACT":
      return provider.registerContract(input.payload);
    case "CONTRACT_ACCEPTANCE":
      return provider.submitContractAcceptance(input.payload);
    case "HANDOVER":
      return provider.submitHandover(input.payload);
    case "RETURN_DOCUMENTATION":
      return provider.submitReturn(input.payload);
    case "COMPLETE_CONTRACT":
      return provider.completeContract(input.payload);
  }
}

function safeErrorCode(code: string | undefined): string {
  const normalized = (code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 64);
  return normalized || TARS_ERROR_REASONS.PROVIDER_ERROR;
}

function lockKey(
  contractId: string,
  operationType: TarsOperationTypeKey,
  correlationSubject?: string | null,
): string {
  if (TARS_REPEATABLE_OPERATION_TYPES.has(operationType) && correlationSubject) {
    return `${contractId}:${operationType}:${correlationSubject}`;
  }
  return `${contractId}:${operationType}`;
}

export function createTarsIntegrationService(fastify: FastifyInstance) {
  const prisma = fastify.prisma;

  async function loadContract(contractId: string): Promise<TarsContractRow> {
    const row = await prisma.contract.findUnique({
      where: { id: contractId },
      include: TARS_CONTRACT_INCLUDE,
    });
    if (!row) throw tarsError.contractNotFound();
    return row;
  }

  async function getIntegrationState(
    contractId: string,
  ): Promise<TarsContractIntegrationState> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        id: true,
        company: { select: { id: true, code: true, displayName: true, accentColor: true } },
      },
    });
    if (!contract) throw tarsError.contractNotFound();

    const [integration, operations] = await Promise.all([
      prisma.tarsContractIntegration.findUnique({
        where: { contractId },
        select: {
          externalContractId: true,
          externalRentalDid: true,
          lastSuccessfulSyncAt: true,
        },
      }),
      prisma.tarsOperation.findMany({
        where: { contractId },
        select: {
          operationType: true,
          status: true,
          correlationSubject: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return toTarsContractIntegrationState({
      configured: createTarsProvider(contract.company.code).configured,
      company: contract.company,
      integration,
      operations,
    });
  }

  async function buildOperationInput(
    contractId: string,
    operationType: TarsOperationTypeKey,
    options: { correlationSubject?: string } = {},
  ): Promise<TarsOperationInput> {
    return buildTarsOperationInput(
      operationType,
      await loadContract(contractId),
      options,
    );
  }

  async function latestExecutionResult(
    contractId: string,
    operationType: TarsOperationTypeKey,
    correlationSubject?: string | null,
  ): Promise<TarsExecutionResult> {
    const [integration, operation] = await Promise.all([
      prisma.tarsContractIntegration.findUnique({ where: { contractId } }),
      prisma.tarsOperation.findFirst({
        where: {
          contractId,
          operationType,
          ...(correlationSubject ? { correlationSubject } : {}),
          status: { in: ["SUCCEEDED", "FAILED", "PENDING_PROVIDER"] },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    if (!operation) throw tarsError.operationInProgress(operationType);
    return {
      operationId: operation.id,
      operationType,
      status:
        operation.status === "SUCCEEDED"
          ? "SUCCEEDED"
          : operation.status === "PENDING_PROVIDER"
            ? "PENDING_PROVIDER"
            : "FAILED",
      attemptNumber: operation.attemptNumber,
      externalContractId: integration?.externalContractId ?? null,
      externalRentalDid: integration?.externalRentalDid ?? null,
      externalReference: operation.externalReference,
      providerOperationId: operation.providerOperationId,
      providerRequestId: operation.providerRequestId,
      errorCode: operation.lastErrorCode,
    };
  }

  async function runOnce(
    contractId: string,
    operationType: TarsOperationTypeKey,
    provider: TarsProvider,
    input: TarsOperationInput,
    fingerprint: string,
    options: { idempotencyKey?: string; correlationSubject?: string | null } = {},
  ): Promise<TarsExecutionResult> {
    const correlationSubject = options.correlationSubject ?? null;
    const claim = await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(
        tx,
        TARS_OPERATION_LOCK_NS,
        lockKey(contractId, operationType, correlationSubject),
      );
      const integration = await tx.tarsContractIntegration.upsert({
        where: { contractId },
        update: {},
        create: { contractId },
      });
      const priors = await tx.tarsOperation.findMany({
        where: {
          contractId,
          operationType,
          ...(correlationSubject ? { correlationSubject } : {}),
        },
        select: { status: true },
      });
      if (!TARS_REPEATABLE_OPERATION_TYPES.has(operationType)) {
        if (priors.some((prior) => prior.status === "SUCCEEDED")) {
          throw tarsError.operationAlreadyCompleted(operationType);
        }
      } else if (
        correlationSubject &&
        priors.some((prior) => prior.status === "SUCCEEDED")
      ) {
        throw tarsError.operationAlreadyCompleted(operationType);
      }
      if (priors.some((prior) => isOperationInFlight(prior.status))) {
        throw tarsError.operationInProgress(operationType);
      }
      const operation = await tx.tarsOperation.create({
        data: {
          integrationId: integration.id,
          contractId,
          operationType,
          correlationSubject,
          status: "SUBMITTING",
          idempotencyKey: options.idempotencyKey ?? null,
          requestFingerprint: fingerprint,
          attemptNumber: priors.length + 1,
          startedAt: new Date(),
        },
      });
      return { operation, integration };
    });

    let result: TarsProviderResult;
    try {
      result = await callProvider(provider, input);
    } catch {
      result = { success: false, errorCode: TARS_ERROR_REASONS.PROVIDER_ERROR };
    }

    return withTransaction(prisma, async (tx) => {
      const completedAt = new Date();

      if (result.accepted && result.providerRequestId) {
        const pending = await tx.tarsOperation.update({
          where: { id: claim.operation.id },
          data: {
            status: "PENDING_PROVIDER",
            providerRequestId: result.providerRequestId,
            externalReference: result.externalReference ?? null,
            providerOperationId: result.providerOperationId ?? null,
          },
        });
        return {
          operationId: pending.id,
          operationType,
          status: "PENDING_PROVIDER" as const,
          attemptNumber: pending.attemptNumber,
          externalContractId: claim.integration.externalContractId,
          externalRentalDid: claim.integration.externalRentalDid,
          externalReference: pending.externalReference,
          providerOperationId: pending.providerOperationId,
          providerRequestId: pending.providerRequestId,
          errorCode: null,
        };
      }

      if (!result.success) {
        const failed = await tx.tarsOperation.update({
          where: { id: claim.operation.id },
          data: {
            status: "FAILED",
            completedAt,
            lastErrorCode: safeErrorCode(result.errorCode),
          },
        });
        fastify.log.warn(
          { operationId: failed.id, operationType, errorCode: failed.lastErrorCode },
          "tars operation failed",
        );
        return {
          operationId: failed.id,
          operationType,
          status: "FAILED" as const,
          attemptNumber: failed.attemptNumber,
          externalContractId: claim.integration.externalContractId,
          externalRentalDid: claim.integration.externalRentalDid,
          externalReference: null,
          providerOperationId: null,
          providerRequestId: null,
          errorCode: failed.lastErrorCode,
        };
      }

      const succeeded = await tx.tarsOperation.update({
        where: { id: claim.operation.id },
        data: {
          status: "SUCCEEDED",
          completedAt,
          externalReference: result.externalReference ?? null,
          providerOperationId: result.providerOperationId ?? null,
          providerRequestId: result.providerRequestId ?? null,
          lastErrorCode: null,
        },
      });
      const integration = await tx.tarsContractIntegration.update({
        where: { id: claim.integration.id },
        data: {
          externalContractId:
            claim.integration.externalContractId ?? result.externalContractId ?? null,
          externalRentalDid:
            claim.integration.externalRentalDid ?? result.externalRentalDid ?? null,
          lastSuccessfulSyncAt: completedAt,
        },
      });
      return {
        operationId: succeeded.id,
        operationType,
        status: "SUCCEEDED" as const,
        attemptNumber: succeeded.attemptNumber,
        externalContractId: integration.externalContractId,
        externalRentalDid: integration.externalRentalDid,
        externalReference: succeeded.externalReference,
        providerOperationId: succeeded.providerOperationId,
        providerRequestId: succeeded.providerRequestId,
        errorCode: null,
      };
    });
  }

  async function execute(
    contractId: string,
    operationType: TarsOperationTypeKey,
    options: { idempotencyKey?: string; correlationSubject?: string } = {},
  ): Promise<TarsExecutionResult> {
    const routing = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { company: { select: { code: true } } },
    });
    if (!routing) throw tarsError.contractNotFound();
    const provider = createTarsProvider(routing.company.code);
    if (!provider.configured) throw tarsError.notConfigured();

    const input = await buildOperationInput(contractId, operationType, options);
    const fingerprint = fingerprintIdempotentPayload(input);

    if (!options.idempotencyKey) {
      return runOnce(contractId, operationType, provider, input, fingerprint, options);
    }

    const outcome = await runIdempotent(
      prisma,
      {
        scope: `${TARS_IDEMPOTENCY_SCOPE}:${lockKey(contractId, operationType, options.correlationSubject)}`,
        key: options.idempotencyKey,
        fingerprint,
      },
      () =>
        runOnce(contractId, operationType, provider, input, fingerprint, {
          ...options,
          idempotencyKey: options.idempotencyKey,
        }),
    );
    if (outcome.deduped) {
      return latestExecutionResult(contractId, operationType, options.correlationSubject);
    }
    return outcome.result!;
  }

  /** Poll a PENDING_PROVIDER row and persist authoritative provider outcome. */
  async function refreshPendingOperation(operationId: string): Promise<TarsExecutionResult> {
    const operation = await prisma.tarsOperation.findUnique({
      where: { id: operationId },
      include: { integration: true, contract: { select: { company: { select: { code: true } } } } },
    });
    if (!operation) throw tarsError.contractNotFound();
    if (operation.status !== "PENDING_PROVIDER" || !operation.providerRequestId) {
      return latestExecutionResult(operation.contractId, operation.operationType, operation.correlationSubject);
    }

    const provider = createTarsProvider(operation.contract.company.code);
    if (!provider.configured) throw tarsError.notConfigured();

    let poll;
    try {
      poll = await provider.getAsyncRequestStatus(operation.providerRequestId);
    } catch {
      poll = { status: "FAILED" as const, errorCode: TARS_ERROR_REASONS.PROVIDER_ERROR };
    }

    if (poll.status === "PENDING") {
      return latestExecutionResult(operation.contractId, operation.operationType, operation.correlationSubject);
    }

    const completedAt = new Date();
    return withTransaction(prisma, async (tx) => {
      if (poll.status === "FAILED") {
        const failed = await tx.tarsOperation.update({
          where: { id: operation.id },
          data: {
            status: "FAILED",
            completedAt,
            lastErrorCode: safeErrorCode(poll.errorCode),
          },
        });
        return {
          operationId: failed.id,
          operationType: operation.operationType,
          status: "FAILED" as const,
          attemptNumber: failed.attemptNumber,
          externalContractId: operation.integration.externalContractId,
          externalRentalDid: operation.integration.externalRentalDid,
          externalReference: failed.externalReference,
          providerOperationId: failed.providerOperationId,
          providerRequestId: failed.providerRequestId,
          errorCode: failed.lastErrorCode,
        };
      }

      const succeeded = await tx.tarsOperation.update({
        where: { id: operation.id },
        data: {
          status: "SUCCEEDED",
          completedAt,
          externalReference: poll.externalReference ?? operation.externalReference,
          lastErrorCode: null,
        },
      });
      const integration = await tx.tarsContractIntegration.update({
        where: { id: operation.integrationId },
        data: {
          externalRentalDid:
            operation.integration.externalRentalDid ?? poll.externalRentalDid ?? null,
          lastSuccessfulSyncAt: completedAt,
        },
      });
      return {
        operationId: succeeded.id,
        operationType: operation.operationType,
        status: "SUCCEEDED" as const,
        attemptNumber: succeeded.attemptNumber,
        externalContractId: integration.externalContractId,
        externalRentalDid: integration.externalRentalDid,
        externalReference: succeeded.externalReference,
        providerOperationId: succeeded.providerOperationId,
        providerRequestId: succeeded.providerRequestId,
        errorCode: null,
      };
    });
  }

  return {
    config: getTarsConfig,
    getIntegrationState,
    buildOperationInput,
    execute,
    refreshPendingOperation,
  };
}

export type TarsIntegrationService = ReturnType<typeof createTarsIntegrationService>;
