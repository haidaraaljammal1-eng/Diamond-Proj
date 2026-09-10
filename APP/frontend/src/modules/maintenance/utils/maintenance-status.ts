import type { ChipTone } from "@/shared/components/ui/chip";
import type { MaintenanceStatus } from "../types/maintenance.types";

export interface MaintenanceStatusPresentation {
  translationKey:
    | "status.scheduled"
    | "status.in_service"
    | "status.ready_for_pickup"
    | "status.completed"
    | "status.cancelled"
    | "status.overdue";
  tone: ChipTone;
}

const STATUS_PRESENTATION: Record<MaintenanceStatus, MaintenanceStatusPresentation> = {
  scheduled: { translationKey: "status.scheduled", tone: "gold" },
  in_service: { translationKey: "status.in_service", tone: "warn" },
  ready_for_pickup: { translationKey: "status.ready_for_pickup", tone: "ok" },
  completed: { translationKey: "status.completed", tone: "ok" },
  cancelled: { translationKey: "status.cancelled", tone: "neutral" },
};

export const OVERDUE_PRESENTATION: MaintenanceStatusPresentation = {
  translationKey: "status.overdue",
  tone: "bad",
};

export function getMaintenanceStatusPresentation(
  status: MaintenanceStatus,
): MaintenanceStatusPresentation {
  return STATUS_PRESENTATION[status];
}

export function canEditMaintenance(status: MaintenanceStatus): boolean {
  return status === "scheduled" || status === "in_service" || status === "ready_for_pickup";
}

export function canStartMaintenance(status: MaintenanceStatus): boolean {
  return status === "scheduled";
}

export function canMarkReady(status: MaintenanceStatus): boolean {
  return status === "in_service";
}

export function canCompleteMaintenance(status: MaintenanceStatus): boolean {
  return status === "ready_for_pickup";
}

export function canCancelMaintenance(status: MaintenanceStatus): boolean {
  return status === "scheduled";
}
