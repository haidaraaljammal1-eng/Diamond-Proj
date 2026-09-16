import { z } from "zod";

export const carInFormSchema = z.object({
  mileageIn: z.coerce.number().int().nonnegative(),
  fuelIn: z.enum(["F", "7/8", "3/4", "5/8", "1/2", "3/8", "1/4", "1/8", "E"]),
  notes: z.string().max(2000).optional(),
});

export type CarInFormValues = z.infer<typeof carInFormSchema>;
