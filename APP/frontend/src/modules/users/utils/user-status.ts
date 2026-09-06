import type { UserStatus } from "../types/user.types";

export type UserStatusPresentationVariant = "success" | "warning" | "danger";

export interface UserStatusPresentation {
  translationKey: "statusActive" | "statusPending" | "statusSuspended";
  variant: UserStatusPresentationVariant;
}

const STATUS_MAP: Record<UserStatus, UserStatusPresentation> = {
  ACTIVE: { translationKey: "statusActive", variant: "success" },
  PENDING: { translationKey: "statusPending", variant: "warning" },
  SUSPENDED: { translationKey: "statusSuspended", variant: "danger" },
};

export function getUserStatusPresentation(
  status: UserStatus,
): UserStatusPresentation {
  return STATUS_MAP[status];
}

/** Only ACTIVE/SUSPENDED can be toggled via `PATCH /users/:id/status`. */
export function isUserStatusToggleable(status: UserStatus): boolean {
  return status === "ACTIVE" || status === "SUSPENDED";
}

export function nextStatusAfterToggle(status: UserStatus): UserStatus | null {
  if (status === "ACTIVE") return "SUSPENDED";
  if (status === "SUSPENDED") return "ACTIVE";
  return null;
}
