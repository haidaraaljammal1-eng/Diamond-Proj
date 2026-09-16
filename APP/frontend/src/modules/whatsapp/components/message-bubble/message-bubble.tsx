"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import { fetchWhatsAppMediaObjectUrl } from "../../api/whatsapp.api";
import type { WhatsAppMessageDto, WhatsAppMessageType } from "../../types/whatsapp.types";
import { messageTimestamp, outboundUiStatus, toValidDate } from "../../utils/whatsapp-view-model";
import { useWhatsApp } from "../../hooks/use-whatsapp";
import styles from "./message-bubble.module.css";

const PLACEHOLDER_ICONS: Record<Exclude<WhatsAppMessageType, "TEXT" | "TEMPLATE">, string> = {
  IMAGE: "mdi:image-outline",
  DOCUMENT: "mdi:file-document-outline",
  AUDIO: "mdi:microphone-outline",
  VIDEO: "mdi:video-outline",
  LOCATION: "mdi:map-marker-outline",
  CONTACTS: "mdi:account-outline",
  INTERACTIVE: "mdi:gesture-tap-button",
  REACTION: "mdi:emoticon-outline",
  STICKER: "mdi:sticker-emoji",
  UNKNOWN: "mdi:message-alert-outline",
};

function ProtectedMedia({
  message,
  kind,
}: {
  message: WhatsAppMessageDto;
  kind: "IMAGE" | "AUDIO" | "VIDEO" | "DOCUMENT" | "STICKER";
}) {
  const t = useTranslations("WhatsApp");
  const simulation = useWhatsApp().simulationActive;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (simulation || !message.hasProtectedMedia) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void fetchWhatsAppMediaObjectUrl(message.id)
      .then((next) => {
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        objectUrl = next;
        setUrl(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.id, message.hasProtectedMedia, simulation]);

  if (simulation) {
    return (
      <div className={styles.simMedia} data-testid="whatsapp-sim-media">
        <Icon name={PLACEHOLDER_ICONS[kind]} size={18} />
        <span>{t(`messageType.${kind}`)}</span>
      </div>
    );
  }
  if (failed || (!message.hasProtectedMedia && !url)) {
    return <p className={styles.placeBody}>{t("message.mediaUnavailable")}</p>;
  }
  if (!url) return <p className={styles.placeBody}>{t("message.mediaLoading")}</p>;
  if (kind === "IMAGE" || kind === "STICKER") {
    return <img className={styles.mediaImg} src={url} alt={message.caption || t(`messageType.${kind}`)} />;
  }
  if (kind === "AUDIO") {
    return <audio className={styles.player} controls preload="none" src={url} />;
  }
  if (kind === "VIDEO") {
    return <video className={styles.player} controls preload="metadata" src={url} />;
  }
  return (
    <a className={styles.download} href={url} download={message.mediaFilename || "file"}>
      {t("media.download")}
    </a>
  );
}

export function WhatsAppMessageBubble({ message }: { message: WhatsAppMessageDto }) {
  const t = useTranslations("WhatsApp");
  const format = useFormatter();
  const outbound = message.direction === "OUTBOUND";
  const when = toValidDate(messageTimestamp(message));
  const className = [styles.bubble, outbound ? styles.out : styles.in].join(" ");

  return (
    <article
      className={className}
      data-testid="whatsapp-message"
      data-direction={message.direction}
      data-type={message.messageType}
      data-send-state={message.sendState ?? undefined}
    >
      {message.messageType === "TEXT" ? (
        <p className={styles.text} dir="auto">
          {message.textBody ?? ""}
        </p>
      ) : message.messageType === "TEMPLATE" ? (
        <div>
          <p className={styles.placeTitle}>{message.templateName || t("templates.title")}</p>
          {message.templateLanguage ? (
            <p className={styles.placeBody}>{message.templateLanguage}</p>
          ) : null}
          <p className={styles.text} dir="auto">
            {message.templatePreview || message.textBody || ""}
          </p>
        </div>
      ) : message.messageType === "IMAGE" ||
        message.messageType === "STICKER" ||
        message.messageType === "AUDIO" ||
        message.messageType === "VIDEO" ||
        message.messageType === "DOCUMENT" ? (
        <div className={styles.placeholder}>
          <Icon name={PLACEHOLDER_ICONS[message.messageType]} size={18} />
          <div className={styles.mediaBody}>
            <p className={styles.placeTitle}>
              {message.mediaFilename || t(`messageType.${message.messageType}`)}
            </p>
            <ProtectedMedia message={message} kind={message.messageType} />
            {message.caption ? (
              <p className={styles.text} dir="auto">
                {message.caption}
              </p>
            ) : null}
          </div>
        </div>
      ) : message.messageType === "LOCATION" ? (
        <div>
          <p className={styles.placeTitle}>{t("messageType.LOCATION")}</p>
          <p className={styles.placeBody}>
            {[message.location?.name, message.location?.address]
              .filter(Boolean)
              .join(" · ") ||
              `${message.location?.latitude ?? ""}, ${message.location?.longitude ?? ""}`}
          </p>
        </div>
      ) : message.messageType === "CONTACTS" ? (
        <div>
          <p className={styles.placeTitle}>{t("messageType.CONTACTS")}</p>
          {(message.contacts ?? []).map((contact, index) => (
            <p key={index} className={styles.placeBody}>
              {contact.formattedName || contact.phones.join(", ")}
            </p>
          ))}
        </div>
      ) : message.messageType === "REACTION" ? (
        <p className={styles.text}>{message.reaction?.emoji || t("messageType.REACTION")}</p>
      ) : message.messageType === "INTERACTIVE" ? (
        <div>
          <p className={styles.placeTitle}>{t("messageType.INTERACTIVE")}</p>
          <p className={styles.placeBody}>{message.interactive?.title || message.interactive?.kind}</p>
        </div>
      ) : (
        <div className={styles.placeholder}>
          <Icon name={PLACEHOLDER_ICONS.UNKNOWN} size={18} />
          <p className={styles.placeTitle}>{t("message.unsupported")}</p>
        </div>
      )}
      <footer className={styles.meta}>
        {when ? (
          <time dateTime={when.toISOString()}>
            {format.dateTime(when, { hour: "2-digit", minute: "2-digit" })}
          </time>
        ) : null}
        {outbound ? (
          <span className={styles.status} data-testid="whatsapp-message-status">
            {(() => {
              const status = outboundUiStatus(message);
              return status ? t(`status.${status}`) : null;
            })()}
          </span>
        ) : null}
      </footer>
    </article>
  );
}
