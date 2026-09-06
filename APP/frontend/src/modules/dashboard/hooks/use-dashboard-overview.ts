"use client";

import { useMemo } from "react";
import { useAuth, usePermissions } from "@/modules/auth";
import { SYSTEM_ADMIN_ROLE } from "@/modules/navigation";
import { DASHBOARD_PAGE_PERMISSIONS } from "../dashboard.permissions";
import {
  DEMO_CONTRACTS,
  DEMO_EXPENSE_CATEGORIES,
  DEMO_EMPLOYEES,
  DEMO_SELF_EMPLOYEE_ID,
  DEMO_UNREAD_MESSAGES,
  DEMO_VEHICLES,
  DEMO_WEEK,
} from "../data/dashboard.demo-data";
import { buildDashboardOverview } from "../utils/dashboard.selectors";
import type { DashboardOverview, DashboardScope } from "../types/dashboard.types";

export interface UseDashboardOverviewResult {
  overview: DashboardOverview;
  /** Demo owner view (`role === 'owner'`) — office-wide sections. */
  isOwner: boolean;
  /** Backend `dashboard.read`. */
  isAllowed: boolean;
  isLoading: boolean;
  /** Session display name for the greeting. */
  viewerName: string | null;
}

/**
 * The Dashboard's single UI facade.
 *
 * Today it derives every section from the Demo fixtures (see
 * `data/dashboard.demo-data`), because the Backend has no Diamond rental
 * domain yet. When `GET /dashboard/overview` returns those sections, this hook
 * is the only file that changes: swap the fixture source for the API/store
 * call and keep returning `DashboardOverview`.
 */
export function useDashboardOverview(): UseDashboardOverviewResult {
  const { user, isLoading } = useAuth();
  const { hasPermission } = usePermissions();

  const isOwner = (user?.roles ?? []).includes(SYSTEM_ADMIN_ROLE);
  const isAllowed = DASHBOARD_PAGE_PERMISSIONS.every((permission) =>
    hasPermission(permission),
  );

  const overview = useMemo(() => {
    const scope: DashboardScope = isOwner
      ? { kind: "office" }
      : { kind: "own", employeeId: DEMO_SELF_EMPLOYEE_ID };

    return buildDashboardOverview(
      {
        vehicles: DEMO_VEHICLES,
        employees: DEMO_EMPLOYEES,
        contracts: DEMO_CONTRACTS,
        unreadMessages: DEMO_UNREAD_MESSAGES,
        week: DEMO_WEEK,
        expenseCategories: DEMO_EXPENSE_CATEGORIES,
      },
      scope,
    );
  }, [isOwner]);

  return {
    overview,
    isOwner,
    isAllowed,
    isLoading,
    viewerName: user?.name ?? null,
  };
}
