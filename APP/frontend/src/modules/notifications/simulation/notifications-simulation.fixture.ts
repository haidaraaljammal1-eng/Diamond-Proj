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
  createdAt: string;
  read: boolean;
  actionTarget?: "/contracts" | "/vehicles" | "/violations";
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

export function buildNotificationsFixture(now = Date.now()): DemoNotification[] {
  const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  return [
    {
      id: "demo-notification-contract-unpaid",
      type: "CONTRACT_UNPAID",
      category: "CONTRACTS",
      titleKey: "notification.contractUnpaid.title",
      descriptionKey: "notification.contractUnpaid.description",
      createdAt: minutesAgo(8),
      read: false,
      actionTarget: "/contracts",
    },
    {
      id: "demo-notification-violation-unpaid",
      type: "VIOLATION_UNPAID",
      category: "VIOLATIONS",
      titleKey: "notification.violationUnpaid.title",
      descriptionKey: "notification.violationUnpaid.description",
      createdAt: minutesAgo(22),
      read: false,
      actionTarget: "/violations",
    },
    {
      id: "demo-notification-return-overdue",
      type: "VEHICLE_RETURN_OVERDUE",
      category: "HANDOVER_RETURN",
      titleKey: "notification.vehicleReturnOverdue.title",
      descriptionKey: "notification.vehicleReturnOverdue.description",
      createdAt: minutesAgo(48),
      read: false,
      actionTarget: "/contracts",
    },
    {
      id: "demo-notification-car-out-pending",
      type: "CAR_OUT_PENDING",
      category: "HANDOVER_RETURN",
      titleKey: "notification.carOutPending.title",
      descriptionKey: "notification.carOutPending.description",
      createdAt: minutesAgo(75),
      read: false,
      actionTarget: "/contracts",
    },
    {
      id: "demo-notification-contract-signed",
      type: "CONTRACT_SIGNED",
      category: "CONTRACTS",
      titleKey: "notification.contractSigned.title",
      descriptionKey: "notification.contractSigned.description",
      createdAt: minutesAgo(130),
      read: true,
      actionTarget: "/contracts",
    },
    {
      id: "demo-notification-contract-paid",
      type: "CONTRACT_PAID",
      category: "CONTRACTS",
      titleKey: "notification.contractPaid.title",
      descriptionKey: "notification.contractPaid.description",
      createdAt: minutesAgo(175),
      read: true,
      actionTarget: "/contracts",
    },
    {
      id: "demo-notification-vehicle-handed-over",
      type: "VEHICLE_HANDED_OVER",
      category: "VEHICLES",
      titleKey: "notification.vehicleHandedOver.title",
      descriptionKey: "notification.vehicleHandedOver.description",
      createdAt: minutesAgo(260),
      read: true,
      actionTarget: "/vehicles",
    },
    {
      id: "demo-notification-vehicle-returned",
      type: "VEHICLE_RETURNED",
      category: "HANDOVER_RETURN",
      titleKey: "notification.vehicleReturned.title",
      descriptionKey: "notification.vehicleReturned.description",
      createdAt: minutesAgo(360),
      read: true,
      actionTarget: "/contracts",
    },
    {
      id: "demo-notification-violation-new",
      type: "VIOLATION_NEW",
      category: "VIOLATIONS",
      titleKey: "notification.violationNew.title",
      descriptionKey: "notification.violationNew.description",
      createdAt: minutesAgo(520),
      read: true,
      actionTarget: "/violations",
    },
    {
      id: "demo-notification-maintenance-due",
      type: "VEHICLE_MAINTENANCE_DUE",
      category: "VEHICLES",
      titleKey: "notification.vehicleMaintenanceDue.title",
      descriptionKey: "notification.vehicleMaintenanceDue.description",
      createdAt: minutesAgo(720),
      read: true,
      actionTarget: "/vehicles",
    },
  ];
}
