"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { SelectOption, SelectProps } from "./select.types";
import styles from "./select.module.css";

const PANEL_MAX_HEIGHT = 300;
const PANEL_GAP = 6;

interface PanelRect {
  top: number;
  left: number;
  width: number;
  flipped: boolean;
}

function measure(trigger: HTMLElement): PanelRect {
  const r = trigger.getBoundingClientRect();
  const below = window.innerHeight - r.bottom;
  const above = r.top;
  const flipped = below < PANEL_MAX_HEIGHT + PANEL_GAP && above > below;
  return {
    top: flipped ? r.top - PANEL_GAP : r.bottom + PANEL_GAP,
    left: r.left,
    width: r.width,
    flipped,
  };
}

/**
 * Select — the Diamond listbox.
 *
 * The single dropdown of the system: every select-like control (forms,
 * lookups, filters, shell chrome) uses this instead of a native `<select>`,
 * whose popup is painted by the OS and cannot carry the Pearl Ivory identity.
 *
 * The panel renders in a body portal so it is never clipped by a scrolling
 * ancestor (the topbar, tables, dialogs) and never inherits its stacking order.
 */
export function Select<T extends string = string>({
  options,
  value = null,
  onChange,
  onBlur,
  placeholder,
  variant = "field",
  size = "md",
  icon,
  searchable = false,
  clearable = false,
  disabled = false,
  invalid = false,
  name,
  id,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: SelectProps<T>) {
  const t = useTranslations("Select");
  const reactId = useId();
  const controlId = id ?? `select-${reactId}`;
  const listboxId = `${controlId}-listbox`;

  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<PanelRect | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [query, setQuery] = useState("");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ buffer: "", at: 0 });

  const selected = useMemo(
    () => options.find((o) => o.value === value) ?? null,
    [options, value],
  );

  const visible = useMemo(() => {
    if (!searchable || query.trim() === "") return options;
    const q = query.trim().toLocaleLowerCase();
    return options.filter(
      (o) =>
        o.label.toLocaleLowerCase().includes(q) ||
        (o.hint?.toLocaleLowerCase().includes(q) ?? false),
    );
  }, [options, query, searchable]);

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const openPanel = useCallback(
    (startAt: "selected" | "last" = "selected") => {
      if (disabled) return;
      const trigger = triggerRef.current;
      if (!trigger) return;
      setRect(measure(trigger));

      const selectedIndex = options.findIndex((o) => o.value === value);
      const firstEnabled = options.findIndex((o) => !o.disabled);
      const lastEnabled = options.reduce(
        (acc, o, i) => (o.disabled ? acc : i),
        -1,
      );
      setActiveIndex(
        startAt === "last"
          ? lastEnabled
          : selectedIndex >= 0
            ? selectedIndex
            : firstEnabled,
      );
      setOpen(true);
    },
    [disabled, options, value],
  );

  const commit = useCallback(
    (option: SelectOption<T>) => {
      if (option.disabled) return;
      onChange?.(option.value);
      close();
    },
    [close, onChange],
  );

  /** Moves the active row, skipping disabled options and wrapping around. */
  const move = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      let next = activeIndex;
      for (let step = 0; step < visible.length; step += 1) {
        next = (next + delta + visible.length) % visible.length;
        if (!visible[next]?.disabled) break;
      }
      setActiveIndex(next);
    },
    [activeIndex, visible],
  );

  /* Keep the portalled panel glued to the trigger while the page moves. */
  useEffect(() => {
    if (!open) return;
    const sync = () => {
      const trigger = triggerRef.current;
      if (trigger) setRect(measure(trigger));
    };
    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);
    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [open]);

  /* Dismiss on any pointer landing outside the trigger and the panel. */
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close(false);
      onBlur?.();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close, onBlur]);

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  /* Keep the active row inside the scrollport. */
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    panelRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;

    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openPanel(e.key === "ArrowUp" ? "last" : "selected");
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(visible.findIndex((o) => !o.disabled));
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(
          visible.reduce((acc, o, i) => (o.disabled ? acc : i), -1),
        );
        break;
      case "Enter":
      case " ": {
        if (e.key === " " && searchable) return; // space belongs to the query
        e.preventDefault();
        const option = visible[activeIndex];
        if (option) commit(option);
        break;
      }
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close(false);
        onBlur?.();
        break;
      default: {
        if (searchable || e.key.length !== 1) return;
        const now = Date.now();
        const buffer =
          now - typeahead.current.at > 700
            ? e.key
            : typeahead.current.buffer + e.key;
        typeahead.current = { buffer, at: now };
        const hit = visible.findIndex(
          (o) =>
            !o.disabled &&
            o.label.toLocaleLowerCase().startsWith(buffer.toLocaleLowerCase()),
        );
        if (hit >= 0) setActiveIndex(hit);
      }
    }
  }

  const panel =
    open && rect
      ? createPortal(
          <div
            ref={panelRef}
            className={`${styles.panel} ${rect.flipped ? styles.flipped : ""}`}
            style={{
              top: rect.top,
              left: rect.left,
              minWidth: rect.width,
              maxHeight: PANEL_MAX_HEIGHT,
            }}
          >
            {searchable && (
              <div className={styles.search}>
                <input
                  ref={searchRef}
                  type="text"
                  className={styles.searchInput}
                  value={query}
                  placeholder={t("searchPlaceholder")}
                  aria-label={t("searchPlaceholder")}
                  aria-controls={listboxId}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                />
              </div>
            )}

            <ul
              id={listboxId}
              role="listbox"
              className={styles.list}
              aria-label={ariaLabel ?? placeholder ?? t("placeholder")}
            >
              {visible.map((option, index) => (
                <li
                  key={option.value}
                  id={`${listboxId}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled}
                  className={`${styles.option} ${
                    index === activeIndex ? styles.active : ""
                  } ${option.value === value ? styles.selected : ""}`}
                  onPointerEnter={() => setActiveIndex(index)}
                  onClick={() => commit(option)}
                >
                  {option.icon && (
                    <span className={styles.optionIcon}>{option.icon}</span>
                  )}
                  <span className={styles.optionText}>
                    <span className={styles.optionLabel}>{option.label}</span>
                    {option.hint && (
                      <span className={styles.optionHint}>{option.hint}</span>
                    )}
                  </span>
                  <span className={styles.mark} aria-hidden="true" />
                </li>
              ))}

              {visible.length === 0 && (
                <li className={styles.empty}>{t("noResults")}</li>
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className={`${styles.root} ${styles[variant]} ${styles[size]} ${
        className ?? ""
      }`}
      data-open={open || undefined}
    >
      <button
        ref={triggerRef}
        id={controlId}
        type="button"
        role="combobox"
        className={styles.trigger}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={
          open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
        }
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        onClick={() => (open ? close() : openPanel())}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!open) onBlur?.();
        }}
      >
        {icon && <span className={styles.icon}>{icon}</span>}

        <span
          className={`${styles.value} ${selected ? "" : styles.placeholder}`}
        >
          {selected?.label ?? placeholder ?? t("placeholder")}
        </span>

        {clearable && selected && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            className={styles.clear}
            aria-label={t("clear")}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onChange?.("" as T);
            }}
          >
            ×
          </span>
        )}

        <span className={styles.caret} aria-hidden="true" />
      </button>

      {name && <input type="hidden" name={name} value={value ?? ""} />}
      {panel}
    </div>
  );
}
