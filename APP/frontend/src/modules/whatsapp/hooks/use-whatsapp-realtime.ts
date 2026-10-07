"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/modules/auth";
import { isDemoSimulationEnabled } from "@/modules/demo-simulation/simulation.enabled";
import { useWhatsAppSimulationStore } from "../simulation/whatsapp-simulation.store";
import { useWhatsAppStore } from "../stores/whatsapp.store";
import { WHATSAPP_PAGE_PERMISSIONS } from "../whatsapp.permissions";
import { acquireWhatsAppRealtime } from "../realtime/whatsapp.realtime-client";

/**
 * One SSE subscription for the whole WhatsApp module. Call only from the page shell
 * (WhatsAppScreen) so child components can use useWhatsApp() without resubscribing.
 */
export function useWhatsAppRealtimeSubscription(): void {
  const { status: sessionStatus } = useSession();
  const { hasPermission } = usePermissions();
  const isAllowed = WHATSAPP_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );
  const simulationEnabled = isDemoSimulationEnabled();
  const simulationActive =
    simulationEnabled && useWhatsAppSimulationStore((state) => state.active);

  const signedOut = sessionStatus === "unauthenticated";
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (signedOut || simulationActive) {
      releaseRef.current?.();
      releaseRef.current = null;
      return;
    }

    const shouldSubscribe = sessionStatus === "authenticated" && isAllowed;
    if (!shouldSubscribe) {
      if (sessionStatus === "loading") {
        return;
      }
      releaseRef.current?.();
      releaseRef.current = null;
      return;
    }

    if (releaseRef.current) {
      return;
    }

    releaseRef.current = acquireWhatsAppRealtime({
      onEvent: (event) => {
        void useWhatsAppStore.getState().applyRealtimeEvent(event);
      },
      onStatus: (status) => {
        useWhatsAppStore.getState().setRealtimeStatus(status);
      },
      onReconnect: () => {
        void useWhatsAppStore.getState().reconcileRealtime();
      },
    });

    return () => {
      releaseRef.current?.();
      releaseRef.current = null;
    };
  }, [signedOut, simulationActive, sessionStatus, isAllowed]);
}
