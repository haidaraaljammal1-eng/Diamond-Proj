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

/** Locale-independent compact duration for fleet cards (always `d` / `h` / `m`). */
export function formatRentalDurationCompact(parts: RentalDurationParts): string {
  if (parts.expired) {
    return "0d · 0h · 0m";
  }

  const segments: string[] = [];

  if (parts.days > 0) {
    segments.push(`${parts.days}d`);
  }

  segments.push(`${parts.hours}h`);
  segments.push(`${parts.minutes}m`);

  return segments.join(" · ");
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
