import type { VisionExtractedField, VisionFieldStatus } from "src/modules/vision-ai/identity-document.types";

const MAX_TEXT = 200;

export function cleanOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed.slice(0, MAX_TEXT);
}

export function cleanIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return trimmed;
}

export function cleanSex(value: unknown): "M" | "F" | "X" | null {
  if (typeof value !== "string") return null;
  const upper = value.trim().toUpperCase();
  if (upper === "M" || upper === "MALE") return "M";
  if (upper === "F" || upper === "FEMALE") return "F";
  if (upper === "X") return "X";
  return null;
}

export function fieldFromValue(value: string | null, status?: VisionFieldStatus): VisionExtractedField {
  if (value == null) return { value: null, status: "MISSING" };
  return { value, status: status ?? "CANDIDATE" };
}

export function statusToPolicyConfidence(status: VisionFieldStatus): number | null {
  switch (status) {
    case "CONFIRMED":
      return 1;
    case "CANDIDATE":
      return 0.9;
    case "REVIEW_REQUIRED":
      return 0.5;
    case "MISSING":
      return null;
    default:
      return null;
  }
}
