"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import styles from "./dialog.module.css";

export interface DialogProps {
  open: boolean;
  /** Closing is always the caller's decision (Escape, scrim, close button). */
  onClose: () => void;
  /** Already-translated dialog title. */
  title: string;
  /** Already-translated supporting line under the title. */
  description?: string;
  /** Already-translated accessible name of the close button. */
  closeLabel: string;
  children: ReactNode;
}

/**
 * Shared Diamond dialog — the Demo modal (`.scrim` / `.modal` / `.mclose`).
 *
 * It owns overlay, framing, entrance motion, Escape/scrim dismissal, focus
 * handling and body scroll locking. It knows nothing about forms, APIs, stores
 * or permissions: callers pass final, translated text and their own content.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  closeLabel,
  children,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previouslyFocused = document.activeElement;
    dialogRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, handleKeyDown]);

  // Portalled to <body>: the AppShell content sits in its own stacking context,
  // so an overlay rendered inside it would paint under the header and the rail.
  // A closed dialog renders nothing, so the server never renders the portal.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <button
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label={closeLabel}
        >
          <span aria-hidden="true">✕</span>
        </button>
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
        {description ? (
          <p id={descriptionId} className={styles.description}>
            {description}
          </p>
        ) : null}
        {children}
      </div>
    </div>,
    document.body,
  );
}
