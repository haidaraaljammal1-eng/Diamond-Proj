import { z } from "zod";
import { TARS_PROJECTION_STATUSES } from "src/modules/integrations/tars/tars.constants";

export const TarsProjectionStatusSchema = z.enum(TARS_PROJECTION_STATUSES);

/** Staff-visible TARS integration state for one Contract. Read-only. */
export const TarsContractIntegrationStateSchema = z.object({
  configured: z.boolean(),
  externalContractId: z.string().nullable(),
  lastSuccessfulSyncAt: z.date().nullable(),
  operations: z.object({
    registerContract: TarsProjectionStatusSchema,
    contractAcceptance: TarsProjectionStatusSchema,
    handover: TarsProjectionStatusSchema,
    returnDocumentation: TarsProjectionStatusSchema,
    completeContract: TarsProjectionStatusSchema,
  }),
});

export const ContractTarsResponseSchema = z.object({
  tars: TarsContractIntegrationStateSchema,
});
