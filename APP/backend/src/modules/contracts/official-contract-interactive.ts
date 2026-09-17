import type { OfficialContractSignatureSlot } from "@prisma/client";

/**
 * Structured interactive paper features of the official contract: damage zones
 * on the demo vehicle diagrams, signature slots, and their lifecycle rules.
 * Zone ids mirror the frontend hotspot map (`official-contract-damage-zones.ts`).
 */

export const DAMAGE_MARK_TYPES = ["SCRATCH", "DENT", "BROKEN", "MISSING"] as const;
export type DamageMarkType = (typeof DAMAGE_MARK_TYPES)[number];

const SIDE_ZONES = [
  "FRONT_BUMPER",
  "FRONT_FENDER",
  "FRONT_DOOR",
  "REAR_DOOR",
  "REAR_FENDER",
  "REAR_BUMPER",
  "WINDOWS",
  "FRONT_WHEEL",
  "REAR_WHEEL",
] as const;

export const DAMAGE_ZONES: readonly string[] = [
  ...[
    "FRONT_BUMPER",
    "HOOD",
    "WINDSHIELD",
    "ROOF",
    "REAR_WINDOW",
    "TRUNK",
    "REAR_BUMPER",
    "UPPER_FRONT",
    "UPPER_REAR",
    "LOWER_FRONT",
    "LOWER_REAR",
  ].map((z) => `TOP.${z}`),
  ...SIDE_ZONES.map((z) => `LEFT.${z}`),
  ...SIDE_ZONES.map((z) => `RIGHT.${z}`),
  ...["GLASS", "LEFT_LIGHT", "RIGHT_LIGHT", "GRILLE", "BUMPER"].map((z) => `FRONT_REAR.${z}`),
];

export interface DamageMark {
  zone: string;
  type: DamageMarkType;
}

/** Normalizes stored JSON into valid marks (unknown zones/types dropped, one mark per zone). */
export function readDamageMarks(value: unknown): DamageMark[] {
  if (!Array.isArray(value)) return [];
  const byZone = new Map<string, DamageMark>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { zone, type } = item as Record<string, unknown>;
    if (typeof zone !== "string" || !DAMAGE_ZONES.includes(zone)) continue;
    if (typeof type !== "string" || !(DAMAGE_MARK_TYPES as readonly string[]).includes(type)) continue;
    byZone.set(zone, { zone, type: type as DamageMarkType });
  }
  return [...byZone.values()];
}

export const SIGNATURE_SLOTS: readonly OfficialContractSignatureSlot[] = [
  "HIRER",
  "ADDITIONAL_DRIVER",
  "SPONSOR",
  "VEHICLE_OUT_HIRER",
  "VEHICLE_IN_HIRER",
];

/** Slots the customer may capture on the public rental contract. Vehicle OUT / IN are captured by staff at Car-Out / Car-In. */
export const PUBLIC_SIGNABLE_SLOTS: readonly OfficialContractSignatureSlot[] = [
  "HIRER",
  "ADDITIONAL_DRIVER",
  "SPONSOR",
];

export const SIGNATURE_UPLOAD_MIME = ["image/png"] as const;

/**
 * Signatures required to sign the contract: the hirer always; the additional
 * driver and sponsor only when their details are filled. Vehicle IN never at
 * the rental-signing stage.
 */
export function requiredSignatureSlots(input: {
  additionalDriver: { name: string | null; nationality: string | null; driverLicenseNumber: string | null };
  sponsor: { name: string | null; idNumber: string | null };
}): OfficialContractSignatureSlot[] {
  const slots: OfficialContractSignatureSlot[] = ["HIRER"];
  if (Object.values(input.additionalDriver).some(Boolean)) slots.push("ADDITIONAL_DRIVER");
  if (Object.values(input.sponsor).some(Boolean)) slots.push("SPONSOR");
  return slots;
}
