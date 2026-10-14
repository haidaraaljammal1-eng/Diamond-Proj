import { z } from "zod";

export const ArchiveSyncResultSchema = z.object({
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  affectedContracts: z.number().int().nonnegative(),
  violationsCounted: z.number().int().nonnegative(),
  syncStartedAt: z.date(),
  lastSuccessfulSyncAt: z.date().nullable(),
  errors: z
    .array(
      z.object({
        contractId: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});
export type ArchiveSyncResultDto = z.infer<typeof ArchiveSyncResultSchema>;

export const ArchiveSyncStatusSchema = z.object({
  lastSuccessfulSyncAt: z.date().nullable(),
  running: z.boolean(),
  runningStartedAt: z.date().nullable(),
});
export type ArchiveSyncStatusDto = z.infer<typeof ArchiveSyncStatusSchema>;
