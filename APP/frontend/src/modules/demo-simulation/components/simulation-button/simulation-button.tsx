"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { useDemoSimulation } from "../../hooks/use-demo-simulation";
import type { SimulationSurface } from "../../simulation.types";

/** Only the documented Road Liabilities browser demo uses this legacy control. */
export function SimulationButton({ surface, onViolationsSimulate }: {
  surface: SimulationSurface;
  onGpsSimulate?: () => void;
  onViolationsSimulate?: () => void;
  onFinanceSimulate?: () => void;
  onFinanceReset?: () => void;
  onFinanceDisable?: () => void;
}) {
  const t = useTranslations("DemoSimulation");
  const simulation = useDemoSimulation(surface === "violations" ? "violations" : undefined);
  if (surface !== "violations" || !simulation.enabled) return null;

  if (!simulation.snapshot.roadLiabilitiesOverlay) {
    return <Button type="button" variant="secondary" size="sm" data-testid="road-liabilities-simulation-run" onClick={onViolationsSimulate}>
      {t("uiDemoRun")}
    </Button>;
  }

  return <>
    <span role="status">{t("uiDemoBadge")}</span>
    <Button type="button" variant="secondary" size="sm" data-testid="road-liabilities-simulation-reset" onClick={onViolationsSimulate}>
      {t("uiDemoReset")}
    </Button>
    <Button type="button" variant="ghost" size="sm" data-testid="road-liabilities-simulation-disable" onClick={simulation.clearRoadLiabilitiesOverlay}>
      {t("uiDemoDisable")}
    </Button>
  </>;
}
