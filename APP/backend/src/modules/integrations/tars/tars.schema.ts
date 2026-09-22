import { z } from "zod";
import {
  TARS_OTP_UI_STATUSES,
  TARS_PROJECTION_STATUSES,
} from "src/modules/integrations/tars/tars.constants";

export const TarsProjectionStatusSchema = z.enum(TARS_PROJECTION_STATUSES);

const officialOperationsSchema = z.object({
  createRental: TarsProjectionStatusSchema,
  updateRental: TarsProjectionStatusSchema,
  returnRental: TarsProjectionStatusSchema,
  settleRental: TarsProjectionStatusSchema,
});

const legacyOperationsSchema = z.object({
  registerContract: TarsProjectionStatusSchema,
  contractAcceptance: TarsProjectionStatusSchema,
  handover: TarsProjectionStatusSchema,
  returnDocumentation: TarsProjectionStatusSchema,
  completeContract: TarsProjectionStatusSchema,
});

export const TarsContractIntegrationStateSchema = z.object({
  configured: z.boolean(),
  company: z.object({
    id: z.number().int(),
    code: z.string(),
    displayName: z.string(),
    accentColor: z.string(),
  }),
  externalContractId: z.string().nullable(),
  externalRentalDid: z.string().nullable(),
  lastSuccessfulSyncAt: z.date().nullable(),
  operations: officialOperationsSchema.merge(legacyOperationsSchema),
});

export const ContractTarsResponseSchema = z.object({
  tars: TarsContractIntegrationStateSchema,
});

export const TarsOtpPublicStateSchema = z.object({
  providerConfigured: z.boolean(),
  required: z.boolean(),
  status: z.enum(TARS_OTP_UI_STATUSES),
  maskedDestination: z.string().nullable(),
  resendAvailableAt: z.date().nullable(),
  expiresAt: z.date().nullable(),
  otpLength: z.number().int().positive().nullable(),
  attemptsRemaining: z.number().int().nonnegative().nullable(),
});

export const TarsOtpVerifyBodySchema = z.object({
  code: z.string().min(1).max(32),
});
