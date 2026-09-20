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
  maxHeight: number;
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
  /** Align the panel to the trigger start or end edge. */
  align?: "start" | "end";
  /** Max panel height before flipping above the trigger. */
  maxHeight?: number;
  /** Known panel width prevents a first-frame position correction. */
  panelWidth?: number;
}

function measurePanel(
  trigger: HTMLElement,
  maxHeight: number,
  align: "start" | "end",
  panelWidth?: number,
): PopoverRect {
  const rect = trigger.getBoundingClientRect();
  const viewportPadding = 12;
  const below = Math.max(0, window.innerHeight - rect.bottom - PANEL_GAP - viewportPadding);
  const above = Math.max(0, rect.top - PANEL_GAP - viewportPadding);
  const flipped = below < maxHeight && above > below;
  const dir = document.documentElement.getAttribute("dir") === "rtl" ? "rtl" : "ltr";
  const width = Math.min(
    panelWidth ?? (window.innerWidth <= 768 ? 420 : 760),
    window.innerWidth - 24,
  );
  const preferredLeft =
    dir === "rtl"
      ? align === "end"
        ? rect.left
        : rect.right - width
      : align === "end"
        ? rect.right - width
        : rect.left;
  const left = Math.max(12, Math.min(preferredLeft, window.innerWidth - width - 12));
  const insetInlineStart = dir === "rtl" ? window.innerWidth - left - width : left;

  return {
    top: flipped ? rect.top - PANEL_GAP : rect.bottom + PANEL_GAP,
    insetInlineStart,
    minWidth: rect.width,
    maxHeight: Math.max(120, Math.min(maxHeight, flipped ? above : below)),
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
  align = "start",
  maxHeight = 520,
  panelWidth,
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
    if (el) setRect(measurePanel(el, maxHeight, align, panelWidth ?? panelRef.current?.offsetWidth));
    onOpenChange(true);
  }, [align, close, disabled, maxHeight, onOpenChange, open, panelWidth]);

  useEffect(() => {
    if (!open) return;
    const sync = () => {
      const el = triggerRef.current;
      if (el) setRect(measurePanel(el, maxHeight, align, panelWidth ?? panelRef.current?.offsetWidth));
    };
    const frame = window.requestAnimationFrame(sync);
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [align, maxHeight, open, panelWidth]);

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
              maxHeight: rect.maxHeight,
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
