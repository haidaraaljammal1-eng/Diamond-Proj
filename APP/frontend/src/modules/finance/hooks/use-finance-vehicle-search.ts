"use client";

import { useCallback, useEffect, useState } from "react";
import { getVehicles } from "@/modules/vehicles/api/vehicles.api";
import type { VehicleCardDto } from "@/modules/vehicles/types/vehicle.types";

export function useFinanceVehicleSearch(open: boolean) {
  const [vehicles, setVehicles] = useState<VehicleCardDto[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const result = await getVehicles({
        search: query,
        page: 1,
        pageSize: 12,
        sort: "newest",
      });
      setVehicles(result.data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load(search);
  }, [open, search, load]);

  return {
    vehicles,
    isLoading,
    search,
    applySearch: setSearch,
    clearSearch: () => setSearch(""),
  };
}
