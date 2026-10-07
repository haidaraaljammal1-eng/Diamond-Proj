import { z } from "zod";

/** Editable public renter fields only. Verified document values are not form controls. */
export const publicRentalFormSchema = z.object({
  name: z.string().trim().min(1, { message: "required" }).max(200, {
    message: "tooLong",
  }),
  mobile: z.string().trim().min(3, { message: "required" }).max(30, {
    message: "tooLong",
  }),
  nationality: z.string().trim().min(2, { message: "required" }).max(80, {
    message: "tooLong",
  }),
  address: z.string().trim().max(400, { message: "tooLong" }),
});

export type PublicRentalFormValues = z.infer<typeof publicRentalFormSchema>;
