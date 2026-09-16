"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import { useDemoSimulation } from "../../hooks/use-demo-simulation";
import styles from "./simulation-badge.module.css";

export function SimulationChrome() {
  const t = useTranslations("DemoSimulation");
  const simulation = useDemoSimulation();

  if (!simulation.enabled || !simulation.active) return null;

  return (
    <div className={styles.wrap} data-testid="simulation-badge">
      <div className={styles.badge}>
        <span className={styles.mark}>{t("badge")}</span>
        <span className={styles.copy}>{t("hint")}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={styles.reset}
          data-testid="simulation-reset"
          onClick={() => simulation.reset()}
        >
          {t("reset")}
        </Button>
      </div>
    </div>
  );
}
