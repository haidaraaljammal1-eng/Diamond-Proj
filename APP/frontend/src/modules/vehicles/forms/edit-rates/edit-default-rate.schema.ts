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
    dailyRate: z.string().trim().min(1, { message: "required" }),
    monthlyRate: z.string().trim().min(1, { message: "required" }),
  })
  .superRefine((values, ctx) => {
    const dailyRate = parseRate(values.dailyRate);
    if (Number.isNaN(dailyRate)) {
      ctx.addIssue({ code: "custom", message: "invalidRate", path: ["dailyRate"] });
    }
    const monthlyRate = parseRate(values.monthlyRate);
    if (Number.isNaN(monthlyRate)) {
      ctx.addIssue({ code: "custom", message: "invalidRate", path: ["monthlyRate"] });
    }
  });

export type EditDefaultRateFormValues = z.infer<typeof editDefaultRateFormSchema>;

export function toUpdateRatesPayload(
  values: EditDefaultRateFormValues,
): { dailyRate: number; monthlyRate: number } {
  return {
    dailyRate: Number(values.dailyRate.trim()),
    monthlyRate: Number(values.monthlyRate.trim()),
  };
}
