"use client";

import { useEffect, useState } from "react";
import { fetchWhatsAppConversationAvatarObjectUrl } from "../../api/whatsapp.api";
import styles from "./contact-avatar.module.css";

export function WhatsAppContactAvatar({
  conversationId,
  hasAvatar,
  fallbackLabel,
  className,
}: {
  conversationId: string;
  hasAvatar: boolean;
  fallbackLabel: string;
  className?: string;
}) {
  const initial = fallbackLabel.trim().charAt(0) || "#";
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!hasAvatar || failed) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    void fetchWhatsAppConversationAvatarObjectUrl(conversationId)
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
  }, [conversationId, hasAvatar, failed]);

  const rootClass = [styles.avatar, className].filter(Boolean).join(" ");

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={rootClass} src={url} alt="" aria-hidden="true" loading="lazy" decoding="async" />
    );
  }

  return (
    <span className={rootClass} aria-hidden="true">
      {initial}
    </span>
  );
}
