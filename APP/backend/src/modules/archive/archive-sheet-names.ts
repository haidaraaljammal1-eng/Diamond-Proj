const INVALID_SHEET_CHARS = /[\\/?*[\]:]/g;
const MAX_SHEET_NAME_LENGTH = 31;

export interface ArchiveSheetVehicleInput {
  id: number;
  displayName: string;
  plateNumber: string | null;
}

function sanitizeBaseName(name: string): string {
  const cleaned = name.replace(INVALID_SHEET_CHARS, " ").replace(/\s+/g, " ").trim();
  return cleaned || "Vehicle";
}

function truncateSheetName(name: string): string {
  return name.length <= MAX_SHEET_NAME_LENGTH
    ? name
    : name.slice(0, MAX_SHEET_NAME_LENGTH).trimEnd();
}

function plateSuffix(plateNumber: string | null): string | null {
  const plate = plateNumber?.trim();
  if (!plate) return null;
  const compact = plate.replace(INVALID_SHEET_CHARS, " ").replace(/\s+/g, " ").trim();
  return compact || null;
}

function withSuffix(base: string, suffix: string): string {
  const candidate = `${base} - ${suffix}`;
  if (candidate.length <= MAX_SHEET_NAME_LENGTH) return candidate;
  const maxBase = MAX_SHEET_NAME_LENGTH - suffix.length - 3;
  const trimmedBase = maxBase > 0 ? base.slice(0, maxBase).trimEnd() : "";
  const joined = trimmedBase ? `${trimmedBase} - ${suffix}` : suffix;
  return truncateSheetName(joined);
}

/**
 * Deterministic unique worksheet names for Excel export.
 * 1. displayName (sanitized)
 * 2. duplicate displayName → append plate
 * 3. still duplicate → append numeric suffix
 */
export function buildArchiveSheetNames(
  vehicles: readonly ArchiveSheetVehicleInput[],
): Map<number, string> {
  const result = new Map<number, string>();
  const used = new Set<string>();

  const baseCounts = new Map<string, number>();
  for (const vehicle of vehicles) {
    const base = sanitizeBaseName(vehicle.displayName);
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);
  }

  for (const vehicle of vehicles) {
    const base = sanitizeBaseName(vehicle.displayName);
    const duplicateBase = (baseCounts.get(base) ?? 0) > 1;
    const plate = plateSuffix(vehicle.plateNumber);

    let candidate = truncateSheetName(base);
    if (duplicateBase && plate) {
      candidate = truncateSheetName(withSuffix(base, plate));
    }

    if (used.has(candidate)) {
      let index = 2;
      while (index < 10_000) {
        const suffix = plate ?? String(vehicle.id);
        const withIndex = truncateSheetName(withSuffix(base, `${suffix} (${index})`));
        if (!used.has(withIndex)) {
          candidate = withIndex;
          break;
        }
        index += 1;
      }
    }

    if (used.has(candidate)) {
      candidate = truncateSheetName(`Vehicle ${vehicle.id}`);
      let index = 2;
      while (used.has(candidate) && index < 10_000) {
        candidate = truncateSheetName(`Vehicle ${vehicle.id} (${index})`);
        index += 1;
      }
    }

    used.add(candidate);
    result.set(vehicle.id, candidate);
  }

  return result;
}
