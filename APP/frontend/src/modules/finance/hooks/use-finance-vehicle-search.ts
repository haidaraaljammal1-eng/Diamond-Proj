"use client";

import { useCallback, useEffect, useState } from "react";
import { getVehicles } from "@/modules/vehicles/api/vehicles.api";
import type { VehicleCardDto } from "@/modules/vehicles/types/vehicle.types";

export function useFinanceVehicleSearch(open: boolean) {
  const [vehicles, setVehicles] = useState<VehicleCardDto[]>([]);
  const [search, setSearch] = useState("");
  /** Owning-company filter; null means every company. */
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async (query: string, company: number | null) => {
    setIsLoading(true);
    try {
      const result = await getVehicles({
        search: query,
        companyId: company,
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
    void load(search, companyId);
  }, [open, search, companyId, load]);

  return {
    vehicles,
    isLoading,
    search,
    companyId,
    applySearch: setSearch,
    clearSearch: () => setSearch(""),
    setCompany: setCompanyId,
  };
}
