"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import type { IssuedContractLinkView } from "../../types/contract.types";
import styles from "./contract-link-result.module.css";

export interface ContractLinkResultProps {
  link: IssuedContractLinkView;
  onClose?: () => void;
}

export function ContractLinkResult({ link, onClose }: ContractLinkResultProps) {
  const t = useTranslations("Contracts.link");
  const format = useFormatter();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.root} data-testid="contract-link-result">
      <p className={styles.title}>
        {link.collectionMode === "CASH" ? t("createdCash") : t("created")}
      </p>
      <p className={styles.meta}>
        <span dir="ltr">{link.contractNumber}</span>
        {link.expiresAt ? (
          <>
            {" · "}
            {t("expires", {
              date: format.dateTime(new Date(link.expiresAt), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </>
        ) : null}
      </p>
      <div className={styles.linkbox}>
        <code dir="ltr">{link.url}</code>
      </div>
      <div className={styles.actions}>
        <Button type="button" size="md" onClick={() => void handleCopy()}>
          {copied ? t("copied") : t("copy")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => window.open(link.url, "_blank", "noopener,noreferrer")}
        >
          {t("open")}
        </Button>
        {onClose ? (
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            {t("done")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
