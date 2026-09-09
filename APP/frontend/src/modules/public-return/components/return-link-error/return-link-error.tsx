"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Card } from "@/shared/components/ui/card/card";
import styles from "./return-link-error.module.css";

interface ReturnLinkErrorProps {
  reason: string | null;
}

export function ReturnLinkError({ reason }: ReturnLinkErrorProps) {
  const t = useTranslations("PublicReturn");
  const key =
    reason === "CONTRACT_LINK_EXPIRED" ||
    reason === "CONTRACT_LINK_INVALID" ||
    reason === "CONTRACT_LINK_USED"
      ? reason
      : "generic";
  const titleKey = `link.${key}.title` as const;
  const bodyKey = `link.${key}.body` as const;

  return (
    <div className={styles.page} data-testid="return-link-error">
      <Card className={styles.card}>
        <Image
          src="/diamond-logo.png"
          alt={t("brandAlt")}
          width={180}
          height={96}
          className={styles.logo}
          priority
        />
        <h1 className={styles.title}>{t(titleKey)}</h1>
        <p className={styles.body}>{t(bodyKey)}</p>
      </Card>
    </div>
  );
}
