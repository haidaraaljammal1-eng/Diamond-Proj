"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { DataSearch } from "@/shared/components/data-search";
import { listWhatsAppContactProfiles, listWhatsAppConversations } from "@/modules/whatsapp/api/whatsapp.api";
import type { WhatsAppContactProfileListItemDto } from "@/modules/whatsapp/types/whatsapp.types";
import type { WhatsAppConversationListItemDto } from "@/modules/whatsapp/types/whatsapp.types";
import type { VehicleImageDto } from "../../types/vehicle.types";
import { shareVehicleGalleryWhatsApp } from "../../api/vehicles.api";
import type { VehicleWhatsAppShareResultDto } from "../../types/vehicle.types";
import { resolveVehiclesErrorMessage } from "../../utils/resolve-vehicles-error";
import { VehicleImage } from "../vehicle-image/vehicle-image";
import styles from "./vehicle-whatsapp-share-dialog.module.css";

export type VehicleWhatsAppShareRecipient =
  | { kind: "conversation"; conversationId: string; label: string }
  | { kind: "contact"; providerContactId: string; label: string };

export interface VehicleWhatsAppShareDialogProps {
  open: boolean;
  vehicleId: number;
  vehicleLabel: string;
  gallery: VehicleImageDto[];
  onClose: () => void;
}

