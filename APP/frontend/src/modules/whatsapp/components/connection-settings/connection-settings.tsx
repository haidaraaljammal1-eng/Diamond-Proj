"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import {
  activateWhatsAppWebhook,
  authorizeWhatsAppConnectionAttempt,
  disconnectWhatsAppConnection,
  selectWhatsAppConnection,
  startWhatsAppConnectionAttempt,
} from "../../api/whatsapp.api";
import type { WhatsAppConnectionDto, WhatsAppGrantedChoiceDto } from "../../types/whatsapp.types";
import { resolveWhatsAppErrorMessage } from "../../utils/resolve-whatsapp-error";
import { connectionBanner } from "../../utils/whatsapp-view-model";
import { useWhatsApp } from "../../hooks/use-whatsapp";
import styles from "./connection-settings.module.css";

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
  const linked = connection && connection.status !== "DISCONNECTED";
  const banner = connectionBanner(connection);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      if (inbox.simulationActive) {
        inbox.simulationSetConnection?.("LINKED_ACTIVE");
        setBusy(false);
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
        <p>
          {t(`connection.status.${connection?.status === "DISCONNECTED" || !connection ? "disconnected" : connection.status}`)}
          {" · "}
          {t(`connection.webhook.${connection?.webhookStatus ?? "NOT_CONFIGURED"}`)}
        </p>
        {connection?.displayPhoneNumber ? <p dir="ltr">{connection.displayPhoneNumber}</p> : null}
        {connection?.verifiedName ? <p>{connection.verifiedName}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
        {choices.length > 0 ? (
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
