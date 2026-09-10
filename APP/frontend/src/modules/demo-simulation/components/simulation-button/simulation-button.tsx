"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button/button";
import buttonStyles from "@/shared/components/ui/button/button.module.css";
import { Icon } from "@/shared/components/ui/icon/icon";
import { Popover } from "@/shared/components/ui/popover/popover";
import { useDemoSimulation } from "../../hooks/use-demo-simulation";
import type { SimulationSurface } from "../../simulation.types";
import styles from "./simulation-button.module.css";

interface SimulationButtonProps {
  surface: SimulationSurface;
  onGpsSimulate?: () => void;
  onViolationsSimulate?: () => void;
}

export function SimulationButton({
  surface,
  onGpsSimulate,
  onViolationsSimulate,
}: SimulationButtonProps) {
  const t = useTranslations("DemoSimulation");
  const simulation = useDemoSimulation();
  const [open, setOpen] = useState(false);

  if (!simulation.enabled) return null;

  const run = (action: () => void | Promise<void>) => {
    setOpen(false);
    void action();
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      className={styles.root}
      panelClassName={styles.panel}
      trigger={(props) => (
        <button
          type="button"
          className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm} ${styles.trigger}`}
          data-testid={`simulate-${surface}`}
          aria-expanded={props["aria-expanded"]}
          aria-controls={props["aria-controls"]}
          id={props.id}
          ref={props.ref}
          onClick={props.onClick}
          onKeyDown={props.onKeyDown}
        >
          <Icon name="mdi:flask-outline" size={16} />
          {t("simulate")}
        </button>
      )}
    >
      <p className={styles.title}>{t("scenarios")}</p>
      {surface === "license" ? (
        <div className={styles.actions}>
          <Button type="button" variant="secondary" size="sm" data-testid="simulate-license-valid" onClick={() => run(() => simulation.simulateLicense("valid"))}>
            {t("license.valid")}
          </Button>
          <Button type="button" variant="secondary" size="sm" data-testid="simulate-license-expired" onClick={() => run(() => simulation.simulateLicense("expired"))}>
            {t("license.expired")}
          </Button>
          <Button type="button" variant="secondary" size="sm" data-testid="simulate-license-unreadable" onClick={() => run(() => simulation.simulateLicense("unreadable"))}>
            {t("license.unreadable")}
          </Button>
        </div>
      ) : null}
      {surface === "contract" ? (
        <div className={styles.actions}>
          <Button type="button" variant="secondary" size="sm" data-testid="simulate-contract-fill" onClick={() => run(() => simulation.fillDemoCustomer())}>
            {t("contract.fill")}
          </Button>
        </div>
      ) : null}
      {surface === "payment" ? (
        <div className={styles.actions}>
          <Button type="button" variant="secondary" size="sm" data-testid="simulate-payment-run" onClick={() => run(() => simulation.simulatePayment("success"))}>
            {t("payment.run")}
          </Button>
          <Button type="button" variant="secondary" size="sm" data-testid="simulate-payment-failed" onClick={() => run(() => simulation.simulatePayment("failed"))}>
            {t("payment.failed")}
          </Button>
          <Button type="button" variant="secondary" size="sm" data-testid="simulate-payment-pending" onClick={() => run(() => simulation.simulatePayment("pending"))}>
            {t("payment.pending")}
          </Button>
        </div>
      ) : null}
      {surface === "gps" ? (
        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="simulate-gps-run"
            onClick={() => run(() => onGpsSimulate?.())}
          >
            {t("gps.run")}
          </Button>
        </div>
      ) : null}
      {surface === "violations" ? (
        <div className={styles.actions}>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="simulate-violations-run"
            onClick={() => run(() => onViolationsSimulate?.())}
          >
            {t("violations.run")}
          </Button>
        </div>
      ) : null}
      {surface === "tars" ? (
        <div className={styles.actions}>
          <Button type="button" variant="secondary" size="sm" data-testid="simulate-tars-notStarted" onClick={() => run(() => simulation.simulateTars("notStarted"))}>
            {t("tars.notStarted")}
          </Button>
          <Button type="button" variant="secondary" size="sm" data-testid="simulate-tars-syncing" onClick={() => run(() => simulation.simulateTars("syncing"))}>
            {t("tars.syncing")}
          </Button>
          <Button type="button" variant="secondary" size="sm" data-testid="simulate-tars-synced" onClick={() => run(() => simulation.simulateTars("synced"))}>
            {t("tars.synced")}
          </Button>
          <Button type="button" variant="secondary" size="sm" data-testid="simulate-tars-partialFailure" onClick={() => run(() => simulation.simulateTars("partialFailure"))}>
            {t("tars.partialFailure")}
          </Button>
        </div>
      ) : null}
      <Button type="button" variant="ghost" size="sm" className={styles.reset} data-testid="simulate-reset" onClick={() => run(() => simulation.reset())}>
        {t("reset")}
      </Button>
    </Popover>
  );
}
