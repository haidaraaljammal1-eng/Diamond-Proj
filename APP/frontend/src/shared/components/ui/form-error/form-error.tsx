"use client";

import { useTranslations } from "next-intl";

export type ValidationMessageKey =
  | "required"
  | "tooLong"
  | "invalidEmail"
  | "roleKey"
  | "passwordMin"
  | "passwordLetter"
  | "passwordNumber"
  | "passwordMismatch";

interface FormErrorProps {
  id?: string;
  message?: ValidationMessageKey | string;
}

/**
 * Central validation error renderer.
 *
 * Receives stable validation keys from Zod schemas and translates them
 * through the `validation` namespace. No raw Zod messages are rendered
 * to the user.
 */
export function FormError({ id, message }: FormErrorProps) {
  const t = useTranslations("validation");

  if (!message) return null;

  return (
    <p id={id} role="alert">
      {t(message)}
    </p>
  );
}
