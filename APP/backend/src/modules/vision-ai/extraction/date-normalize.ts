import { cleanIsoDate } from "src/modules/vision-ai/extraction/field-normalize";

export interface NormalizePrintedDateOptions {
  /** When day/month are both ≤12, treat as DD/MM (common on UAE/GCC licences). */
  preferDayFirst?: boolean;
}

export interface NormalizePrintedDateResult {
  iso: string | null;
  /** True when the string looked like a date but day/month order could not be resolved safely. */
  ambiguous: boolean;
}

function isoFromParts(year: number, month: number, day: number): string | null {
  const iso = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return cleanIsoDate(iso);
}

/**
 * Deterministic conversion of a printed calendar date to ISO (YYYY-MM-DD).
 * Accepts ISO input and common slash/dash/dot forms. Does not guess missing components.
 */
export function normalizePrintedDate(
  value: unknown,
  options?: NormalizePrintedDateOptions,
): NormalizePrintedDateResult {
  if (typeof value !== "string") return { iso: null, ambiguous: false };
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return { iso: null, ambiguous: false };

  const isoDirect = cleanIsoDate(trimmed);
  if (isoDirect) return { iso: isoDirect, ambiguous: false };

  const match = /^(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})$/.exec(trimmed);
  if (!match) return { iso: null, ambiguous: false };

  const part1 = match[1] ?? "";
  const part2 = match[2] ?? "";
  const part3 = match[3] ?? "";
  const n1 = Number(part1);
  const n2 = Number(part2);
  const n3 = Number(part3);
  if (![n1, n2, n3].every((n) => Number.isInteger(n) && n > 0)) {
    return { iso: null, ambiguous: false };
  }

  let year: number;
  let month: number;
  let day: number;

  if (part1.length === 4) {
    year = n1;
    month = n2;
    day = n3;
  } else if (part3.length === 4) {
    year = n3;
    if (n1 > 12 && n2 <= 12) {
      day = n1;
      month = n2;
    } else if (n2 > 12 && n1 <= 12) {
      day = n2;
      month = n1;
    } else if (n1 <= 12 && n2 <= 12) {
      if (options?.preferDayFirst) {
        day = n1;
        month = n2;
      } else {
        return { iso: null, ambiguous: true };
      }
    } else {
      return { iso: null, ambiguous: false };
    }
  } else {
    return { iso: null, ambiguous: false };
  }

  const iso = isoFromParts(year, month, day);
  return { iso, ambiguous: iso == null };
}

const UAE_COUNTRY_HINTS = [
  "UAE",
  "U.A.E",
  "UNITED ARAB EMIRATES",
  "EMIRATES",
  "دبي",
  "DUBAI",
  "ABU DHABI",
  "SHARJAH",
];

export function preferDayFirstForLicenceContext(issuingCountry: string | null, nationality: string | null): boolean {
  const blob = `${issuingCountry ?? ""} ${nationality ?? ""}`.toUpperCase();
  return UAE_COUNTRY_HINTS.some((hint) => blob.includes(hint));
}
