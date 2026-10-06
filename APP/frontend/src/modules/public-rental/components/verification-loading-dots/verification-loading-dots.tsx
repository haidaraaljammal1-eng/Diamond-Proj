"use client";

import styles from "./verification-loading-dots.module.css";

export function VerificationLoadingDots() {
  return (
    <span className={styles.dots} data-testid="verification-loading-dots" aria-hidden>
      {Array.from({ length: 4 }, (_, index) => (
        <span key={index} className={styles.dot} />
      ))}
    </span>
  );
}

interface VerificationProcessingStatusProps {
  message: string;
}

/** Processing copy with inline four-dot wave (licence / passport OCR). */
export function VerificationProcessingStatus({ message }: VerificationProcessingStatusProps) {
  return (
    <div className={styles.row}>
      <p className={styles.message}>{message}</p>
      <VerificationLoadingDots />
    </div>
  );
}
