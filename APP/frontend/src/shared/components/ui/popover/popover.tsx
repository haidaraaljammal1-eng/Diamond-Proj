"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./popover.module.css";

const PANEL_GAP = 8;

export interface PopoverRect {
  top: number;
  insetInlineStart: number;
  minWidth: number;
  flipped: boolean;
}

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: (props: {
    ref: React.RefObject<HTMLButtonElement | null>;
    id: string;
    "aria-expanded": boolean;
    "aria-controls": string | undefined;
    onClick: () => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
  }) => ReactNode;
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  disabled?: boolean;
  /** Max panel height before flipping above the trigger. */
  maxHeight?: number;
}

function measurePanel(
  trigger: HTMLElement,
  maxHeight: number,
): PopoverRect {
  const rect = trigger.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom;
  const above = rect.top;
  const flipped = below < maxHeight + PANEL_GAP && above > below;
  const dir = document.documentElement.getAttribute("dir") === "rtl" ? "rtl" : "ltr";
  const insetInlineStart =
    dir === "rtl" ? window.innerWidth - rect.right : rect.left;

  return {
    top: flipped ? rect.top - PANEL_GAP : rect.bottom + PANEL_GAP,
    insetInlineStart,
    minWidth: rect.width,
    flipped,
  };
}

/**
 * Shared anchored popover — body portal, outside dismiss, Escape close.
 * Mirrors the Diamond Select panel positioning model.
 */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  className,
  panelClassName,
  disabled = false,
  maxHeight = 520,
}: PopoverProps) {
  const reactId = useId();
  const controlId = `popover-${reactId}`;
  const panelId = `${controlId}-panel`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<PopoverRect | null>(null);

  const close = useCallback(
    (focusTrigger = true) => {
      onOpenChange(false);
      if (focusTrigger) triggerRef.current?.focus();
    },
    [onOpenChange],
  );

  const toggle = useCallback(() => {
    if (disabled) return;
    if (open) {
      close();
      return;
    }
    const el = triggerRef.current;
    if (el) setRect(measurePanel(el, maxHeight));
    onOpenChange(true);
  }, [close, disabled, maxHeight, onOpenChange, open]);

  useEffect(() => {
    if (!open) return;
    const sync = () => {
      const el = triggerRef.current;
      if (el) setRect(measurePanel(el, maxHeight));
    };
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [maxHeight, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [close, open]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open && (event.key === "Enter" || event.key === " " || event.key === "ArrowDown")) {
      event.preventDefault();
      toggle();
    }
  };

  const panel =
    open && rect
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="false"
            className={[
              styles.panel,
              rect.flipped ? styles.flipped : "",
              panelClassName ?? "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{
              top: rect.top,
              insetInlineStart: rect.insetInlineStart,
              minWidth: rect.minWidth,
              transform: rect.flipped ? "translateY(-100%)" : undefined,
            }}
          >
            {children}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={[styles.root, className ?? ""].filter(Boolean).join(" ")} data-open={open || undefined}>
      {trigger({
        ref: triggerRef,
        id: controlId,
        "aria-expanded": open,
        "aria-controls": open ? panelId : undefined,
        onClick: toggle,
        onKeyDown: handleKeyDown,
      })}
      {panel}
    </div>
  );
}
