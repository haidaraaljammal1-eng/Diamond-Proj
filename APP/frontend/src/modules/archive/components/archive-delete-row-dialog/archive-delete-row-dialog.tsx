"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { Dialog } from "@/shared/components/ui/dialog";
import { resolveArchiveErrorMessage } from "../../utils/resolve-archive-error";
import type { ApiRequestError } from "@/infrastructure/api/errors";
import styles from "./archive-delete-row-dialog.module.css";

export interface ArchiveDeleteRowDialogProps {
  open: boolean;
  rowOrder: number | null;
  isDeleting: boolean;
  error: ApiRequestError | null;
  onClose: () => void;
  onConfirm: () => void;
}

export function ArchiveDeleteRowDialog({
  open,
  rowOrder,
  isDeleting,
  error,
  onClose,
  onConfirm,
}: ArchiveDeleteRowDialogProps) {
  const t = useTranslations("Archive");
  const errorMessage = resolveArchiveErrorMessage(t, error);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      closeLabel={t("actions.close")}
      title={t("delete.title")}
      description={
        rowOrder !== null ? t("delete.description", { rowOrder }) : t("delete.descriptionGeneric")
      }
    >
      {errorMessage ? <p className={styles.error} role="alert">{errorMessage}</p> : null}
      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={onClose} disabled={isDeleting}>
          {t("actions.cancel")}
        </Button>
        <Button type="button" variant="primary" onClick={onConfirm} disabled={isDeleting}>
          {isDeleting ? t("delete.deleting") : t("delete.confirm")}
        </Button>
      </div>
    </Dialog>
  );
}
