export type NotificationCategory =
  | "CONTRACTS"
  | "HANDOVER_RETURN"
  | "VEHICLES"
  | "VIOLATIONS";

export type NotificationType =
  | "CONTRACT_UNPAID"
  | "VIOLATION_UNPAID"
  | "VEHICLE_RETURN_OVERDUE"
  | "CAR_OUT_PENDING"
  | "CONTRACT_SIGNED"
  | "CONTRACT_PAID"
  | "VEHICLE_HANDED_OVER"
  | "VEHICLE_RETURNED"
  | "VIOLATION_NEW"
  | "VEHICLE_MAINTENANCE_DUE";

export interface DemoNotification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  titleKey: string;
  descriptionKey: string;
  titleValues?: Record<string, string>;
  descriptionValues?: Record<string, string>;
  createdAt: string;
  read: boolean;
  actionTarget: NotificationActionTarget;
}

export interface NotificationActionTarget {
  entityType: "vehicle" | "contract" | "violation";
  entityId: string;
  route: "/vehicles" | "/contracts" | "/violations";
}

export interface NotificationRecordTarget extends NotificationActionTarget {
  label: string;
  reference?: string | null;
}

export type NotificationFilter = "ALL" | "UNREAD" | NotificationCategory;

export const NOTIFICATION_FILTERS: NotificationFilter[] = [
  "ALL",
  "UNREAD",
  "CONTRACTS",
  "HANDOVER_RETURN",
  "VEHICLES",
  "VIOLATIONS",
];

export function buildNotificationsFixture(
  targets: NotificationRecordTarget[] = [],
  now = Date.now(),
): DemoNotification[] {
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
  const first = (entityType: NotificationRecordTarget["entityType"]) =>
    targets.find((target) => target.entityType === entityType);
  const contract = first("contract");
  const vehicle = first("vehicle");
  const violation = first("violation");
  const vehicleValues = vehicle
    ? { vehicle: vehicle.label, reference: vehicle.reference ?? "" }
    : undefined;
  const contractValues = contract
    ? { number: contract.label, reference: contract.reference ?? "" }
    : undefined;
  const violationValues = violation
    ? { vehicle: violation.label, contract: violation.reference ?? "" }
    : undefined;

  const items: Array<DemoNotification | null> = [
    contract
      ? {
          id: "demo-notification-contract-unpaid",
          type: "CONTRACT_UNPAID",
          category: "CONTRACTS",
          titleKey: "notification.contractUnpaid.title",
          descriptionKey: "notification.contractUnpaid.description",
          titleValues: contractValues,
          descriptionValues: contractValues,
          createdAt: minutesAgo(8),
          read: false,
          actionTarget: contract,
        }
      : null,
    violation
      ? {
          id: "demo-notification-violation-unpaid",
          type: "VIOLATION_UNPAID",
          category: "VIOLATIONS",
          titleKey: "notification.violationUnpaid.title",
          descriptionKey: "notification.violationUnpaid.description",
          titleValues: violationValues,
          descriptionValues: violationValues,
          createdAt: minutesAgo(22),
          read: false,
          actionTarget: violation,
        }
      : null,
    contract
      ? {
          id: "demo-notification-return-overdue",
          type: "VEHICLE_RETURN_OVERDUE",
          category: "HANDOVER_RETURN",
          titleKey: "notification.vehicleReturnOverdue.title",
          descriptionKey: "notification.vehicleReturnOverdue.description",
          titleValues: { vehicle: contract.reference ?? contract.label, number: contract.label },
          descriptionValues: contractValues,
          createdAt: minutesAgo(48),
          read: false,
          actionTarget: contract,
        }
      : null,
    contract
      ? {
          id: "demo-notification-car-out-pending",
          type: "CAR_OUT_PENDING",
          category: "HANDOVER_RETURN",
          titleKey: "notification.carOutPending.title",
          descriptionKey: "notification.carOutPending.description",
          titleValues: contractValues,
          descriptionValues: contractValues,
          createdAt: minutesAgo(75),
          read: false,
          actionTarget: contract,
        }
      : null,
    contract
      ? {
          id: "demo-notification-contract-signed",
          type: "CONTRACT_SIGNED",
          category: "CONTRACTS",
          titleKey: "notification.contractSigned.title",
          descriptionKey: "notification.contractSigned.description",
          titleValues: contractValues,
          descriptionValues: contractValues,
          createdAt: minutesAgo(130),
          read: true,
          actionTarget: contract,
        }
      : null,
    contract
      ? {
          id: "demo-notification-contract-paid",
          type: "CONTRACT_PAID",
          category: "CONTRACTS",
          titleKey: "notification.contractPaid.title",
          descriptionKey: "notification.contractPaid.description",
          titleValues: contractValues,
          descriptionValues: contractValues,
          createdAt: minutesAgo(175),
          read: true,
          actionTarget: contract,
        }
      : null,
    vehicle
      ? {
          id: "demo-notification-vehicle-handed-over",
          type: "VEHICLE_HANDED_OVER",
          category: "VEHICLES",
          titleKey: "notification.vehicleHandedOver.title",
          descriptionKey: "notification.vehicleHandedOver.description",
          titleValues: vehicleValues,
          descriptionValues: vehicleValues,
          createdAt: minutesAgo(260),
          read: true,
          actionTarget: vehicle,
        }
      : null,
    contract
      ? {
          id: "demo-notification-vehicle-returned",
          type: "VEHICLE_RETURNED",
          category: "HANDOVER_RETURN",
          titleKey: "notification.vehicleReturned.title",
          descriptionKey: "notification.vehicleReturned.description",
          titleValues: contractValues,
          descriptionValues: contractValues,
          createdAt: minutesAgo(360),
          read: true,
          actionTarget: contract,
        }
      : null,
    violation
      ? {
          id: "demo-notification-violation-new",
          type: "VIOLATION_NEW",
          category: "VIOLATIONS",
          titleKey: "notification.violationNew.title",
          descriptionKey: "notification.violationNew.description",
          titleValues: violationValues,
          descriptionValues: violationValues,
          createdAt: minutesAgo(520),
          read: true,
          actionTarget: violation,
        }
      : null,
    vehicle
      ? {
          id: "demo-notification-maintenance-due",
          type: "VEHICLE_MAINTENANCE_DUE",
          category: "VEHICLES",
          titleKey: "notification.vehicleMaintenanceDue.title",
          descriptionKey: "notification.vehicleMaintenanceDue.description",
          titleValues: vehicleValues,
          descriptionValues: vehicleValues,
          createdAt: minutesAgo(720),
          read: true,
          actionTarget: vehicle,
        }
      : null,
  ];

  return items.filter((item): item is DemoNotification => item != null);
}
