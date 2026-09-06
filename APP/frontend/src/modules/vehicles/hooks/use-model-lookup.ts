"use client";

import { useEffect } from "react";
import { usePermissions } from "@/modules/auth";
import { useModelLookupStore } from "../stores/model-lookup.store";
import type { VehicleModelLookupItem } from "../api/model-lookup.api";
import {
  REFERENCE_DATA_LOOKUP_PERMISSION,
  VEHICLE_MODELS_READ_PERMISSION,
} from "../vehicles.permissions";

export interface UseModelLookupResult {
  models: VehicleModelLookupItem[];
  isLoading: boolean;
  isAllowed: boolean;
}

/**
 * Loads the vehicle models used by the fleet model filter. Mirrors the
 * Backend's any-of gate: `reference_data.lookup` OR `vehicle_models.read`.
 */
export function useModelLookup(enabled = true): UseModelLookupResult {
  const { hasPermission } = usePermissions();
  const isAllowed =
    hasPermission(REFERENCE_DATA_LOOKUP_PERMISSION) ||
    hasPermission(VEHICLE_MODELS_READ_PERMISSION);
  const models = useModelLookupStore((state) => state.models);
  const status = useModelLookupStore((state) => state.status);
  const load = useModelLookupStore((state) => state.load);

  useEffect(() => {
    if (enabled && isAllowed) void load();
  }, [enabled, isAllowed, load]);

  return {
    models: isAllowed ? models : [],
    isLoading: isAllowed && (status === "loading" || status === "idle"),
    isAllowed,
  };
}
