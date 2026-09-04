"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useLogin } from "@/modules/auth";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import { loginFields } from "@/modules/auth/forms/login/login.fields";
import { loginSchema } from "@/modules/auth/forms/login/login.schema";
import type { LoginFormValues } from "@/modules/auth/forms/login/login.types";
import styles from "./login-screen.module.css";

export function LoginScreen() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Login");
  const { login, error, status, isLoggedIn } = useLogin();

  useEffect(() => {
    if (status === "authenticated") router.replace(`/${locale}/dashboard`);
  }, [locale, router, status]);

  const handleSubmit = async ({ email, password }: LoginFormValues) => {
    if (await login({ email, password }))
      router.replace(`/${locale}/dashboard`);
  };

  const getErrorMessage = (): string => {
    if (!error) return "";

    const errorMessages: Record<string, string> = {
      UNAUTHORIZED: t("error.UNAUTHORIZED"),
      ACCOUNT_SUSPENDED: t("error.ACCOUNT_SUSPENDED"),
      NETWORK_ERROR: t("error.NETWORK_ERROR"),
    };

    return errorMessages[error] || t("error.generic");
  };

  if (status === "loading" || status === "authenticated") return null;

  return (
    <div id="login" className={isLoggedIn ? styles.off : ""}>
      <div className={styles.loginbox}>
        <div className={styles.logoContainer}>
          <Image
            src="/diamond-logo.png"
            alt="Diamond Elite Rent Car"
            width={528}
            height={280}
            className={styles.bigLogo}
            priority
          />
        </div>

        <svg id="swash" viewBox="0 0 340 40" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 30 C60 8 120 34 170 22 C215 12 250 26 300 14 C316 10 328 12 334 16" />
        </svg>

        <h1 className={styles.logintitle}>{t("title")}</h1>

        <FormBuilder<LoginFormValues>
          fields={loginFields.map((field) => ({
            ...field,
            placeholder: field.name === "email" ? t("email") : t("password"),
          }))}
          schema={loginSchema}
          defaultValues={{ email: "", password: "" }}
          onSubmit={handleSubmit}
          submitLabel={t("submitButton")}
          submittingLabel={t("loading")}
          className={styles.logfields}
        />

        {error && (
          <div className={styles.errorMessage}>{getErrorMessage()}</div>
        )}

        <div className={styles.loginhint}>{t("hint")}</div>
      </div>
    </div>
  );
}
