"use client";

import { Icon } from "@/shared/components/ui/icon/icon";
import styles from "./verified-document-value.module.css";

interface VerifiedDocumentValueProps {
  label: string;
  value: string;
  testId: string;
  ltr?: boolean;
}

/** Read-only verified field — not an editable control. */
export function VerifiedDocumentValue({
  label,
  value,
  testId,
  ltr = false,
}: VerifiedDocumentValueProps) {
  return (
    <div className={styles.field} data-testid={testId}>
      <div className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        <Icon name="mdi:shield-check-outline" size={14} className={styles.verifiedIcon} aria-hidden />
      </div>
      <p className={styles.value} dir={ltr ? "ltr" : undefined}>{value}</p>
    </div>
  );
}
