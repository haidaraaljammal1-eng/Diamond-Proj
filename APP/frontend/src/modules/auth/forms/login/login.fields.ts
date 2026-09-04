import type { FormField } from "@/shared/components/forms/form-builder";
import type { LoginFormValues } from "./login.types";

export const loginFields: FormField<LoginFormValues>[] = [
  {
    name: "email",
    type: "email",
    placeholder: "اسم المستخدم",
    autoComplete: "username",
  },
  {
    name: "password",
    type: "password",
    placeholder: "كلمة المرور",
    autoComplete: "current-password",
  },
];
