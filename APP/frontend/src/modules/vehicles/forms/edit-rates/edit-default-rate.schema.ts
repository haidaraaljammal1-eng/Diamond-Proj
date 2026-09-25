import { z } from "zod";

function parseRate(value: string): number | typeof Number.NaN {
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) return Number.NaN;
  return parsed;
}

export const editDefaultRateFormSchema = z
  .object({
    hourlyRate: z.string().trim().min(1, { message: "required" }),
    dailyRate: z.string().trim().min(1, { message: "required" }),
    weeklyRate: z.string().trim().min(1, { message: "required" }),
    monthlyRate: z.string().trim().min(1, { message: "required" }),
  })
  .superRefine((values, ctx) => {
    for (const [field, raw] of Object.entries(values) as [keyof typeof values, string][]) {
      if (Number.isNaN(parseRate(raw))) {
        ctx.addIssue({ code: "custom", message: "invalidRate", path: [field] });
      }
    }
  });

export type EditDefaultRateFormValues = z.infer<typeof editDefaultRateFormSchema>;

export function toUpdateRatesPayload(
  values: EditDefaultRateFormValues,
): {
  hourlyRate: number;
  dailyRate: number;
  weeklyRate: number;
  monthlyRate: number;
} {
  return {
    hourlyRate: Number(values.hourlyRate.trim()),
    dailyRate: Number(values.dailyRate.trim()),
    weeklyRate: Number(values.weeklyRate.trim()),
    monthlyRate: Number(values.monthlyRate.trim()),
  };
}
