"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import styles from "./renewal-header.module.css";

interface RenewalHeaderProps {
  officeName: string;
}

export function RenewalHeader({ officeName }: RenewalHeaderProps) {
  const t = useTranslations("PublicRenewal");

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
