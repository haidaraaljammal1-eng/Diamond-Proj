"use client";

import { useTranslations } from "next-intl";
import { Chip } from "@/shared/components/ui/chip";
import type { MaintenanceStatus } from "../../types/maintenance.types";
import {
  getMaintenanceStatusPresentation,
  OVERDUE_PRESENTATION,
} from "../../utils/maintenance-status";
import styles from "./maintenance-status-chip.module.css";

export interface MaintenanceStatusChipProps {
  status: MaintenanceStatus;
  overdue?: boolean;
}

export function MaintenanceStatusChip({
  status,
  overdue = false,
}: MaintenanceStatusChipProps) {
  const t = useTranslations("Maintenance");
  const presentation = getMaintenanceStatusPresentation(status);

  return (
    <span className={styles.chips}>
      <Chip tone={presentation.tone} dot>
        {t(presentation.translationKey)}
      </Chip>
      {overdue ? (
        <Chip tone={OVERDUE_PRESENTATION.tone} dot>
          {t(OVERDUE_PRESENTATION.translationKey)}
        </Chip>
      ) : null}
    </span>
  );
}
