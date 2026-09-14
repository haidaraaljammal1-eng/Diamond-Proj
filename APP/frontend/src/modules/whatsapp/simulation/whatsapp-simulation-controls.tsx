"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/components/ui/button";
import { isDemoSimulationEnabled } from "@/modules/demo-simulation/simulation.enabled";
import { useWhatsAppSimulationStore } from "./whatsapp-simulation.store";
import {
  emitSimulatedWhatsAppInbound,
  emitSimulatedWhatsAppProviderStatus,
} from "./whatsapp-simulation.realtime";
import styles from "./whatsapp-simulation-controls.module.css";

export function WhatsAppSimulationControls() {
  const t = useTranslations("WhatsApp");
  const enabled = isDemoSimulationEnabled();
  const active = useWhatsAppSimulationStore((state) => state.active);
  const activate = useWhatsAppSimulationStore((state) => state.activate);
  const reset = useWhatsAppSimulationStore((state) => state.reset);
  const disable = useWhatsAppSimulationStore((state) => state.disable);

  if (!enabled) return null;

  return (
    <div className={styles.controls}>
      {active ? (
        <>
          <span className={styles.badge} data-testid="whatsapp-simulation-badge">
            {t("simulation.badge")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="whatsapp-simulation-inbound"
            onClick={() => emitSimulatedWhatsAppInbound()}
          >
            {t("simulation.inbound")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="whatsapp-simulation-delivered"
            onClick={() => emitSimulatedWhatsAppProviderStatus("DELIVERED")}
          >
            {t("simulation.delivered")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="whatsapp-simulation-read"
            onClick={() => emitSimulatedWhatsAppProviderStatus("READ")}
          >
            {t("simulation.read")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => useWhatsAppSimulationStore.getState().setConnectionState("DISCONNECTED")}
          >
            {t("simulation.disconnected")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => useWhatsAppSimulationStore.getState().setConnectionState("LINKED")}
          >
            {t("simulation.linked")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => useWhatsAppSimulationStore.getState().setConnectionState("LINKED_ACTIVE")}
          >
            {t("simulation.webhookActive")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="whatsapp-simulation-reset"
            onClick={() => reset()}
          >
            {t("simulation.reset")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="whatsapp-simulation-disable"
            onClick={() => disable()}
          >
            {t("simulation.disable")}
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          data-testid="whatsapp-simulation-run"
          onClick={() => activate()}
        >
          {t("simulation.button")}
        </Button>
      )}
    </div>
  );
}
