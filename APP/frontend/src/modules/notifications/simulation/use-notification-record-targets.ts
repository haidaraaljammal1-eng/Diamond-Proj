"use client";

import { useCallback } from "react";
import { isUiDemoSimulationEnabled } from "@/modules/demo-simulation/simulation.enabled";
import type { NotificationRecordTarget } from "./notifications-simulation.fixture";
import { useNotificationsSimulationStore } from "./notifications-simulation.store";

/** Registers records already loaded by a real page for the browser-only demo. */
export function useNotificationRecordTargets() {
  const enabled = isUiDemoSimulationEnabled("notifications");
  const registerTargets = useNotificationsSimulationStore((state) => state.registerTargets);

  return useCallback(
    (targets: NotificationRecordTarget[]) => {
      if (enabled) registerTargets(targets);
    },
    [enabled, registerTargets],
  );
}
