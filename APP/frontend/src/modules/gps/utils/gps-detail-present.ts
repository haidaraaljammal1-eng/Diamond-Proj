import type { GpsBindingDto, GpsDisplayMotionStatus } from "../types/gps.types.ts";

/** User-visible placeholder when a GPS detail value is missing. */
export const GPS_DETAIL_PLACEHOLDER = "—";

type GpsProviderLabelTranslator = (
  key: "filters.liveGps" | "filters.sevenStars",
) => string;

/** Vehicle binding provider — never from list/map UI filters. */
export function gpsDetailProviderLabel(
  binding: GpsBindingDto | undefined,
  t: GpsProviderLabelTranslator,
): string {
  if (!binding?.assigned) return GPS_DETAIL_PLACEHOLDER;
  if (binding.providerKey === "LIVE_GPS") return t("filters.liveGps");
  if (binding.providerKey === "SEVEN_STARS") return t("filters.sevenStars");
  return GPS_DETAIL_PLACEHOLDER;
}

const HEADING_CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export type GpsHeadingCardinal = (typeof HEADING_CARDINALS)[number];

export function formatGpsDetailSpeedValue(
  speedKph: number | null | undefined,
): string | null {
  if (speedKph == null || !Number.isFinite(speedKph)) return null;
  return String(Math.round(speedKph));
}

export function formatGpsDetailCoordinate(
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return GPS_DETAIL_PLACEHOLDER;
  return value.toFixed(6);
}

export function formatGpsDetailHeading(
  headingDegrees: number | null | undefined,
): string {
  if (headingDegrees == null || !Number.isFinite(headingDegrees)) {
    return GPS_DETAIL_PLACEHOLDER;
  }
  return `${Math.round(headingDegrees)}°`;
}

export function headingCardinalFromDegrees(
  headingDegrees: number,
): GpsHeadingCardinal {
  const normalized = ((headingDegrees % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;
  return HEADING_CARDINALS[index];
}

export function headingCardinalKey(headingDegrees: number): string {
  const cardinal = headingCardinalFromDegrees(headingDegrees);
  return `detail.headingCardinal.${cardinal}`;
}

/** Drawer engine label — derived from display motion only (not raw ignitionOn). */
export type GpsDetailEnginePresentation = "on" | "off";

export function gpsDetailEnginePresentationFromMotion(
  displayMotionStatus: GpsDisplayMotionStatus,
): GpsDetailEnginePresentation {
  if (displayMotionStatus === "parked") return "off";
  return "on";
}

/**
 * Drawer speed — derived from display motion (idle/parked always 0; moving uses raw speedKph).
 * Returns `null` when moving but speed is missing (UI shows —).
 */
export function gpsDetailDisplayedSpeedKph(
  displayMotionStatus: GpsDisplayMotionStatus,
  speedKph: number | null | undefined,
): number | null {
  if (displayMotionStatus !== "moving") return 0;
  if (speedKph == null || !Number.isFinite(speedKph)) return null;
  return speedKph;
}
