export interface RentalDurationParts {
  days: number;
  hours: number;
  minutes: number;
  expired: boolean;
}

export function getRentalDurationParts(endAt: string, now = Date.now()): RentalDurationParts {
  const remaining = new Date(endAt).getTime() - now;
  if (remaining <= 0) {
    return { days: 0, hours: 0, minutes: 0, expired: true };
  }
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return { days, hours, minutes, expired: false };
}

export function shouldShowCurrentRental(
  status: "available" | "rented" | "service",
  currentRental: { endAt: string; customerName: string } | null,
): boolean {
  return (
    status === "rented" &&
    currentRental != null &&
    Boolean(currentRental.endAt) &&
    Boolean(currentRental.customerName)
  );
}

export function shouldShowRentalTimer(
  status: "available" | "rented" | "service",
  currentRental: { endAt: string } | null,
): boolean {
  return status === "rented" && currentRental != null && Boolean(currentRental.endAt);
}
