"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import styles from "./rental-header.module.css";

interface RentalHeaderProps {
  officeName: string;
}

export function RentalHeader({ officeName }: RentalHeaderProps) {
  const t = useTranslations("PublicRental");

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
