import { z } from "zod";

/**
 * Diamond's operating companies (UNIQUE / ELITE). Reference data: rows are
 * created by the migration and the base seed, so there is no create/update/
 * delete API. A company is retired with `isActive = false`, never deleted.
 */
export const OperatingCompanySchema = z.object({
  id: z.number().int(),
  code: z.string(),
  displayName: z.string(),
  /** Printed on the official contract. Not UI copy — never translated. */
  legalNameAr: z.string(),
  legalNameEn: z.string(),
  accentColor: z.string(),
  isActive: z.boolean(),
});
export type OperatingCompanyDto = z.infer<typeof OperatingCompanySchema>;

export const ListOperatingCompaniesQuerySchema = z.object({
  /** Selectable companies only by default; `false` also returns retired ones. */
  activeOnly: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .optional()
    .default(true),
});
