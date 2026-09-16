"use client";

import { useEffect } from "react";
import { useDemoSimulation } from "@/modules/demo-simulation";

const TICK_MS = 3200;

export function useGpsSimulationMotion() {
  const { snapshot, tickGpsPath } = useDemoSimulation();

  useEffect(() => {
    if (!snapshot.gpsOverlay?.movingVehicleId) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      tickGpsPath();
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [snapshot.gpsOverlay?.movingVehicleId, snapshot.generation, tickGpsPath]);
}
