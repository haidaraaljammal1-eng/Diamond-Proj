"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import {
  chooseLocalSaveDirectory,
  detectLocalSaveCapability,
  localSaveEnabled,
  localSaveFailures,
  localSaveStatus,
  retryLocalSave,
  setLocalSaveEnabled,
  subscribeLocalSave,
  type LocalSaveCapability,
  type LocalSaveFailure,
  type LocalSaveStatus,
} from "../../utils/whatsapp-local-save";
import type { WhatsAppMessageDto } from "../../types/whatsapp.types";
import styles from "./local-save-settings.module.css";

export function WhatsAppLocalSaveSettings({ messages }: { messages: WhatsAppMessageDto[] }) {
  const t = useTranslations("WhatsApp");
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<LocalSaveStatus>("off");
  const [failures, setFailures] = useState<LocalSaveFailure[]>([]);
  const [capability, setCapability] = useState<LocalSaveCapability>("manual");

  useEffect(() => {
    setCapability(detectLocalSaveCapability());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void localSaveEnabled().then((value) => {
        if (!cancelled) setEnabled(value);
      });
      void localSaveStatus().then((value) => {
        if (!cancelled) setStatus(value);
      });
      if (!cancelled) setFailures(localSaveFailures());
    };
    refresh();
    const unsubscribe = subscribeLocalSave(refresh);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const statusText =
    status === "configured"
      ? t("localSave.configured")
      : status === "permission"
        ? t("localSave.permission")
        : status === "iphone"
          ? t("localSave.iphone")
          : status === "manual"
            ? t("localSave.manual")
            : t("localSave.off");

  return (
    <section className={styles.panel} data-testid="whatsapp-local-save">
      <div className={styles.row}>
        <span>{t("localSave.label")}</span>
        <Switch
          checked={enabled && capability === "directory"}
          disabled={capability !== "directory"}
          label={t("localSave.label")}
          onChange={(next) => {
            void setLocalSaveEnabled(next).then(() => setEnabled(next));
          }}
        />
        <span data-testid="whatsapp-local-save-status">{enabled ? t("localSave.on") : t("localSave.off")}</span>
      </div>
      <p className={styles.status}>{statusText}</p>
      <p className={styles.status}>{t("localSave.closed")}</p>
      {capability === "directory" ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void chooseLocalSaveDirectory()}
        >
          {t("localSave.choose")}
        </Button>
      ) : null}
      {failures.map((failure) => {
        const message = messages.find((item) => item.id === failure.messageId);
        return (
          <p key={failure.messageId} className={styles.failed} role="alert">
            {t("localSave.failed", { name: failure.filename })}
            {message ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => void retryLocalSave(message)}>
                {t("localSave.retry")}
              </Button>
            ) : null}
          </p>
        );
      })}
    </section>
  );
}
