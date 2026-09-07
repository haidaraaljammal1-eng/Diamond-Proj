"use client";

import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Icon } from "@/shared/components/ui/icon";
import { Input } from "@/shared/components/ui/input";
import type { DataSearchProps } from "./data-search.types";
import styles from "./data-search.module.css";
import { hasSearchContent, normalizeSearchSubmit } from "./data-search.utils";

/**
 * Explicit-submit search for data-heavy pages.
 * Draft typing stays local; parent applies the query on Search / Enter only.
 */
export function DataSearch({
  appliedValue,
  onSearch,
  onClear,
  placeholder,
  inputLabel,
  searchButtonLabel,
  clearButtonLabel,
  loading = false,
  inputTestId,
  className,
}: DataSearchProps) {
  const [draft, setDraft] = useState(appliedValue);
  const [syncedApplied, setSyncedApplied] = useState(appliedValue);

  if (appliedValue !== syncedApplied) {
    setSyncedApplied(appliedValue);
    setDraft(appliedValue);
  }

  function submitSearch() {
    const next = normalizeSearchSubmit(draft);
    setDraft(next);
    onSearch(next);
  }

  function handleClear() {
    setDraft("");
    onClear();
  }

  const showClear = hasSearchContent(draft, appliedValue);

  return (
    <form
      className={[styles.form, className].filter(Boolean).join(" ")}
      onSubmit={(event) => {
        event.preventDefault();
        submitSearch();
      }}
      data-testid="data-search"
    >
      <div className={styles.inputWrap}>
        <Input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className={styles.input}
          placeholder={placeholder}
          aria-label={inputLabel}
          data-testid={inputTestId}
        />
        {showClear ? (
          <button
            type="button"
            className={styles.clear}
            onClick={handleClear}
            aria-label={clearButtonLabel}
            data-testid="data-search-clear"
          >
            <Icon name="mdi:close" size={14} />
          </button>
        ) : null}
      </div>

      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={loading}
        className={styles.searchButton}
        data-testid="data-search-submit"
      >
        <Icon name="mdi:magnify" size={16} />
        {searchButtonLabel}
      </Button>
    </form>
  );
}
