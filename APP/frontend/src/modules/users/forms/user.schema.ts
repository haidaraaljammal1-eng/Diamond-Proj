import { z } from "zod";
import { passwordValueSchema } from "../../../shared/validation/password.ts";

const userIdentitySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: "required" })
    .email({ message: "invalidEmail" }),
  name: z.string().trim().max(200, { message: "tooLong" }),
  roleId: z.string().optional(),
});

export const editUserSchema = userIdentitySchema;

export const createUserSchema = userIdentitySchema
  .extend({
    password: passwordValueSchema,
    confirmPassword: z.string().min(1, { message: "required" }),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "passwordMismatch",
    path: ["confirmPassword"],
  });

export type CreateUserValues = z.infer<typeof createUserSchema>;
export type EditUserValues = z.infer<typeof editUserSchema>;
