import type { FastifyInstance } from "fastify";
import { withTransaction } from "src/lib/db/transaction";
import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { fingerprintIdempotentPayload, runIdempotent } from "src/lib/db/idempotency";
import {
  TARS_IDEMPOTENCY_SCOPE,
  TARS_OPERATION_LOCK_NS,
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
  toTarsContractIntegrationState,
  type TarsContractIntegrationState,
} from "src/modules/integrations/tars/tars.projection";
import type {
  TarsExecutionResult,
  TarsOperationInput,
  TarsProvider,
  TarsProviderResult,
} from "src/modules/integrations/tars/tars.types";

/**
 * Dispatch to the provider's business capability. Which TARS API(s) a
 * capability calls is an adapter detail that must not leak here.
 */
function callProvider(
  provider: TarsProvider,
  input: TarsOperationInput,
): Promise<TarsProviderResult> {
  switch (input.operationType) {
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

/**
 * Normalizes whatever a future adapter reports into a short, stable code, so
 * `lastErrorCode` can never end up holding a raw HTTP body, header or PII.
 */
function safeErrorCode(code: string | undefined): string {
  const normalized = (code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 64);
  return normalized || TARS_ERROR_REASONS.PROVIDER_ERROR;
}

/**
 * TarsIntegrationService — the ONLY component allowed to talk to a TarsProvider.
 *
 * It owns integration state (external references, operation history, idempotency
 * and concurrency) and owns nothing else: Contract lifecycle, Vehicle
 * operational status, Customer lifecycle and Payment state are untouched by
 * every method here, including on failure.
 *
 * In this foundation phase no Diamond transition calls `execute`. The five
 * capabilities exist so that wiring the mandatory checkpoints later is a small,
 * documented change — see DOCU/04-api-contracts/tars-integration.md.
 */
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

  /** Staff read state. Never creates rows just to render NOT_STARTED. */
  async function getIntegrationState(
    contractId: string,
  ): Promise<TarsContractIntegrationState> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!contract) throw tarsError.contractNotFound();

    const [integration, operations] = await Promise.all([
      prisma.tarsContractIntegration.findUnique({
        where: { contractId },
        select: { externalContractId: true, lastSuccessfulSyncAt: true },
      }),
      prisma.tarsOperation.findMany({
        where: { contractId },
        select: { operationType: true, status: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return toTarsContractIntegrationState({
      configured: createTarsProvider().configured,
      integration,
      operations,
    });
  }

  /**
   * Builds the normalized integration input from persisted Diamond state.
   * Exposed so the future adapter work (and the tests) can verify mapping
   * without performing any provider call.
   */
  async function buildOperationInput(
    contractId: string,
    operationType: TarsOperationTypeKey,
  ): Promise<TarsOperationInput> {
    return buildTarsOperationInput(operationType, await loadContract(contractId));
  }

  /**
   * Replay answer for a deduped idempotency key. A settled attempt must exist;
   * anything else means another caller is still holding this key's execution,
   * which is reported as in-progress rather than guessed at.
   */
  async function latestExecutionResult(
    contractId: string,
    operationType: TarsOperationTypeKey,
  ): Promise<TarsExecutionResult> {
    const [succeeded, integration] = await Promise.all([
      prisma.tarsOperation.findFirst({
        where: { contractId, operationType, status: "SUCCEEDED" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.tarsContractIntegration.findUnique({ where: { contractId } }),
    ]);
    const operation =
      succeeded ??
      (await prisma.tarsOperation.findFirst({
        where: { contractId, operationType, status: "FAILED" },
        orderBy: { createdAt: "desc" },
      }));
    if (!operation) throw tarsError.operationInProgress(operationType);
    return {
      operationId: operation.id,
      operationType,
      status: operation.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED",
      attemptNumber: operation.attemptNumber,
      externalContractId: integration?.externalContractId ?? null,
      externalReference: operation.externalReference,
      providerOperationId: operation.providerOperationId,
      errorCode: operation.lastErrorCode,
    };
  }

  async function runOnce(
    contractId: string,
    operationType: TarsOperationTypeKey,
    provider: TarsProvider,
    input: TarsOperationInput,
    fingerprint: string,
    idempotencyKey?: string,
  ): Promise<TarsExecutionResult> {
    // Phase 1 (short transaction): claim the attempt. The advisory lock makes
    // the "no second PROCESSING attempt" check race-free.
    const claim = await withTransaction(prisma, async (tx) => {
      await acquireAdvisoryLock(tx, TARS_OPERATION_LOCK_NS, `${contractId}:${operationType}`);
      const integration = await tx.tarsContractIntegration.upsert({
        where: { contractId },
        update: {},
        create: { contractId },
      });
      const priors = await tx.tarsOperation.findMany({
        where: { contractId, operationType },
        select: { status: true },
      });
      // An authoritative success is never re-sent by a normal execution.
      if (priors.some((prior) => prior.status === "SUCCEEDED")) {
        throw tarsError.operationAlreadyCompleted(operationType);
      }
      if (priors.some((prior) => prior.status === "PROCESSING" || prior.status === "PENDING")) {
        throw tarsError.operationInProgress(operationType);
      }
      const operation = await tx.tarsOperation.create({
        data: {
          integrationId: integration.id,
          contractId,
          operationType,
          status: "PROCESSING",
          idempotencyKey: idempotencyKey ?? null,
          requestFingerprint: fingerprint,
          attemptNumber: priors.length + 1,
          startedAt: new Date(),
        },
      });
      return { operation, integration };
    });

    // Phase 2: the provider/network operation runs with NO transaction open.
    let result: TarsProviderResult;
    try {
      result = await callProvider(provider, input);
    } catch {
      // The thrown value may carry headers, bodies or PII — never log or store it.
      result = { success: false, errorCode: TARS_ERROR_REASONS.PROVIDER_ERROR };
    }

    // Phase 3 (short transaction): persist the outcome.
    return withTransaction(prisma, async (tx) => {
      const completedAt = new Date();
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
          externalReference: null,
          providerOperationId: null,
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
          lastErrorCode: null,
        },
      });
      // The first authoritative external id wins; a later operation must not
      // silently rewrite the TARS-side contract reference.
      const integration = await tx.tarsContractIntegration.update({
        where: { id: claim.integration.id },
        data: {
          externalContractId:
            claim.integration.externalContractId ?? result.externalContractId ?? null,
          lastSuccessfulSyncAt: completedAt,
        },
      });
      return {
        operationId: succeeded.id,
        operationType,
        status: "SUCCEEDED" as const,
        attemptNumber: succeeded.attemptNumber,
        externalContractId: integration.externalContractId,
        externalReference: succeeded.externalReference,
        providerOperationId: succeeded.providerOperationId,
        errorCode: null,
      };
    });
  }

  /**
   * Executes one mandatory TARS procedure.
   *
   * Fails closed before touching the database when no real provider exists, so
   * an unconfigured environment writes no operation row at all and the
   * projection stays NOT_STARTED. `idempotencyKey` is scoped per contract and
   * operation type; reuse it to make a retry safe, and use a fresh key when
   * deliberately retrying a FAILED attempt.
   */
  async function execute(
    contractId: string,
    operationType: TarsOperationTypeKey,
    options: { idempotencyKey?: string } = {},
  ): Promise<TarsExecutionResult> {
    const provider = createTarsProvider();
    if (!provider.configured) throw tarsError.notConfigured();

    const input = await buildOperationInput(contractId, operationType);
    const fingerprint = fingerprintIdempotentPayload(input);

    if (!options.idempotencyKey) {
      return runOnce(contractId, operationType, provider, input, fingerprint);
    }

    const outcome = await runIdempotent(
      prisma,
      {
        scope: `${TARS_IDEMPOTENCY_SCOPE}:${contractId}:${operationType}`,
        key: options.idempotencyKey,
        fingerprint,
      },
      () =>
        runOnce(
          contractId,
          operationType,
          provider,
          input,
          fingerprint,
          options.idempotencyKey,
        ),
    );
    if (outcome.deduped) return latestExecutionResult(contractId, operationType);
    return outcome.result!;
  }

  return {
    config: getTarsConfig,
    getIntegrationState,
    buildOperationInput,
    execute,
  };
}

export type TarsIntegrationService = ReturnType<typeof createTarsIntegrationService>;
