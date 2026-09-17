import { z } from "zod";

export const carInFormSchema = z.object({
  mileageIn: z.coerce.number().int().nonnegative(),
  notes: z.string().max(2000).optional(),
});

export type CarInFormValues = z.infer<typeof carInFormSchema>;
