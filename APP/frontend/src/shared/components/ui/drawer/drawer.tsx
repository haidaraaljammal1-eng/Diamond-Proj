"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { Icon } from "@/shared/components/ui/icon";
import styles from "./drawer.module.css";

export type DrawerAnchor = "left" | "right";
export type DrawerWidth = "default" | "compact";
export type DrawerClosePresentation = "text" | "icon";
export type DrawerHeaderTone = "default" | "minimal";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Already-translated accessible name of the close button. */
  closeLabel: string;
  /** Optional eyebrow shown beside the close control (e.g. contract number). */
  heading?: string;
  /** Physical screen edge — `left` stays left even in RTL (e.g. GPS fleet detail). */
  anchor?: DrawerAnchor;
  /** `compact` ≈ 450px; default matches the standard operational drawer. */
  width?: DrawerWidth;
  closePresentation?: DrawerClosePresentation;
  /** Slim top chrome — icon close only (e.g. GPS fleet detail). */
  headerTone?: DrawerHeaderTone;
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
  anchor = "right",
  width = "default",
  closePresentation = "text",
  headerTone = "default",
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
        className={[
          styles.panel,
          anchor === "left" ? styles.panelLeft : "",
          width === "compact" ? styles.panelCompact : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-drawer-anchor={anchor}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="shared-drawer"
      >
        <div
          className={[
            styles.header,
            headerTone === "minimal" ? styles.headerMinimal : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <button
            type="button"
            className={
              closePresentation === "icon" ? styles.closeIcon : styles.close
            }
            onClick={onClose}
            aria-label={closeLabel}
          >
            {closePresentation === "icon" ? (
              <Icon name="mdi:close" size={18} aria-hidden />
            ) : (
              closeLabel
            )}
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
        <div
          className={[
            styles.body,
            width === "compact" ? styles.bodyCompact : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {children}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
