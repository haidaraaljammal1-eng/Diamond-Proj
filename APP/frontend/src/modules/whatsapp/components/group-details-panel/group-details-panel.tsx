"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { Icon } from "@/shared/components/ui/icon";
import { getWhatsAppGroupContext } from "../../api/whatsapp.api";
import type { WhatsAppGroupContextDto } from "../../types/whatsapp.types";
import { resolveWhatsAppErrorMessage } from "../../utils/resolve-whatsapp-error";
import styles from "./group-details-panel.module.css";

export function WhatsAppGroupDetailsPanel({
  conversationId,
  open,
  onToggle,
}: {
  conversationId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("WhatsApp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<WhatsAppGroupContextDto | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getWhatsAppGroupContext(conversationId)
      .then((data) => {
        if (!cancelled) setContext(data);
      })
      .catch((err) => {
        if (!cancelled) setError(resolveWhatsAppErrorMessage(t, err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, open]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={styles.trigger}
        onClick={onToggle}
        aria-expanded={open}
        data-testid="whatsapp-group-details-trigger"
      >
        <Icon name="mdi:account-group-outline" size={18} />
        <span>{t("group.details")}</span>
      </Button>
      <Dialog
        open={open}
        onClose={onToggle}
        title={t("group.details")}
        closeLabel={t("group.close")}
      >
        <div className={styles.body}>
          {loading ? <p className={styles.muted}>{t("group.loading")}</p> : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {context ? (
            <>
              <p className={styles.title}>{context.groupName ?? t("group.unnamed")}</p>
              <p className={styles.muted}>
                {t("group.participantCount", { count: context.participantCount })}
              </p>
              <ul className={styles.list}>
                {context.participants.map((member) => (
                  <li key={member.providerId}>
                    <span className={styles.memberName}>
                      {member.displayName?.trim() || t("group.unknownMember")}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
