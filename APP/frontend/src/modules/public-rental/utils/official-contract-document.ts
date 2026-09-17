import { z } from "zod";
import type {
  DamageMark,
  OfficialContractEdits,
  OfficialContractMode,
  OfficialContractReviewField,
  OfficialContractReviewPatch,
  OfficialContractView,
  OfficialSignatureSlot,
  OfficialSignatureSlotKey,
} from "../types/official-contract.types";
import { CONTRACT_FIELD_CATALOG } from "./official-contract-template.ts";

/**
 * Pure presentation model for the A4 agreement. Every decision about which
 * value goes where, what is blank, what is editable, and how long values stay
 * fully readable lives here so the renderer stays dumb and the rules are
 * testable. No network, no simulation branch.
 */

export const CONTRACT_TIME_ZONE = "Asia/Dubai";

export const FUEL_LEVELS = ["F", "7/8", "3/4", "5/8", "1/2", "3/8", "1/4", "1/8", "E"] as const;

export const CARD_BOXES = 16;

/** Value type size so long values wrap/shrink instead of being cut (never ellipsis). */
export type ValueSize = "md" | "sm" | "xs";

export interface ContractFieldModel {
  path: string;
  en: string;
  ar: string;
  /** Display text. Always a string: null values render as an empty cell. */
  value: string;
  size: ValueSize;
  /** PATCH key when this field is editable right now. */
  editableField: OfficialContractReviewField | null;
  dir: "ltr" | "rtl" | "auto";
}

export interface ContractCellModel {
  fields: ContractFieldModel[];
  /** Columns this cell spans (a removed/empty paper cell is absorbed by its neighbour). */
  span: number;
}

export interface CustodyModel {
  status: "NOT_AVAILABLE" | "RECORDED";
  mileage: string;
  fuel: string;
  /** 0..1 fill of the horizontal fuel bar, or null when unknown. */
  fuelFill: number | null;
  fuelLabel: string;
  damage: DamageMark[];
  damageEditable: boolean;
}

export interface SignatureModel {
  slot: OfficialSignatureSlot;
  status: "NOT_SIGNED" | "SIGNED";
  hasImage: boolean;
  required: boolean;
  editable: boolean;
}

export interface CardModel {
  /** One character per paper box: a digit, "•" for a stored masked digit, or "". */
  boxes: string[];
}

export interface OfficialContractDocument {
  mode: OfficialContractMode;
  agreementNumber: string;
  grid: ContractCellModel[][];
  mileageTerms: { includedKmPerDay: string; extraKmRate: string };
  vehicleOut: CustodyModel;
  vehicleIn: CustodyModel;
  card: CardModel;
  signatures: Record<OfficialSignatureSlot, SignatureModel>;
}

export interface ContractInteractiveState {
  edits?: OfficialContractEdits;
  /** Local Vehicle OUT damage marks; undefined = unchanged from the Backend. */
  damageOut?: DamageMark[];
  /** Locally drawn ("DRAWN") or cleared ("CLEAR") signatures not yet saved. */
  pendingSignatures?: Partial<Record<OfficialSignatureSlot, "DRAWN" | "CLEAR">>;
}

export const SIGNATURE_SLOT_KEYS: Record<OfficialSignatureSlot, OfficialSignatureSlotKey> = {
  hirer: "HIRER",
  additionalDriver: "ADDITIONAL_DRIVER",
  sponsor: "SPONSOR",
  vehicleOutHirer: "VEHICLE_OUT_HIRER",
  vehicleInHirer: "VEHICLE_IN_HIRER",
};

export const SIGNATURE_SLOT_PATHS: Record<OfficialSignatureSlot, string> = {
  hirer: "hirer",
  additionalDriver: "additional-driver",
  sponsor: "sponsor",
  vehicleOutHirer: "vehicle-out-hirer",
  vehicleInHirer: "vehicle-in-hirer",
};

