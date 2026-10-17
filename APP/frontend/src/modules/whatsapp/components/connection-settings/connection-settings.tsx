"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { FormBuilder } from "@/shared/components/forms/form-builder";
import {
  activateWhatsAppWebhook,
  authorizeWhatsAppConnectionAttempt,
  bootstrapWhatsAppConnection,
  configureWhapiConnection,
  cancelWhatsAppHistorySync,
  disconnectWhatsAppConnection,
  getWhatsAppConnection,
  getWhatsAppConnectionQr,
  getWhatsAppHistorySyncStatus,
  startWhatsAppHistorySync,
  selectWhatsAppConnection,
  startWhatsAppConnectionAttempt,
} from "../../api/whatsapp.api";
import type {
  WhatsAppConnectionDto,
  WhatsAppGrantedChoiceDto,
  WhatsAppHistorySyncStatusDto,
} from "../../types/whatsapp.types";
import { resolveWhatsAppErrorMessage } from "../../utils/resolve-whatsapp-error";
import { connectionBanner, connectionCapabilities } from "../../utils/whatsapp-view-model";
import { useWhatsApp } from "../../hooks/use-whatsapp";
import styles from "./connection-settings.module.css";

const whapiConfigureSchema = z.object({
  token: z.string().trim().min(8, { message: "required" }),
  channelId: z.string().trim().min(1, { message: "required" }),
});

type WhapiConfigureValues = z.infer<typeof whapiConfigureSchema>;

interface FbLoginResponse {
  authResponse?: { code?: string };
}

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (cb: (response: FbLoginResponse) => void, opts: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

function loadFacebookSdk(appId: string, version: string): Promise<void> {
  if (window.FB) {
    window.FB.init({ appId, cookie: true, xfbml: false, version });
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, cookie: true, xfbml: false, version });
      resolve();
    };
    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.onerror = () => reject(new Error("sdk"));
    document.body.appendChild(script);
  });
}

