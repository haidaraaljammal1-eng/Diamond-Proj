import { z } from "zod";

export const carOutFormSchema = z.object({
  mileageOut: z.coerce.number().int().nonnegative(),
  fuelOut: z.enum(["F", "7/8", "3/4", "5/8", "1/2", "3/8", "1/4", "1/8", "E"]),
  notes: z.string().max(2000).optional(),
});

export type CarOutFormValues = z.infer<typeof carOutFormSchema>;
