"use client";

import styles from "./stage-success-transition.module.css";

interface StageSuccessTransitionProps {
  message: string;
}

export function StageSuccessTransition({ message }: StageSuccessTransitionProps) {
  return (
    <div
      className={styles.overlay}
      data-testid="stage-success-transition"
      role="status"
      aria-live="polite"
    >
      <div className={styles.content}>
        <div className={styles.symbolWrap}>
          <span className={styles.halo} aria-hidden />
          <svg
            className={styles.symbol}
            viewBox="0 0 100 100"
            aria-hidden
            data-testid="stage-success-svg"
          >
            <circle className={styles.ring} cx="50" cy="50" r="44" data-testid="stage-success-circle" />
            <path
              className={styles.check}
              d="M32 52 L45 65 L70 38"
              data-testid="stage-success-check"
            />
          </svg>
        </div>
        <p className={styles.message} data-testid="stage-success-message">{message}</p>
      </div>
    </div>
  );
}
