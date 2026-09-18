"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { isProviderSimulationEnabled } from "../../simulation.enabled";
import styles from "./simulation-action.module.css";

export interface SimulationActionProps {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  testId?: string;
}

/** Shared developer action for backend-authorized external provider substitutions. */
export function SimulationAction({ label, onClick, disabled, testId }: SimulationActionProps) {
  const t = useTranslations("DemoSimulation");
  if (!isProviderSimulationEnabled()) return null;
  return <Button type="button" variant="secondary" size="sm" className={styles.action}
    disabled={disabled} data-testid={testId} onClick={() => void onClick()}>
    <span className={styles.badge}>{t("devBadge")}</span>{label}
  </Button>;
}
