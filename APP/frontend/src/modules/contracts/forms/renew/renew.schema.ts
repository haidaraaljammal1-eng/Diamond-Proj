import { z } from "zod";

export const renewFormSchema = z.object({
  durationUnit: z.enum(["HOUR", "DAY"]),
  durationValue: z.coerce.number().int().positive().max(8760),
  additionalAmount: z.coerce.number().int().nonnegative(),
});

export type RenewFormValues = z.infer<typeof renewFormSchema>;
