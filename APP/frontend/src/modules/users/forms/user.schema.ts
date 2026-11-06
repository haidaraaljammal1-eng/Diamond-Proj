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

/** Edit form when the session may call `POST /users/:id/reset-password`. */
export const editUserWithPasswordResetSchema = userIdentitySchema
  .extend({
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const newPassword = values.newPassword?.trim() ?? "";
    const confirmPassword = values.confirmPassword?.trim() ?? "";
    if (!newPassword && !confirmPassword) return;

    if (!newPassword) {
      ctx.addIssue({
        code: "custom",
        message: "required",
        path: ["newPassword"],
      });
    }
    if (!confirmPassword) {
      ctx.addIssue({
        code: "custom",
        message: "required",
        path: ["confirmPassword"],
      });
    }
    if (!newPassword || !confirmPassword) return;

    const strength = passwordValueSchema.safeParse(newPassword);
    if (!strength.success) {
      for (const issue of strength.error.issues) {
        ctx.addIssue({ ...issue, path: ["newPassword"] });
      }
    }
    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: "custom",
        message: "passwordMismatch",
        path: ["confirmPassword"],
      });
    }
  });

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
export type EditUserWithPasswordResetValues = z.infer<
  typeof editUserWithPasswordResetSchema
>;
