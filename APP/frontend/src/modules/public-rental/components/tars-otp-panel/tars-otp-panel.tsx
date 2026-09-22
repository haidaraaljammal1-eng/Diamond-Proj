"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import type { TarsOtpPublicState } from "../../types/public-rental.types";
import { resolvePublicRentalErrorMessage } from "../../utils/resolve-public-rental-error";
import {
  isTarsOtpBlockingSign,
  maxOtpCodeLength,
  minOtpCodeLength,
  resolveTarsOtpDisplayStatus,
} from "../../utils/tars-otp-policy";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import styles from "./tars-otp-panel.module.css";

interface TarsOtpPanelProps {
  state: TarsOtpPublicState;
  requestPending: boolean;
  verifyPending: boolean;
  error: ApiRequestError | null;
  onRequest: () => Promise<void>;
  onVerify: (code: string) => Promise<void>;
}

function errorTranslator(t: ReturnType<typeof useTranslations<"PublicRental">>) {
  const translate = ((key: string) => t(key as never)) as ((key: string) => string) & {
    has: (key: string) => boolean;
  };
  translate.has = (key: string) => t.has(key as never);
  return translate;
}

export function TarsOtpPanel({
  state,
  requestPending,
  verifyPending,
  error,
  onRequest,
  onVerify,
}: TarsOtpPanelProps) {
  const t = useTranslations("PublicRental.tarsOtp");
  const tRental = useTranslations("PublicRental");
  const [code, setCode] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const clientPhase = requestPending ? "REQUESTING" : verifyPending ? "VERIFYING" : null;
  const displayStatus = resolveTarsOtpDisplayStatus(state.status, clientPhase);

  const resendAvailableAtMs = state.resendAvailableAt
    ? new Date(state.resendAvailableAt).getTime()
    : null;

  useEffect(() => {
    if (!resendAvailableAtMs) {
      setCooldownSeconds(0);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((resendAvailableAtMs - Date.now()) / 1000));
      setCooldownSeconds(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [resendAvailableAtMs]);

  const verified = state.status === "VERIFIED";
  const showForm = state.required && !verified;
  const minLen = minOtpCodeLength(state);
  const maxLen = maxOtpCodeLength(state);

  const errorMessage = useMemo(
    () => resolvePublicRentalErrorMessage(errorTranslator(tRental), error),
    [error, tRental],
  );

  if (!state.required) return null;

  const statusMessage = (() => {
    switch (displayStatus) {
      case "REQUESTING":
        return t("requesting");
      case "VERIFYING":
        return t("verifying");
      case "VERIFIED":
        return t("verified");
      case "EXPIRED":
        return t("expired");
      case "FAILED":
        return t("failed");
      case "RATE_LIMITED":
        return t("rateLimited");
      case "UNAVAILABLE":
        return t("unavailable");
      case "NOT_STARTED":
        return t("notStarted");
      case "CODE_SENT":
        return null;
      default:
        return null;
    }
  })();

  return (
    <section
      className={styles.panel}
      data-testid="tars-otp-panel"
      data-otp-status={displayStatus}
      aria-labelledby="tars-otp-title"
    >
      <div className={styles.head}>
        <h3 id="tars-otp-title" className={styles.title}>{t("title")}</h3>
        <p className={styles.intro}>{t("intro")}</p>
      </div>

      {statusMessage ? (
        <p
          className={
            displayStatus === "VERIFIED"
              ? styles.success
              : displayStatus === "FAILED" || displayStatus === "RATE_LIMITED"
                ? styles.error
                : displayStatus === "EXPIRED"
                  ? styles.warn
                  : styles.status
          }
          role="status"
          data-testid={`tars-otp-status-${displayStatus}`}
        >
          {statusMessage}
        </p>
      ) : null}

      {showForm ? (
        <div className={styles.form}>
          {state.maskedDestination ? (
            <p className={styles.destination}>
              {t("destination", { destination: state.maskedDestination })}
            </p>
          ) : null}

          {state.attemptsRemaining != null ? (
            <p className={styles.meta}>
              {t("attemptsRemaining", { count: state.attemptsRemaining })}
            </p>
          ) : null}

          {errorMessage ? (
            <p className={styles.error} role="alert">{errorMessage}</p>
          ) : null}

          {displayStatus !== "NOT_STARTED" && displayStatus !== "REQUESTING" ? (
            <label className={styles.field}>
              <span className={styles.label}>{t("codeLabel")}</span>
              <input
                className={styles.input}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={maxLen}
                value={code}
                disabled={verifyPending || requestPending}
                onChange={(event) => setCode(event.target.value.replace(/\s/g, ""))}
                data-testid="tars-otp-code"
              />
            </label>
          ) : null}

          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              size="md"
              loading={requestPending}
              disabled={requestPending || verifyPending || cooldownSeconds > 0}
              onClick={() => void onRequest()}
              data-testid="tars-otp-send"
            >
              {displayStatus === "NOT_STARTED" || displayStatus === "REQUESTING"
                ? requestPending
                  ? t("requesting")
                  : t("send")
                : cooldownSeconds > 0
                  ? t("resendIn", { seconds: cooldownSeconds })
                  : t("resend")}
            </Button>
            {displayStatus !== "NOT_STARTED" && displayStatus !== "REQUESTING" ? (
              <Button
                type="button"
                size="md"
                loading={verifyPending}
                disabled={verifyPending || requestPending || code.length < minLen}
                onClick={() => void onVerify(code)}
                data-testid="tars-otp-verify"
              >
                {verifyPending ? t("verifying") : t("verify")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export { isTarsOtpBlockingSign };
