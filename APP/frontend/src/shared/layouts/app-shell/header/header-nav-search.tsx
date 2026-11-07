"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  NAVIGATION_ICONS,
  filterNavigationSearch,
  useNavigation,
  type NavigationSearchHit,
} from "@/modules/navigation";
import { useAppShellStore } from "../store/app-shell.store";
import styles from "./app-header.module.css";

/**
 * HeaderNavSearch — shell search bound to the same rail items as the Sidebar.
 *
 * Typing filters visible `link` entries from `useNavigation` (permissions already
 * applied). Selecting a hit navigates to that item's locale href — the same
 * destination as clicking the rail tab.
 */
export function HeaderNavSearch() {
  const t = useTranslations("Shell");
  const router = useRouter();
  const { groups, hrefFor, isActive } = useNavigation();
  const closeMobileSidebar = useAppShellStore((s) => s.closeMobileSidebar);

  const listboxId = useId();
  const rootRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const hits = filterNavigationSearch(groups, query);
  const showPanel = open && query.trim().length > 0;

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!showPanel) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [showPanel]);

  function goTo(hit: NavigationSearchHit) {
    const href = hrefFor(hit.href);
    if (!href) return;
    setQuery("");
    setOpen(false);
    closeMobileSidebar();
    router.push(href);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hit = hits[activeIndex] ?? hits[0];
    if (hit) goTo(hit);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (query || showPanel) {
        event.preventDefault();
        setQuery("");
        setOpen(false);
      }
      return;
    }

    if (!hits.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % hits.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i - 1 + hits.length) % hits.length);
    }
  }

  return (
    <form
      ref={rootRef}
      className={styles.search}
      role="search"
      onSubmit={onSubmit}
    >
      <svg
        viewBox="0 0 24 24"
        className={styles.searchIcon}
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.6-3.6" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        className={styles.searchInput}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        aria-autocomplete="list"
        aria-controls={showPanel ? listboxId : undefined}
        aria-expanded={showPanel}
        aria-activedescendant={
          showPanel && hits[activeIndex]
            ? `${listboxId}-${hits[activeIndex].key}`
            : undefined
        }
        role="combobox"
        autoComplete="off"
      />

      {showPanel && (
        <div
          id={listboxId}
          className={styles.searchResults}
          role="listbox"
          aria-label={t("searchResultsLabel")}
        >
          {hits.length === 0 ? (
            <div className={styles.searchEmpty}>{t("searchNoResults")}</div>
          ) : (
            hits.map((hit, index) => {
              const Icon = NAVIGATION_ICONS[hit.icon];
              const active = index === activeIndex;
              return (
                <button
                  key={hit.key}
                  id={`${listboxId}-${hit.key}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`${styles.searchHit}${active ? ` ${styles.searchHitActive}` : ""}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => goTo(hit)}
                >
                  <Icon className={styles.searchHitIcon} aria-hidden="true" />
                  <span className={styles.searchHitText}>
                    <span className={styles.searchHitLabel}>{hit.label}</span>
                    <span className={styles.searchHitGroup}>{hit.groupLabel}</span>
                  </span>
                  {isActive(hit.href) ? (
                    <span className={styles.searchHitCurrent} aria-hidden="true">
                      ●
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      )}
    </form>
  );
}
