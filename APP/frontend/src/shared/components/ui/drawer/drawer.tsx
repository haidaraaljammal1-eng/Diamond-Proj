"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import styles from "./drawer.module.css";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Already-translated accessible name of the close button. */
  closeLabel: string;
  /** Optional eyebrow shown beside the close control (e.g. contract number). */
  heading?: string;
  children: ReactNode;
}

/**
 * Shared Diamond side drawer — Demo `#drawer` as an ivory operational panel.
 * Forms and list pages keep using `Dialog`; this is for long detail surfaces.
 */
export function Drawer({
  open,
  onClose,
  title,
  closeLabel,
  heading,
  children,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

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
    panelRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, handleKeyDown]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="shared-drawer"
      >
        <div className={styles.header}>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
          >
            {closeLabel}
          </button>
          {heading ? (
            <p className={styles.heading} dir="ltr">
              {heading}
            </p>
          ) : null}
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
        </div>
        <div className={styles.body}>{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
