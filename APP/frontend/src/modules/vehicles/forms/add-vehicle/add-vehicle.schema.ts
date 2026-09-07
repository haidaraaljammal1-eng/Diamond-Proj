import { z } from "zod";

function parseOptionalInt(
  value: string,
  options: { min?: number; max?: number; nonnegative?: boolean },
): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed)) return Number.NaN;
  if (options.nonnegative && parsed < 0) return Number.NaN;
  if (options.min !== undefined && parsed < options.min) return Number.NaN;
  if (options.max !== undefined && parsed > options.max) return Number.NaN;
  return parsed;
}

/**
 * Form-facing schema — all fields are strings for FormBuilder + RHF.
 * Validation mirrors Backend `CreateVehicleSchema` constraints.
 */
export const addVehicleFormSchema = z
  .object({
    vehicleName: z.string().trim().min(1, { message: "required" }),
    modelYear: z.string().trim(),
    plateNumber: z.string().trim(),
    color: z.string().trim(),
    dailyRate: z.string().trim(),
    monthlyRate: z.string().trim(),
    vin: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    if (values.vehicleName.length > 120) {
      ctx.addIssue({ code: "custom", message: "tooLong", path: ["vehicleName"] });
    }

    const modelYear = parseOptionalInt(values.modelYear, { min: 1900, max: 2100 });
    if (values.modelYear && Number.isNaN(modelYear)) {
      ctx.addIssue({ code: "custom", message: "invalidYear", path: ["modelYear"] });
    }

    const dailyRate = parseOptionalInt(values.dailyRate, { nonnegative: true });
    if (values.dailyRate && Number.isNaN(dailyRate)) {
      ctx.addIssue({ code: "custom", message: "invalidRate", path: ["dailyRate"] });
    }

    const monthlyRate = parseOptionalInt(values.monthlyRate, { nonnegative: true });
    if (values.monthlyRate && Number.isNaN(monthlyRate)) {
      ctx.addIssue({ code: "custom", message: "invalidRate", path: ["monthlyRate"] });
    }

    if (values.plateNumber.length > 20) {
      ctx.addIssue({ code: "custom", message: "tooLong", path: ["plateNumber"] });
    }
    if (values.color.length > 60) {
      ctx.addIssue({ code: "custom", message: "tooLong", path: ["color"] });
    }
    if (values.vin.length > 64) {
      ctx.addIssue({ code: "custom", message: "tooLong", path: ["vin"] });
    }
  });

export type AddVehicleFormValues = z.infer<typeof addVehicleFormSchema>;

/** @deprecated Use addVehicleFormSchema — kept for tests checking field absence. */
export const addVehicleSchema = addVehicleFormSchema;

export type AddVehicleValues = AddVehicleFormValues;
