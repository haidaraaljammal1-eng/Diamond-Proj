"use client";

import { useTranslations } from "next-intl";
import { PasswordInput } from "@/shared/components/ui/password-input";
import styles from "./user-form-dialog.module.css";

/** Read-only stand-in for a stored hash — the real password is never sent to the client. */
export function StoredPasswordIndicator() {
  const t = useTranslations("Users");

  return (
    <div className={styles.storedPassword}>
      <label className={styles.fieldLabel} htmlFor="user-stored-password">
        {t("form.storedPasswordLabel")}
      </label>
      <PasswordInput
        id="user-stored-password"
        readOnly
        disabled
        value="••••••••"
        aria-describedby="user-stored-password-hint"
      />
      <p id="user-stored-password-hint" className={styles.fieldHint}>
        {t("form.storedPasswordHint")}
      </p>
    </div>
  );
}
