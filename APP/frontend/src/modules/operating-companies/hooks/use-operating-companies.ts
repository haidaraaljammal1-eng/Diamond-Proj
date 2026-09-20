"use client";

import { useEffect, useMemo } from "react";
import { useOperatingCompaniesStore } from "../stores/operating-companies.store";

export function useOperatingCompanies(enabled = true) {
  const companies = useOperatingCompaniesStore((state) => state.companies);
  const status = useOperatingCompaniesStore((state) => state.status);
  const error = useOperatingCompaniesStore((state) => state.error);
  const load = useOperatingCompaniesStore((state) => state.load);
  const refresh = useOperatingCompaniesStore((state) => state.refresh);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  return useMemo(
    () => ({
      companies,
      isLoading: enabled && (status === "idle" || status === "loading"),
      isReady: status === "ready",
      error: status === "error" ? error : null,
      refresh,
    }),
    [companies, enabled, status, error, refresh],
  );
}
