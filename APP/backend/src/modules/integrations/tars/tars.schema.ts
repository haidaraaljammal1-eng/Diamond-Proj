import { z } from "zod";
import { TARS_PROJECTION_STATUSES } from "src/modules/integrations/tars/tars.constants";

export const TarsProjectionStatusSchema = z.enum(TARS_PROJECTION_STATUSES);

/** Staff-visible TARS integration state for one Contract. Read-only. */
export const TarsContractIntegrationStateSchema = z.object({
  configured: z.boolean(),
  /**
   * The operating company this contract's TARS traffic routes to, taken from
   * Contract.companyId. It lets the UI show "TARS · UNIQUE" without implying the
   * provider is connected — `configured` alone says that.
   */
  company: z.object({
    id: z.number().int(),
    code: z.string(),
    displayName: z.string(),
    accentColor: z.string(),
  }),
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
