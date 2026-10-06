const WEIGHTS = [7, 3, 1];

function mrzCharValue(char: string): number {
  if (char >= "0" && char <= "9") return Number(char);
  if (char >= "A" && char <= "Z") return char.charCodeAt(0) - 55;
  if (char === "<") return 0;
  return -1;
}

export function mrzCheckDigit(data: string): number | null {
  if (!data.length) return null;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data[i];
    if (char === undefined) return null;
    const value = mrzCharValue(char);
    if (value < 0) return null;
    sum += value * (WEIGHTS[i % 3] ?? 0);
  }
  return sum % 10;
}

export function mrzDigitMatches(data: string, digitChar: string): boolean {
  const expected = mrzCheckDigit(data);
  if (expected == null) return false;
  const actual = Number(digitChar);
  return Number.isInteger(actual) && actual === expected;
}

export interface ParsedTd3Mrz {
  line2: string;
  passportNumber: string;
  nationality: string;
  dateOfBirth: string;
  sex: string;
  expiryDate: string;
}

function normalizeMrzLine(line: string): string {
  return line.trim().replace(/\s+/g, "").toUpperCase();
}

export function parseTd3MrzLines(line1: string, line2: string): ParsedTd3Mrz | null {
  const l1 = normalizeMrzLine(line1);
  const l2 = normalizeMrzLine(line2);
  if (l1.length < 44 || l2.length < 44) return null;
  if (!l1.startsWith("P")) return null;

  return {
    line2: l2,
    passportNumber: l2.slice(0, 9).replace(/</g, "").trim(),
    nationality: l2.slice(10, 13).replace(/</g, "").trim(),
    dateOfBirth: l2.slice(13, 19),
    sex: l2[20] ?? "",
    expiryDate: l2.slice(21, 27),
  };
}

export function mrzYyMmDdToIso(yymmdd: string, kind: "dob" | "expiry", now = new Date()): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  let year: number;
  if (kind === "expiry") {
    year = 2000 + yy;
  } else {
    const currentYy = now.getUTCFullYear() % 100;
    year = yy > currentYy ? 1900 + yy : 2000 + yy;
  }
  const probe = new Date(Date.UTC(year, mm - 1, dd));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== mm - 1 || probe.getUTCDate() !== dd) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${mm.toString().padStart(2, "0")}-${dd.toString().padStart(2, "0")}`;
}

export interface Td3MrzValidation {
  checksumValid: boolean;
  passportNumberChecksumValid: boolean;
  dateOfBirthChecksumValid: boolean;
  expiryDateChecksumValid: boolean;
  parsed: ParsedTd3Mrz | null;
  isoDateOfBirth: string | null;
  isoExpiryDate: string | null;
}

export function validateTd3Mrz(line1: string | null, line2: string | null): Td3MrzValidation {
  const empty: Td3MrzValidation = {
    checksumValid: false,
    passportNumberChecksumValid: false,
    dateOfBirthChecksumValid: false,
    expiryDateChecksumValid: false,
    parsed: null,
    isoDateOfBirth: null,
    isoExpiryDate: null,
  };
  if (!line1?.trim() || !line2?.trim()) return empty;

  const parsed = parseTd3MrzLines(line1, line2);
  if (!parsed) return empty;
  const l2 = parsed.line2;

  const passportNumberChecksumValid = mrzDigitMatches(l2.slice(0, 9), l2[9] ?? "");
  const dateOfBirthChecksumValid = mrzDigitMatches(parsed.dateOfBirth, l2[19] ?? "");
  const expiryDateChecksumValid = mrzDigitMatches(parsed.expiryDate, l2[27] ?? "");
  const composite = `${l2.slice(0, 10)}${l2.slice(13, 20)}${l2.slice(21, 28)}${l2.slice(28, 43)}`;
  const compositeValid = mrzDigitMatches(composite, l2[43] ?? "");

  return {
    checksumValid:
      passportNumberChecksumValid && dateOfBirthChecksumValid && expiryDateChecksumValid,
    passportNumberChecksumValid,
    dateOfBirthChecksumValid,
    expiryDateChecksumValid,
    parsed,
    isoDateOfBirth: mrzYyMmDdToIso(parsed.dateOfBirth, "dob"),
    isoExpiryDate: mrzYyMmDdToIso(parsed.expiryDate, "expiry"),
  };
}
