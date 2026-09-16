import { z } from "zod";

export const publicRentalFormSchema = z
  .object({
    name: z.string().trim().min(1, { message: "required" }).max(200, {
      message: "tooLong",
    }),
    mobile: z.string().trim().min(3, { message: "required" }).max(30, {
      message: "tooLong",
    }),
    email: z
      .string()
      .trim()
      .max(200, { message: "tooLong" })
      .refine((value) => value.length === 0 || z.string().email().safeParse(value).success, {
        message: "invalidEmail",
      }),
    nationality: z.string().trim().min(2, { message: "required" }).max(80, {
      message: "tooLong",
    }),
    identityNumber: z.string().trim().max(50, { message: "tooLong" }),
    passportNumber: z.string().trim().max(50, { message: "tooLong" }),
    address: z.string().trim().max(400, { message: "tooLong" }),
  })
  .refine(
    (values) =>
      values.identityNumber.trim().length >= 3 ||
      values.passportNumber.trim().length >= 3,
    { message: "identityOrPassport", path: ["identityNumber"] },
  );

export type PublicRentalFormValues = z.infer<typeof publicRentalFormSchema>;