export function WhatsAppConnectionSettings({
  open,
  onClose,
  connection,
}: {
  open: boolean;
  onClose: () => void;
  connection: WhatsAppConnectionDto | null;
}) {
  const t = useTranslations("WhatsApp");
  const inbox = useWhatsApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<WhatsAppGrantedChoiceDto[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmChange, setConfirmChange] = useState(false);
  const [whapiFormKey, setWhapiFormKey] = useState(0);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [historySync, setHistorySync] = useState<WhatsAppHistorySyncStatusDto | null>(null);
  const [confirmForceFullSync, setConfirmForceFullSync] = useState(false);
  const linked = connection && connection.status !== "DISCONNECTED";
  const banner = connectionBanner(connection);
  const caps = connectionCapabilities(connection);

  const refresh = inbox.refresh;
  useEffect(() => {
    if (!open || !qrOpen || !caps.supportsQrAuthentication) return;
    let cancelled = false;
    let ticks = 0;
    const maxTicks = 48;

    async function poll() {
      if (cancelled || ticks >= maxTicks) return;
      ticks += 1;
      try {
        const next = await getWhatsAppConnection();
        if (cancelled) return;
        if (next.providerSessionStatus === "AUTHENTICATED") {
          setQrImage(null);
          setQrOpen(false);
          await refresh();
          return;
        }
        if (next.providerSessionStatus === "QR_REQUIRED") {
          const qr = await getWhatsAppConnectionQr();
          if (!cancelled) setQrImage(qr.imageDataUrl);
        }
      } catch {
        /* keep last QR; status endpoint remains source of session */
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      setQrImage(null);
    };
  }, [open, qrOpen, caps.supportsQrAuthentication, refresh]);

  useEffect(() => {
    if (!open) {
      setQrOpen(false);
      setQrImage(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !linked || caps.provider !== "WHAPI" || inbox.simulationActive) return;
    let cancelled = false;
    async function load() {
      try {
        const status = await getWhatsAppHistorySyncStatus();
        if (!cancelled) setHistorySync(status);
      } catch {
        /* status is optional UX */
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, linked, caps.provider, inbox.simulationActive]);

  async function runHistorySync(mode?: "FULL" | "INCREMENTAL") {
    setBusy(true);
    setError(null);
    try {
      const resolved =
        mode ?? historySync?.suggestedSyncMode ?? (historySync?.lastSuccessfulSyncAt ? "INCREMENTAL" : "FULL");
      const status = await startWhatsAppHistorySync(true, resolved);
      setHistorySync(status);
    } catch (err) {
      setError(resolveWhatsAppErrorMessage(t, err));
    } finally {
      setBusy(false);
      setConfirmForceFullSync(false);
    }
  }

  async function stopHistorySync() {
    setBusy(true);
    try {
      const status = await cancelWhatsAppHistorySync();
      setHistorySync(status);
    } finally {
      setBusy(false);
    }
  }

  async function saveWhapi(values: WhapiConfigureValues) {
    setBusy(true);
    setError(null);
    try {
      if (inbox.simulationActive) {
        inbox.simulationSetConnection?.("LINKED_ACTIVE");
        setWhapiFormKey((key) => key + 1);
        return;
      }
      await configureWhapiConnection({ token: values.token, channelId: values.channelId });
      setWhapiFormKey((key) => key + 1);
      await inbox.refresh();
    } catch (err) {
      setError(resolveWhatsAppErrorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      if (inbox.simulationActive) {
        inbox.simulationSetConnection?.("LINKED_ACTIVE");
        setBusy(false);
        return;
      }
      if (caps.supportsQrAuthentication || !caps.supportsEmbeddedSignup) {
        const next = await bootstrapWhatsAppConnection();
        await inbox.refresh();
        if (next.providerSessionStatus === "QR_REQUIRED") setQrOpen(true);
        return;
      }
      const attempt = await startWhatsAppConnectionAttempt();
      if (!attempt.bootstrap.appId || !attempt.bootstrap.configId) {
        setError(t("error.WHATSAPP_EMBEDDED_SIGNUP_NOT_CONFIGURED"));
        setBusy(false);
        return;
      }
      await loadFacebookSdk(attempt.bootstrap.appId, attempt.bootstrap.graphApiVersion);
      const code = await new Promise<string | null>((resolve) => {
        window.FB?.login(
          (response) => resolve(response.authResponse?.code ?? null),
          {
            config_id: attempt.bootstrap.configId,
            response_type: "code",
            override_default_response_type: true,
            extras: { sessionInfoVersion: "3" },
          },
        );
      });
      if (!code) {
        setBusy(false);
        return;
      }
      const authorized = await authorizeWhatsAppConnectionAttempt(
        attempt.attemptId,
        code,
        attempt.state,
      );
      setAttemptId(attempt.attemptId);
      setChoices(authorized.choices);
    } catch (err) {
      setError(resolveWhatsAppErrorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function select(choice: WhatsAppGrantedChoiceDto) {
    if (!attemptId) return;
    setBusy(true);
    try {
      await selectWhatsAppConnection(attemptId, choice.wabaId, choice.phoneNumberId);
      setChoices([]);
      setAttemptId(null);
      await inbox.refresh();
    } catch (err) {
      setError(resolveWhatsAppErrorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    setBusy(true);
    try {
      if (inbox.simulationActive) {
        inbox.simulationSetConnection?.("LINKED_ACTIVE");
        setBusy(false);
        return;
      }
      await activateWhatsAppWebhook();
      await inbox.refresh();
    } catch (err) {
      setError(resolveWhatsAppErrorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      if (inbox.simulationActive) {
        inbox.simulationSetConnection?.("DISCONNECTED");
        setConfirmDisconnect(false);
        setBusy(false);
        return;
      }
      await disconnectWhatsAppConnection();
      setConfirmDisconnect(false);
      await inbox.refresh();
    } catch (err) {
      setError(resolveWhatsAppErrorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("manage.title")}
      description={t("manage.description")}
      closeLabel={t("templates.close")}
    >
      <div className={styles.body} data-testid="whatsapp-connection-settings">
        {caps.provider === "ULTRAMSG" ? (
          <p data-testid="whatsapp-provider-label">{t("manage.providerUltraMsg")}</p>
        ) : null}
        {caps.provider === "WHAPI" ? (
          <p data-testid="whatsapp-provider-label">{t("manage.providerWhapi")}</p>
        ) : null}
        <p>
          {t(`connection.status.${connection?.status === "DISCONNECTED" || !connection ? "disconnected" : connection.status}`)}
          {" · "}
          {t(`connection.webhook.${connection?.webhookStatus ?? "NOT_CONFIGURED"}`)}
        </p>
        {connection?.displayPhoneNumber ? <p dir="ltr">{connection.displayPhoneNumber}</p> : null}
        {connection?.verifiedName ? <p>{connection.verifiedName}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {caps.provider === "WHAPI" ? (
          <>
          <p>{t("manage.whapiHint")}</p>
          <FormBuilder<WhapiConfigureValues>
            key={whapiFormKey}
            schema={whapiConfigureSchema}
            defaultValues={{ token: "", channelId: "" }}
            fields={[
              {
                type: "password",
                name: "token",
                placeholder: t("manage.whapiToken"),
                autoComplete: "off",
              },
              {
                type: "text",
                name: "channelId",
                placeholder: t("manage.whapiChannel"),
                autoComplete: "off",
              },
            ]}
            submitLabel={linked ? t("manage.changeAccount") : t("manage.whapiSave")}
            submittingLabel={t("manage.whapiSaving")}
            submitDisabled={busy}
            onSubmit={saveWhapi}
          />
          {linked && !inbox.simulationActive ? (
            <div className={styles.historySync} data-testid="whatsapp-history-sync-panel">
              <p>{t("manage.historySyncPartial")}</p>
              {historySync?.status === "RUNNING" || historySync?.status === "QUEUED" ? (
                <p>{t("manage.historySyncRunning")}</p>
              ) : null}
              {historySync ? (
                <p>
                  {t("manage.historySyncModeHint", {
                    mode:
                      historySync.suggestedSyncMode === "INCREMENTAL"
                        ? t("manage.historySyncModeIncremental")
                        : t("manage.historySyncModeFull"),
                  })}
                </p>
              ) : null}
              {historySync?.lastSuccessfulSyncAt ? (
                <p>
                  {t("manage.historySyncLastAt", {
                    when: new Date(historySync.lastSuccessfulSyncAt).toLocaleString(),
                  })}
                </p>
              ) : null}
              {historySync && historySync.status !== "IDLE" ? (
                <p>
                  {t("manage.historySyncStats", {
                    imported: historySync.messagesImported,
                    chats: historySync.chatsCompleted,
                    skipped: historySync.chatsSkipped,
                  })}
                </p>
              ) : null}
              {historySync?.completedWithSkips && historySync.status === "COMPLETED" ? (
                <p>{t("manage.historySyncCompletedWithSkips")}</p>
              ) : null}
              {historySync?.status === "COMPLETED" ? <p>{t("manage.historySyncDone")}</p> : null}
              {historySync?.status === "FAILED" ? <p>{t("manage.historySyncFailed")}</p> : null}
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy || historySync?.status === "RUNNING"}
                  onClick={() => void runHistorySync()}
                >
                  {t("manage.historySync")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy || historySync?.status === "RUNNING"}
                  onClick={() => setConfirmForceFullSync(true)}
                >
                  {t("manage.historySyncForceFull")}
                </Button>
                {historySync?.status === "RUNNING" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void stopHistorySync()}
                  >
                    {t("manage.historySyncCancel")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          </>
        ) : null}
        {caps.supportsEmbeddedSignup && choices.length > 0 ? (
          <ul className={styles.choices}>
            {choices.map((choice) => (
              <li key={`${choice.wabaId}:${choice.phoneNumberId}`}>
                <Button type="button" variant="secondary" onClick={() => void select(choice)}>
                  {choice.verifiedName || choice.displayPhoneNumber} · {choice.displayPhoneNumber}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.actions}>
            {caps.provider === "WHAPI" ? null : (
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              data-testid="whatsapp-connect"
              onClick={() => {
                if (linked && !inbox.simulationActive) {
                  setConfirmChange(true);
                  return;
                }
                void connect();
              }}
            >
              {linked ? t("manage.changeAccount") : t("manage.connect")}
            </Button>
            )}
            {linked && banner === "qrRequired" ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => setQrOpen(true)}>
                {t("manage.showQr")}
              </Button>
            ) : null}
            {linked && banner === "webhookInactive" ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void activate()}>
                {t("manage.completeSetup")}
              </Button>
            ) : null}
            {linked ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setConfirmDisconnect(true)}
              >
                {t("manage.disconnect")}
              </Button>
            ) : null}
          </div>
        )}
        {qrOpen ? (
          <div className={styles.confirm} data-testid="whatsapp-qr-dialog">
            <p>{t("manage.qrHint")}</p>
            {qrImage ? (
              // QR is auth material: shown only while this manage dialog is open.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrImage} alt={t("manage.qrHint")} width={220} height={220} />
            ) : (
              <p>{t("manage.qrLoading")}</p>
            )}
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQrOpen(false);
                setQrImage(null);
              }}
            >
              {t("templates.close")}
            </Button>
          </div>
        ) : null}
        {confirmChange ? (
          <div className={styles.confirm}>
            <p>{t("manage.changeAccountConfirm")}</p>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setConfirmChange(false);
                void connect();
              }}
            >
              {t("manage.changeAccount")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmChange(false)}>
              {t("templates.back")}
            </Button>
          </div>
        ) : null}
        {confirmForceFullSync ? (
          <div className={styles.confirm}>
            <p>{t("manage.historySyncForceFullConfirm")}</p>
            <Button type="button" variant="primary" onClick={() => void runHistorySync("FULL")}>
              {t("manage.historySyncForceFull")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmForceFullSync(false)}>
              {t("templates.back")}
            </Button>
          </div>
        ) : null}
        {confirmDisconnect ? (
          <div className={styles.confirm}>
            <p>{t("manage.disconnectConfirm")}</p>
            <Button type="button" variant="primary" onClick={() => void disconnect()}>
              {t("manage.disconnect")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmDisconnect(false)}>
              {t("templates.back")}
            </Button>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
