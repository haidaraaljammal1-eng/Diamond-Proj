import { z } from "zod";

export const paymentFormSchema = z.object({
  amount: z.coerce.number().int().positive(),
  method: z.enum(["MANUAL", "BANK_TRANSFER", "CARD"]),
  externalReference: z.string().trim().max(200).optional(),
});

export type PaymentFormValues = z.infer<typeof paymentFormSchema>;
