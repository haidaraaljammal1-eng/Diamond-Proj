import { z } from "zod";

export const carOutFormSchema = z.object({
  mileageOut: z.coerce.number().int().nonnegative(),
  notes: z.string().max(2000).optional(),
});

export type CarOutFormValues = z.infer<typeof carOutFormSchema>;
