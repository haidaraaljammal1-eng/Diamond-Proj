"use client";

import { useMemo } from "react";
import { usePermissions } from "@/modules/auth";
import { extractFunctionalGrantsFromPermissions } from "../policy-engine";
import type { FunctionalAuthContext } from "../types";

export function useFunctionalAuthContext(): FunctionalAuthContext {
  const { permissions, isSystemAdmin } = usePermissions();
  return useMemo(
    () => ({
      isSystemAdmin,
      functionalGrants: extractFunctionalGrantsFromPermissions(permissions),
    }),
    [isSystemAdmin, permissions],
  );
}
