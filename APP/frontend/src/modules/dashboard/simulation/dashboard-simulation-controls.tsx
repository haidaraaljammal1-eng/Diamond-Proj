"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { useDashboardSimulation } from "./use-dashboard-simulation";
import styles from "./dashboard-simulation-controls.module.css";

export function DashboardSimulationControls() {
  const t = useTranslations("Dashboard");
  const simulation = useDashboardSimulation();

  if (!simulation.enabled) return null;

  return (
    <div className={styles.controls}>
      {simulation.active ? (
        <>
          <span className={styles.badge} data-testid="dashboard-simulation-badge">
            {t("simulation.badge")}
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="dashboard-simulation-reset"
            onClick={() => simulation.reset()}
          >
            {t("simulation.reset")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="dashboard-simulation-disable"
            onClick={() => simulation.disable()}
          >
            {t("simulation.disable")}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="dashboard-simulation-run"
          onClick={() => simulation.activate()}
        >
          {t("simulation.button")}
        </Button>
      )}
    </div>
  );
}
