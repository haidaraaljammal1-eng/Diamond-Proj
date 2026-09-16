"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import styles from "./return-header.module.css";

interface ReturnHeaderProps {
  officeName: string;
}

export function ReturnHeader({ officeName }: ReturnHeaderProps) {
  const t = useTranslations("PublicReturn");

  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <Image
          src="/diamond-logo.png"
          alt={t("brandAlt")}
          width={160}
          height={85}
          className={styles.logo}
          priority
        />
        <div className={styles.brandMeta}>
          <span className={styles.office}>{officeName}</span>
          <span className={styles.tagline}>{t("tagline")}</span>
        </div>
      </div>
    </header>
  );
}
