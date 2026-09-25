import { normalizePlateNumber } from "src/lib/master-data/code";

/** Known UAE emirate prefixes stored as the first token(s) of a combined plate. */
const EMIRATE_PREFIXES = [
  "ABU DHABI",
  "UMM AL QUWAIN",
  "RAS AL KHAIMAH",
  "DUBAI",
  "SHARJAH",
  "AJMAN",
  "FUJAIRAH",
] as const;

export interface VehiclePlateFields {
  plateCode: string | null;
  plateNumber: string | null;
}

function stripEmiratePrefix(tokens: string[]): string[] {
  for (const emirate of EMIRATE_PREFIXES) {
    const emirateTokens = emirate.split(" ");
    if (tokens.length <= emirateTokens.length) continue;
    const prefix = tokens.slice(0, emirateTokens.length).join(" ");
    if (prefix === emirate) return tokens.slice(emirateTokens.length);
  }
  return tokens;
}

/**
 * Resolves contract-facing plate code and plate number from Vehicle data.
 * When structured `plateCode` exists on Vehicle it wins; otherwise the combined
 * registration plate is split into code + numeric number (emirate prefix omitted).
 */
export function resolveVehiclePlateFields(input: {
  plateNumber: string | null | undefined;
  plateCode?: string | null | undefined;
}): VehiclePlateFields {
  const structuredCode = input.plateCode?.trim() || null;
  const rawPlate = input.plateNumber?.trim() || null;
  if (!rawPlate && !structuredCode) return { plateCode: null, plateNumber: null };

  if (structuredCode) {
    return {
      plateCode: structuredCode,
      plateNumber: rawPlate,
    };
  }

  if (!rawPlate) return { plateCode: null, plateNumber: null };

  const normalized = normalizePlateNumber(rawPlate);
  const tokens = stripEmiratePrefix(normalized.split(" "));

  if (tokens.length >= 2) {
    const numeric = tokens[tokens.length - 1]!;
    const code = tokens[tokens.length - 2]!;
    if (/^\d+$/.test(numeric) && /^[A-Z]{1,3}$/.test(code)) {
      return { plateCode: code, plateNumber: numeric };
    }
  }

  if (tokens.length === 1 && /^\d+$/.test(tokens[0]!)) {
    return { plateCode: null, plateNumber: tokens[0]! };
  }

  return { plateCode: null, plateNumber: normalized };
}
