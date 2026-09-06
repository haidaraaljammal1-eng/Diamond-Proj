"use client";

import { useState, type InputHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/shared/components/ui/input";
import styles from "./password-input.module.css";

export type PasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
>;

/**
 * Shared Diamond password field: the underline Input plus a reveal toggle.
 * Form usage goes through `PasswordField` / FormBuilder `type: "password"`.
 */
export function PasswordInput({
  className,
  ...props
}: PasswordInputProps) {
  const t = useTranslations("Password");
  const [revealed, setRevealed] = useState(false);
  const toggleLabel = revealed ? t("hide") : t("show");

  return (
    <div className={styles.wrap}>
      <Input
        {...props}
        type={revealed ? "text" : "password"}
        className={`${styles.input} ${className ?? ""}`}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setRevealed((open) => !open)}
        aria-label={toggleLabel}
        aria-pressed={revealed}
        tabIndex={-1}
      >
        {revealed ? <HideIcon /> : <ShowIcon />}
      </button>
    </div>
  );
}

function ShowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
      />
      <circle
        cx="12"
        cy="12"
        r="2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function HideIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3l18 18M9.9 9.9A2.6 2.6 0 0 0 12 14.6m4.2-1.5c.5-.6.8-1.3.8-2.1A3.5 3.5 0 0 0 12 7.5c-.8 0-1.5.3-2.1.8M6.1 6.4C3.7 8 2.5 12 2.5 12s3.5 6.5 9.5 6.5c2 0 3.7-.6 5.1-1.5M17.7 15.6C20 14 21.5 12 21.5 12"
      />
    </svg>
  );
}