export function VehicleWhatsAppShareDialog({
  open,
  vehicleId,
  vehicleLabel,
  gallery,
  onClose,
}: VehicleWhatsAppShareDialogProps) {
  const t = useTranslations("Vehicles");
  const [search, setSearch] = useState("");
  const [conversations, setConversations] = useState<WhatsAppConversationListItemDto[]>([]);
  const [contacts, setContacts] = useState<WhatsAppContactProfileListItemDto[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [recipient, setRecipient] = useState<VehicleWhatsAppShareRecipient | null>(null);
  const [sending, setSending] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VehicleWhatsAppShareResultDto | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  const photos = useMemo(
    () => [...gallery].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 4),
    [gallery],
  );

  const resetState = useCallback(() => {
    setSearch("");
    setRecipient(null);
    setSending(false);
    setProgressLabel(null);
    setError(null);
    setResult(null);
    idempotencyKeyRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
      return;
    }
    let cancelled = false;
    setLoadingRecipients(true);
    void (async () => {
      try {
        const [convoPage, contactPage] = await Promise.all([
          listWhatsAppConversations({
            page: 1,
            pageSize: 30,
            search,
            unread: false,
          }),
          listWhatsAppContactProfiles({ page: 1, pageSize: 30, search: search || undefined }),
        ]);
        if (cancelled) return;
        setConversations(convoPage.data.filter((row) => row.kind === "DIRECT"));
        setContacts(contactPage.data);
      } catch {
        if (!cancelled) {
          setConversations([]);
          setContacts([]);
        }
      } finally {
        if (!cancelled) setLoadingRecipients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, search]);

  function handleClose() {
    if (sending) return;
    onClose();
  }

  async function handleSend() {
    if (!recipient || sending || photos.length === 0) return;
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    setSending(true);
    setError(null);
    setResult(null);
    setProgressLabel(t("whatsappShare.sendingProgress", { current: 0, total: photos.length }));
    try {
      const payload =
        recipient.kind === "conversation"
          ? { conversationId: recipient.conversationId }
          : { providerContactId: recipient.providerContactId };
      const data = await shareVehicleGalleryWhatsApp(
        vehicleId,
        idempotencyKeyRef.current,
        payload,
      );
      setResult(data);
      setProgressLabel(null);
    } catch (err) {
      setError(resolveVehiclesErrorMessage(t, err as import("@/infrastructure/api/errors").ApiRequestError));
      setProgressLabel(null);
    } finally {
      setSending(false);
    }
  }

  const sentCount = result?.results.filter((r) => r.status === "SENT").length ?? 0;
  const failedCount = result?.results.filter((r) => r.status === "FAILED").length ?? 0;
  const uncertainCount = result?.results.filter((r) => r.status === "UNCERTAIN").length ?? 0;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t("whatsappShare.title")}
      description={t("whatsappShare.description")}
      closeLabel={t("detail.close")}
    >
      <div className={styles.body} data-testid="vehicle-whatsapp-share-dialog">
        <DataSearch
          className={styles.search}
          appliedValue={search}
          onSearch={(next) => setSearch(next)}
          onClear={() => setSearch("")}
          placeholder={t("whatsappShare.searchPlaceholder")}
          inputLabel={t("whatsappShare.searchPlaceholder")}
          searchButtonLabel={t("whatsappShare.search")}
          clearButtonLabel={t("whatsappShare.clearSearch")}
          embedded
        />

        <div className={styles.panels}>
          <section className={styles.panel} aria-labelledby="vehicle-wa-share-conversations">
            <p id="vehicle-wa-share-conversations" className={styles.panelTitle}>
              {t("whatsappShare.conversations")}
            </p>
            <ul className={styles.list} data-testid="vehicle-wa-share-conversation-list">
              {loadingRecipients ? (
                <li className={styles.empty}>{t("whatsappShare.loading")}</li>
              ) : conversations.length === 0 ? (
                <li className={styles.empty}>{t("whatsappShare.noConversations")}</li>
              ) : (
                conversations.map((row) => {
                  const selected =
                    recipient?.kind === "conversation" && recipient.conversationId === row.id;
                  return (
                    <li key={row.id} className={styles.listItem}>
                      <button
                        type="button"
                        className={`${styles.choice} ${selected ? styles.choiceSelected : ""}`}
                        onClick={() =>
                          setRecipient({
                            kind: "conversation",
                            conversationId: row.id,
                            label: row.displayTitle,
                          })
                        }
                      >
                        <span className={styles.choiceTitle}>{row.displayTitle}</span>
                        <span className={styles.choiceMeta} dir="ltr">{row.customerWaId}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          <section className={styles.panel} aria-labelledby="vehicle-wa-share-contacts">
            <p id="vehicle-wa-share-contacts" className={styles.panelTitle}>
              {t("whatsappShare.contacts")}
            </p>
            <ul className={styles.list} data-testid="vehicle-wa-share-contact-list">
              {loadingRecipients ? (
                <li className={styles.empty}>{t("whatsappShare.loading")}</li>
              ) : contacts.length === 0 ? (
                <li className={styles.empty}>{t("whatsappShare.noContacts")}</li>
              ) : (
                contacts.map((row) => {
                  const label = row.displayName?.trim() || row.providerContactId;
                  const selected =
                    recipient?.kind === "contact" &&
                    recipient.providerContactId === row.providerContactId;
                  return (
                    <li key={row.id} className={styles.listItem}>
                      <button
                        type="button"
                        className={`${styles.choice} ${selected ? styles.choiceSelected : ""}`}
                        onClick={() =>
                          setRecipient({
                            kind: "contact",
                            providerContactId: row.providerContactId,
                            label,
                          })
                        }
                      >
                        <span className={styles.choiceTitle}>{label}</span>
                        <span className={styles.choiceMeta} dir="ltr">{row.providerContactId}</span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        </div>

        <p className={styles.summary}>
          {recipient
            ? t("whatsappShare.selectedRecipient", { name: recipient.label })
            : t("whatsappShare.selectRecipient")}
        </p>

        <div className={styles.preview} data-testid="vehicle-wa-share-photo-preview">
          {photos.map((photo) => (
            <VehicleImage
              key={photo.id}
              path={photo.url}
              alt={vehicleLabel}
              className={styles.thumb}
            />
          ))}
        </div>

        {progressLabel ? <p className={styles.progress} role="status">{progressLabel}</p> : null}
        {error ? (
          <p className={styles.error} role="status" data-testid="vehicle-wa-share-error">
            {error}
          </p>
        ) : null}
        {result ? (
          <div data-testid="vehicle-wa-share-result">
            <p className={styles.summary}>
              {t("whatsappShare.resultSummary", {
                sent: sentCount,
                failed: failedCount,
                uncertain: uncertainCount,
              })}
            </p>
            <ul className={styles.resultList}>
              {result.results.map((row) => (
                <li key={row.photoId}>
                  {row.status === "SENT"
                    ? t("whatsappShare.photoSent", { id: row.photoId.slice(0, 8) })
                    : row.status === "UNCERTAIN"
                      ? t("whatsappShare.photoUncertain", { id: row.photoId.slice(0, 8) })
                      : t("whatsappShare.photoFailed", {
                          id: row.photoId.slice(0, 8),
                          reason: row.reason ?? "FAILED",
                        })}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={styles.actions}>
          <Button type="button" variant="secondary" size="sm" disabled={sending} onClick={handleClose}>
            {result ? t("detail.close") : t("whatsappShare.cancel")}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!recipient || sending || photos.length === 0 || result != null}
            loading={sending}
            data-testid="vehicle-wa-share-confirm"
            onClick={() => void handleSend()}
          >
            {t("whatsappShare.send")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
