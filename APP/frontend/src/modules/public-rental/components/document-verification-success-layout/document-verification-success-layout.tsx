"use client";

import type { ReactNode } from "react";
import { Icon } from "@/shared/components/ui/icon/icon";
import styles from "./document-verification-success-layout.module.css";

interface DocumentVerificationSuccessLayoutProps {
  testId: string;
  title: string;
  previewUrl: string | null;
  previewAlt: string;
  previewTestId: string;
  children: ReactNode;
}

export function DocumentVerificationSuccessLayout({
  testId,
  title,
  previewUrl,
  previewAlt,
  previewTestId,
  children,
}: DocumentVerificationSuccessLayoutProps) {
  return (
    <div className={styles.stack} data-testid={testId}>
      <div className={styles.successCard}>
        <div className={styles.successHead}>
          <Icon name="mdi:check-circle-outline" size={22} className={styles.successIcon} aria-hidden />
          <p className={styles.successTitle}>{title}</p>
        </div>
        <div className={styles.facts}>{children}</div>
      </div>
      {!previewUrl ? null : (
        <div className={styles.previewCard} data-testid={`${previewTestId}-frame`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- blob or token-scoped preview */}
          <img
            src={previewUrl}
            alt={previewAlt}
            className={styles.previewImage}
            data-testid={previewTestId}
          />
        </div>
      )}
    </div>
  );
}
