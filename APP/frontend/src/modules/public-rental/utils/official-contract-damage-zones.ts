import type { DamageMark, DamageMarkType } from "../types/official-contract.types";

/**
 * Tap zones laid over the demo vehicle diagrams (coordinates in each SVG's own
 * viewBox). Zone ids are the structured values the Backend validates
 * (`official-contract-interactive.ts`): `<VIEW>.<ZONE>`.
 */

export type DiagramView = "TOP" | "LEFT" | "RIGHT" | "FRONT_REAR";

export type ZoneShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number }
  | { kind: "circle"; cx: number; cy: number; r: number };

export interface DamageZone {
  id: string;
  shape: ZoneShape;
}

const rect = (x: number, y: number, w: number, h: number): ZoneShape => ({ kind: "rect", x, y, w, h });
const circle = (cx: number, cy: number, r: number): ZoneShape => ({ kind: "circle", cx, cy, r });

/** Top view, 340 × 170 (front of the car on the left). */
const TOP: Array<[string, ZoneShape]> = [
  ["FRONT_BUMPER", rect(22, 40, 22, 90)],
  ["HOOD", rect(44, 44, 58, 82)],
  ["WINDSHIELD", rect(102, 44, 33, 82)],
  ["ROOF", rect(135, 44, 88, 82)],
  ["REAR_WINDOW", rect(223, 44, 29, 82)],
  ["TRUNK", rect(252, 44, 44, 82)],
  ["REAR_BUMPER", rect(296, 40, 18, 90)],
  ["UPPER_FRONT", rect(44, 18, 136, 26)],
  ["UPPER_REAR", rect(180, 18, 116, 26)],
  ["LOWER_FRONT", rect(44, 126, 136, 26)],
  ["LOWER_REAR", rect(180, 126, 116, 26)],
];

/** Side view, 210 × 84 (front of the car on the left). */
const SIDE: Array<[string, ZoneShape]> = [
  ["WINDOWS", rect(62, 11, 97, 23)],
  ["FRONT_WHEEL", circle(52, 66, 13)],
  ["REAR_WHEEL", circle(162, 66, 13)],
  ["FRONT_BUMPER", rect(4, 38, 18, 28)],
  ["FRONT_FENDER", rect(22, 34, 46, 18)],
  ["FRONT_DOOR", rect(68, 34, 39, 30)],
  ["REAR_DOOR", rect(107, 34, 43, 30)],
  ["REAR_FENDER", rect(150, 34, 42, 18)],
  ["REAR_BUMPER", rect(192, 40, 14, 26)],
];

/** Front/rear view, 130 × 84. */
const END: Array<[string, ZoneShape]> = [
  ["GLASS", rect(33, 10, 64, 17)],
  ["LEFT_LIGHT", rect(18, 40, 22, 15)],
  ["RIGHT_LIGHT", rect(90, 40, 22, 15)],
  ["GRILLE", rect(42, 40, 46, 16)],
  ["BUMPER", rect(16, 56, 98, 12)],
];

function zones(view: DiagramView, list: Array<[string, ZoneShape]>): DamageZone[] {
  return list.map(([id, shape]) => ({ id: `${view}.${id}`, shape }));
}

export const DAMAGE_ZONE_MAP: Record<DiagramView, DamageZone[]> = {
  TOP: zones("TOP", TOP),
  LEFT: zones("LEFT", SIDE),
  RIGHT: zones("RIGHT", SIDE),
  FRONT_REAR: zones("FRONT_REAR", END),
};

export const DAMAGE_MARK_TYPES: DamageMarkType[] = ["SCRATCH", "DENT", "BROKEN", "MISSING"];

/** Demo damage toolbar labels (Arabic, as in the paper demo). */
export const DAMAGE_MARK_LABELS: Record<DamageMarkType, { glyph: string; ar: string; en: string }> = {
  SCRATCH: { glyph: "✕", ar: "خدش", en: "Scratch" },
  DENT: { glyph: "◯", ar: "انبعاج", en: "Dent" },
  BROKEN: { glyph: "△", ar: "كسر", en: "Broken" },
  MISSING: { glyph: "▢", ar: "مفقود", en: "Missing" },
};

export function zoneCenter(shape: ZoneShape): { x: number; y: number } {
  return shape.kind === "rect"
    ? { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 }
    : { x: shape.cx, y: shape.cy };
}

/**
 * Tapping a zone with the active tool: same type → remove; otherwise set.
 * One mark per zone, matching the Backend's structured model.
 */
export function toggleDamageMark(marks: readonly DamageMark[], zone: string, type: DamageMarkType): DamageMark[] {
  const existing = marks.find((m) => m.zone === zone);
  const rest = marks.filter((m) => m.zone !== zone);
  if (existing && existing.type === type) return rest;
  return [...rest, { zone, type }];
}
