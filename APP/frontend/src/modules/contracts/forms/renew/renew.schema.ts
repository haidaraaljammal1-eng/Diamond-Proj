import { z } from "zod";

export const renewFormSchema = z.object({
  additionalDays: z.coerce.number().int().positive().max(3650),
  additionalAmount: z.coerce.number().int().nonnegative(),
});

export type RenewFormValues = z.infer<typeof renewFormSchema>;
