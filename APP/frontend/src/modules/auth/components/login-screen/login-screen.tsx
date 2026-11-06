"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { resolveStaffReauthRequested, shouldAutoRedirectStaffFromLoginScreen } from "@/infrastructure/auth/staff-login-guard";
import { isStaffSessionUsable } from "@/infrastructure/auth/staff-session";
import { useLogin } from "@/modules/auth";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import { loginFields } from "@/modules/auth/forms/login/login.fields";
import { loginSchema } from "@/modules/auth/forms/login/login.schema";
import type { LoginFormValues } from "@/modules/auth/forms/login/login.types";
import styles from "./login-screen.module.css";

const isDev = process.env.NODE_ENV !== "production";

const devDefaultValues: LoginFormValues = {
  email: isDev ? (process.env.NEXT_PUBLIC_DEV_ADMIN_EMAIL ?? "") : "",
  password: isDev ? (process.env.NEXT_PUBLIC_DEV_ADMIN_PASSWORD ?? "") : "",
};

export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const t = useTranslations("Login");
  const { data: session } = useSession();
  const { login, error, status } = useLogin();
  const reauth = resolveStaffReauthRequested(searchParams.get("reauth"));

  useEffect(() => {
    if (!shouldAutoRedirectStaffFromLoginScreen(session, reauth)) return;
    router.replace(`/${locale}/dashboard`);
  }, [locale, reauth, router, session]);

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

  if (shouldAutoRedirectStaffFromLoginScreen(session, reauth)) return null;

  const shellOff =
    !reauth &&
    status === "authenticated" &&
    isStaffSessionUsable(session);

  return (
    <div
      id="login"
      className={[styles.shell, shellOff ? styles.shellOff : ""].filter(Boolean).join(" ")}
      data-testid="login-shell"
    >
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

        <svg id="swash" className={styles.swash} viewBox="0 0 340 40" xmlns="http://www.w3.org/2000/svg">
          <path d="M6 30 C60 8 120 34 170 22 C215 12 250 26 300 14 C316 10 328 12 334 16" />
        </svg>

        <h1 className={styles.logintitle}>{t("title")}</h1>

        <FormBuilder<LoginFormValues>
          fields={loginFields.map((field) => ({
            ...field,
            placeholder: field.name === "email" ? t("email") : t("password"),
          }))}
          schema={loginSchema}
          defaultValues={devDefaultValues}
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