function text(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

/** Longer values get a smaller type step and wrap; nothing is truncated. */
export function valueSize(value: string): ValueSize {
  if (value.length > 26) return "xs";
  if (value.length > 16) return "sm";
  return "md";
}

function part(iso: string | null | undefined, kind: "date" | "time"): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const options: Intl.DateTimeFormatOptions =
    kind === "date"
      ? { timeZone: CONTRACT_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }
      : { timeZone: CONTRACT_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  return new Intl.DateTimeFormat("en-GB", options).format(date);
}

/** `YYYY-MM-DD` calendar date → `DD/MM/YYYY` without any timezone shift. */
export function formatCalendarDate(value: string | null | undefined): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

function read(view: OfficialContractView, path: string): unknown {
  let node: unknown = view;
  for (const key of path.split(".")) {
    if (node === null || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** Resolves a Backend layout token: `a|b` fallback, optional `@date` / `@time`. */
export function resolveLayoutValue(view: OfficialContractView, token: string): string {
  const [paths, format] = token.split("@") as [string, "date" | "time" | undefined];
  for (const path of paths.split("|")) {
    const raw = read(view, path);
    if (raw === null || raw === undefined || raw === "") continue;
    if (format) return part(String(raw), format);
    if (path === "hirer.driverLicenseExpiryDate") return formatCalendarDate(String(raw));
    return text(raw as string | number);
  }
  return "";
}

function isEditable(view: OfficialContractView, mode: OfficialContractMode, key: string): boolean {
  return mode === "REVIEW" && view.permissions.canEdit && view.permissions.editableFields.includes(key);
}

function fieldModel(
  view: OfficialContractView,
  token: string,
  edits: OfficialContractEdits,
  mode: OfficialContractMode,
): ContractFieldModel | null {
  const catalog = CONTRACT_FIELD_CATALOG[token];
  if (!catalog) return null;
  const reviewField = catalog.reviewField as OfficialContractReviewField | undefined;
  const editable = reviewField !== undefined && isEditable(view, mode, reviewField);
  const edited = reviewField ? edits[reviewField] : undefined;
  const value = editable && edited !== undefined ? edited : resolveLayoutValue(view, token);
  return {
    path: token,
    en: catalog.en,
    ar: catalog.ar,
    value,
    size: valueSize(value),
    editableField: editable ? reviewField! : null,
    dir: catalog.dir,
  };
}

const FUEL_LABELS: Record<string, string> = { F: "Full", E: "Empty" };

function custody(
  block: OfficialContractView["vehicleOut"],
  damage: DamageMark[],
  damageEditable: boolean,
): CustodyModel {
  const index = block.fuel ? (FUEL_LEVELS as readonly string[]).indexOf(block.fuel) : -1;
  const steps = FUEL_LEVELS.length - 1;
  return {
    status: block.status,
    mileage: text(block.mileage),
    fuel: text(block.fuel),
    fuelFill: index >= 0 ? (steps - index) / steps : null,
    fuelLabel: index >= 0 ? (FUEL_LABELS[block.fuel!] ?? block.fuel!) : "",
    damage,
    damageEditable,
  };
}

function cardBoxes(view: OfficialContractView): string[] {
  const boxes = Array.from({ length: CARD_BOXES }, () => "");
  if (view.card.last4) {
    for (let i = 0; i < CARD_BOXES - 4; i++) boxes[i] = "•";
    view.card.last4.split("").forEach((d, i) => {
      boxes[CARD_BOXES - 4 + i] = d;
    });
  }
  return boxes;
}

export function buildOfficialContractDocument(
  view: OfficialContractView,
  options: { mode: OfficialContractMode } & ContractInteractiveState,
): OfficialContractDocument {
  const edits = options.edits ?? {};
  const grid = view.layout.infoGrid.map((row) => {
    const cells: ContractCellModel[] = [];
    for (const tokens of row) {
      const fields = tokens
        .map((token) => fieldModel(view, token, edits, options.mode))
        .filter((f): f is ContractFieldModel => f !== null);
      if (fields.length === 0) {
        // Empty paper cell (e.g. the removed Deposit): the next cell absorbs the column.
        cells.push({ fields: [], span: 0 });
        continue;
      }
      const pending = cells.at(-1);
      const span = pending && pending.span === 0 ? 2 : 1;
      if (pending && pending.span === 0) cells.pop();
      cells.push({ fields, span });
    }
    return cells.filter((cell) => cell.span > 0);
  });

  const pending = options.pendingSignatures ?? {};
  const signature = (slot: OfficialSignatureSlot): SignatureModel => {
    const saved = view.signatures[slot];
    const local = pending[slot];
    const signed = local === "DRAWN" || (local !== "CLEAR" && saved.status === "SIGNED");
    return {
      slot,
      status: signed ? "SIGNED" : "NOT_SIGNED",
      hasImage: local === undefined && saved.hasImage,
      required: requiredSignatureSlots(view, edits).includes(slot),
      editable:
        options.mode === "REVIEW" &&
        view.permissions.canEdit &&
        view.permissions.signableSlots.includes(SIGNATURE_SLOT_KEYS[slot]),
    };
  };

  return {
    mode: options.mode,
    agreementNumber: view.contract.agreementNumber,
    grid,
    mileageTerms: {
      includedKmPerDay: text(view.rental.includedKmPerDay),
      extraKmRate: text(view.rental.extraKmRate),
    },
    vehicleOut: custody(
      view.vehicleOut,
      options.damageOut ?? view.vehicleOut.damage,
      options.mode === "REVIEW" && view.permissions.vehicleOut.canEditDamage,
    ),
    // Vehicle IN damage belongs to the return workflow: shown, never editable here.
    vehicleIn: custody(view.vehicleIn, view.vehicleIn.damage, false),
    card: {
      boxes: cardBoxes(view),
    },
    signatures: {
      hirer: signature("hirer"),
      additionalDriver: signature("additionalDriver"),
      sponsor: signature("sponsor"),
      vehicleOutHirer: signature("vehicleOutHirer"),
      vehicleInHirer: signature("vehicleInHirer"),
    },
  };
}

/** Current Backend value of a review field (the baseline edits are compared against). */
export function reviewFieldValue(view: OfficialContractView, field: OfficialContractReviewField): string {
  const map: Record<OfficialContractReviewField, string | null> = {
    hirerName: view.hirer.name,
    nationality: view.hirer.nationality,
    passportNumber: view.hirer.passportNumber,
    address: view.hirer.address,
    telephone: view.hirer.telephone,
    additionalDriverName: view.additionalDriver.name,
    additionalDriverNationality: view.additionalDriver.nationality,
    additionalDriverLicenseNumber: view.additionalDriver.driverLicenseNumber,
    sponsorName: view.sponsor.name,
    sponsorIdNumber: view.sponsor.idNumber,
  };
  return map[field] ?? "";
}

/** Mirrors the Backend rule: hirer always; additional driver / sponsor when their details are filled. */
export function requiredSignatureSlots(
  view: OfficialContractView,
  edits: OfficialContractEdits = {},
): OfficialSignatureSlot[] {
  const value = (field: OfficialContractReviewField) =>
    (edits[field] ?? reviewFieldValue(view, field)).trim() !== "";
  const slots: OfficialSignatureSlot[] = ["hirer"];
  if (["additionalDriverName", "additionalDriverNationality", "additionalDriverLicenseNumber"].some((f) => value(f as OfficialContractReviewField))) {
    slots.push("additionalDriver");
  }
  if (["sponsorName", "sponsorIdNumber"].some((f) => value(f as OfficialContractReviewField))) {
    slots.push("sponsor");
  }
  return slots;
}

/**
 * PATCH body from local state: only fields the Backend lists as editable and
 * whose value changed. Card metadata is linked through Stripe-hosted UI, never
 * through Diamond-owned card-number inputs.
 */
export function buildReviewPatch(
  view: OfficialContractView,
  edits: OfficialContractEdits,
): OfficialContractReviewPatch {
  const patch: OfficialContractReviewPatch = {};
  if (!view.permissions.canEdit) return patch;
  for (const [key, raw] of Object.entries(edits) as Array<[OfficialContractReviewField, string]>) {
    if (!view.permissions.editableFields.includes(key)) continue;
    const next = raw.replace(/\s+/g, " ").trim();
    if (next === reviewFieldValue(view, key)) continue;
    patch[key] = next === "" ? null : next;
  }
  return patch;
}

const reviewText = (max: number) => z.string().min(1).max(max).nullable();

/** Value rules only (lengths/format). Editability comes from the Backend. */
export const officialContractReviewPatchSchema = z
  .object({
    hirerName: reviewText(200),
    nationality: reviewText(80),
    passportNumber: reviewText(50),
    address: reviewText(400),
    telephone: z.string().regex(/^\+?[\d\s()-]{6,30}$/).nullable(),
    additionalDriverName: reviewText(200),
    additionalDriverNationality: reviewText(80),
    additionalDriverLicenseNumber: reviewText(50),
    sponsorName: reviewText(200),
    sponsorIdNumber: reviewText(50),
    cardNumberLast4: z.string().regex(/^\d{4}$/).nullable(),
  })
  .partial();

export function invalidReviewFields(patch: OfficialContractReviewPatch): string[] {
  const result = officialContractReviewPatchSchema.safeParse(patch);
  if (result.success) return [];
  return [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
}
