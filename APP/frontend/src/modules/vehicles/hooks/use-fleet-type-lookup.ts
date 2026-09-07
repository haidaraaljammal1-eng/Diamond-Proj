"use client";

import { useEffect } from "react";
import { useFleetTypeLookupStore } from "../stores/fleet-type-lookup.store";
import type { FleetVehicleTypeOption } from "../api/fleet-type-lookup.api";

export interface UseFleetTypeLookupResult {
  types: FleetVehicleTypeOption[];
  isLoading: boolean;
  refreshTypes: () => Promise<void>;
}

/** Loads distinct active-fleet vehicle types for the toolbar filter. */
export function useFleetTypeLookup(enabled = true): UseFleetTypeLookupResult {
  const types = useFleetTypeLookupStore((state) => state.types);
  const status = useFleetTypeLookupStore((state) => state.status);
  const load = useFleetTypeLookupStore((state) => state.load);
  const refresh = useFleetTypeLookupStore((state) => state.refresh);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return {
    types,
    isLoading: status === "loading" || status === "idle",
    refreshTypes: refresh,
  };
}
