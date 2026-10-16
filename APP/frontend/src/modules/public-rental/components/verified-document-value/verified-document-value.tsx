"use client";

import { Icon } from "@/shared/components/ui/icon/icon";
import styles from "./verified-document-value.module.css";

interface VerifiedDocumentValueProps {
  label: string;
  value: string;
  testId: string;
  ltr?: boolean;
}

/** Read-only verified field — label (with icon) on the right, value on the left. */
export function VerifiedDocumentValue({
  label,
  value,
  testId,
  ltr = false,
}: VerifiedDocumentValueProps) {
  return (
    <div className={styles.field} data-testid={testId}>
      <div className={styles.labelRow}>
        <Icon name="mdi:shield-check-outline" size={14} className={styles.verifiedIcon} aria-hidden />
        <span className={styles.label}>{label}</span>
      </div>
      <p className={styles.value} dir={ltr ? "ltr" : "auto"}>{value}</p>
    </div>
  );
}
