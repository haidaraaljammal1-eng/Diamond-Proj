"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { registerArchiveCellCommitter } from "../../utils/archive-edit-registry";
import { Input } from "@/shared/components/ui/input";
import { type ArchiveColumnDefinition } from "../../utils/archive-columns";
import {
  parseArchiveCellPatch,
  readArchiveCellDisplay,
} from "../../utils/archive-cell-value";
import type { ArchiveEditableField, ArchiveRow } from "../../types/archive.types";
import styles from "./archive-editable-cell.module.css";

export interface ArchiveEditableCellProps {
  row: ArchiveRow;
  column: ArchiveColumnDefinition;
  canManage: boolean;
  isSaving: boolean;
  errorMessage: string | null;
  onSave: (
    rowId: number,
    field: ArchiveEditableField,
    patch: Partial<ArchiveRow>,
  ) => Promise<boolean>;
  onClearError: (rowId: number, field: ArchiveEditableField) => void;
}

export function ArchiveEditableCell({
  row,
  column,
  canManage,
  isSaving,
  errorMessage,
  onSave,
  onClearError,
}: ArchiveEditableCellProps) {
  const field = column.field;
  const serverValue = readArchiveCellDisplay(row, field);
  const [editSession, setEditSession] = useState<{ draft: string } | null>(null);
  const commitInFlightRef = useRef(false);
  const displayValue = editSession?.draft ?? serverValue;

  const commit = useCallback(async () => {
    if (!canManage || isSaving || commitInFlightRef.current) return;
    const draft = editSession?.draft ?? serverValue;
    if (draft === serverValue) {
      setEditSession(null);
      return;
    }

    const parsed = parseArchiveCellPatch(field, draft);

    onClearError(row.id, field);
    commitInFlightRef.current = true;
    try {
      await onSave(row.id, field, { [field]: parsed } as Partial<ArchiveRow>);
    } finally {
      commitInFlightRef.current = false;
    }
  }, [canManage, editSession, field, isSaving, onClearError, onSave, row.id, serverValue]);

  useEffect(() => {
    if (!canManage) return undefined;
    return registerArchiveCellCommitter(commit);
  }, [canManage, commit]);

  const inputType = column.kind === "phone" ? "tel" : "text";

  if (!canManage) {
    return (
      <span className={styles.readonly} data-testid={`archive-cell-${field}`}>
        {serverValue}
      </span>
    );
  }

  return (
    <div className={styles.cell} data-testid={`archive-cell-${field}`}>
      <Input
        className={`${styles.input} ${column.kind === "description" ? styles.description : ""}`}
        type={inputType}
        value={displayValue}
        disabled={isSaving}
        aria-invalid={Boolean(errorMessage)}
        onFocus={() => {
          setEditSession((current) => current ?? { draft: serverValue });
        }}
        onChange={(event) => {
          setEditSession({ draft: event.target.value });
        }}
        onBlur={() => {
          void commit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLInputElement).blur();
          }
        }}
      />
      {isSaving ? <span className={styles.saving} aria-hidden="true" /> : null}
      {errorMessage ? (
        <span className={styles.errorMark} title={errorMessage} aria-label="error">
          !
        </span>
      ) : null}
    </div>
  );
}
