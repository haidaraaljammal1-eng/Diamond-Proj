import type { ContractStatus, OfficialContractSignatureSlot, Prisma } from "@prisma/client";
import { buildContractIdentityDraft } from "src/modules/contracts/contract-identity-draft";
import { isPeriodConsistent } from "src/modules/contracts/contracts-duration";
import type { OfficialContractView } from "src/modules/contracts/contracts.schema";
import { formatStoredExpiry } from "src/modules/contracts/driving-license-policy";
import { fleetVehicleTypeLabel } from "src/modules/vehicles/vehicles.mapper";
import { resolveVehiclePlateFields } from "src/modules/vehicles/vehicle-plate";
import {
  computePublicContractEditableFields,
} from "src/modules/contracts/official-contract-editability";
import {
  PUBLIC_SIGNABLE_SLOTS,
  readDamageMarks,
  requiredSignatureSlots,
} from "src/modules/contracts/official-contract-interactive";

/**
 * PRICE POLICY: the rental price (agreed amount, rate amount, rate basis) is
 * intentionally excluded from the official/public contract. Pricing remains
 * internal to Diamond (Contract, payment, Stripe, Finance, staff APIs).
 *
 * Official Contract — the one authoritative representation of the Diamond
 * rental agreement. Pure: composes already-loaded Diamond data, never calls an
 * OCR provider, never writes. Before signature every value is read live from
 * its source; the future legal snapshot serializes this exact view.
 */

export const OFFICIAL_CONTRACT_TEMPLATE_VERSION = "DIAMOND_CONTRACT_V1";

/**
 * Server-side field policy for the public review link. The link is a check of
 * the agreement: the customer captures contract-level signatures only. Card
 * entry is Stripe-hosted, and vehicle condition (damage marks, fuel, custody
 * signatures) is captured by staff at Car-Out / Car-In. Everything not listed
 * here is system-locked.
 */
export const OFFICIAL_CONTRACT_EDITABLE_FIELDS = [] as const;
export type OfficialContractEditableField = (typeof OFFICIAL_CONTRACT_EDITABLE_FIELDS)[number];

export const OFFICIAL_CONTRACT_SYSTEM_LOCKED_FIELDS = [
  "agreementNumber",
  "plateCode",
  "plateNumber",
  "vehicleType",
  "yearMade",
  "color",
  "notes",
  "driverLicenseNumber",
  "driverLicenseExpiryDate",
  "plannedStartAt",
  "plannedEndAt",
  "durationValue",
  "durationUnit",
  "includedKmPerDay",
  "extraKmRate",
  "vehicleOut",
  "vehicleIn",
  "signatures",
] as const;

/** Customer review is possible before signature only. */
export const OFFICIAL_CONTRACT_REVIEWABLE_STATUSES: readonly ContractStatus[] = ["AWAITING", "FORM"];

export type OfficialFieldSource =
  | "CONTRACT"
  | "VEHICLE"
  | "RENTAL_AGREEMENT"
  | "PASSPORT_OCR"
  | "DRIVER_LICENSE_OCR"
  | "CUSTOMER_REVIEW"
  | "CUSTOMER_RECORD"
  | "CAR_OUT"
  | "CAR_IN"
  | "CONTRACT_ACCEPTANCE"
  | "OFFICIAL_CONTRACT_TERMS"
  | "OFFICIAL_SIGNATURE"
  | "NONE";

export const OFFICIAL_CONTRACT_INCLUDE = {
  company: {
    select: {
      code: true,
      displayName: true,
      legalNameAr: true,
      legalNameEn: true,
      accentColor: true,
    },
  },
  vehicle: { include: { model: { select: { name: true } } } },
  customer: true,
  acceptance: { select: { acceptedAt: true } },
  licenseVerifications: { orderBy: { createdAt: "desc" as const }, take: 1 },
  passportExtractions: {
    where: { document: { supersededAt: null } },
    orderBy: { createdAt: "desc" as const },
    take: 1,
  },
  officialReviewDraft: true,
  cardPaymentMethod: true,
  officialSignatures: { select: { slot: true, capturedAt: true } },
  carOut: { select: { occurredAt: true, mileageOut: true, fuelOut: true, photos: { select: { angle: true } } } },
  carIn: { select: { occurredAt: true, mileageIn: true, fuelIn: true, photos: { select: { angle: true } } } },
} satisfies Prisma.ContractInclude;

export type OfficialContractRow = Prisma.ContractGetPayload<{ include: typeof OFFICIAL_CONTRACT_INCLUDE }>;

/** Paper order: header, agreement no, title, info grid, rates/km, OUT, IN, terms, signatures. */
export const OFFICIAL_CONTRACT_SECTIONS = [
  "header",
  "agreement",
  "title",
  "infoGrid",
  "rentalTerms",
  "vehicleOut",
  "vehicleIn",
  "legalTerms",
  "signatures",
] as const;

/**
 * Info grid rows as on the paper agreement (vehicle columns, then hirer column).
 * A cell lists one or more field paths; `a|b` means "a, else b" (actual custody
 * time, else planned) and `@time` / `@date` selects which part of a timestamp
 * the cell shows. Deposit is intentionally absent (Diamond V1: no deposit).
 */
export const OFFICIAL_CONTRACT_INFO_GRID: string[][][] = [
  [["vehicle.plateCode"], ["vehicle.vehicleType"], ["hirer.name"]],
  [["vehicle.yearMade"], ["vehicle.plateNumber"], ["hirer.nationality"]],
  [["vehicle.notes"], ["vehicle.color"], ["hirer.passportNumber"]],
  [["vehicleOut.occurredAt|rental.plannedStartAt@time"], ["vehicleOut.occurredAt|rental.plannedStartAt@date"], ["hirer.address", "hirer.telephone"]],
  [["vehicleIn.occurredAt|rental.plannedEndAt@time"], ["vehicleIn.occurredAt|rental.plannedEndAt@date"], ["hirer.driverLicenseExpiryDate", "hirer.driverLicenseNumber"]],
  [["additionalDriver.driverLicenseNumber"], ["additionalDriver.name"], ["additionalDriver.nationality", "sponsor.name"]],
  [[], ["rental.duration"], ["sponsor.idNumber"]],
];

interface Resolved<T> {
  value: T | null;
  source: OfficialFieldSource;
}

function pick<T>(...candidates: Array<[T | null | undefined, OfficialFieldSource]>): Resolved<T> {
  for (const [value, source] of candidates) {
    if (value !== null && value !== undefined && value !== "") return { value, source };
  }
  return { value: null, source: "NONE" };
}

export interface OfficialContractBuild {
  view: OfficialContractView;
  /** Internal provenance per field path. Not part of the public response. */
  provenance: Record<string, OfficialFieldSource>;
}

export function buildOfficialContractView(
  row: OfficialContractRow,
  options: { officeDisplayName: string; now?: Date; requiresCardSetupBeforeSigning?: boolean },
): OfficialContractBuild {
  // The company comes from the Contract's own (historical) company, never from
  // the Vehicle's current owner.
  const company = {
    code: row.company.code,
    displayName: row.company.displayName,
    legalNameAr: row.company.legalNameAr,
    legalNameEn: row.company.legalNameEn,
    accentColor: row.company.accentColor,
  };
  const now = options.now ?? new Date();
  const license = row.licenseVerifications[0] ?? null;
  const passport = row.passportExtractions[0] ?? null;
  const identity = buildContractIdentityDraft({ license, passport, now });
  const review = row.officialReviewDraft;
  const customer = row.customer;
  const provenance: Record<string, OfficialFieldSource> = {};
  const track = <T>(path: string, resolved: Resolved<T>): T | null => {
    provenance[path] = resolved.source;
    return resolved.value;
  };
  const fixed = <T>(path: string, value: T | null | undefined, source: OfficialFieldSource): T | null =>
    track(path, pick<T>([value, source]));

  const hirer = {
    name: track("hirer.name", pick<string>(
      [review?.hirerName, "CUSTOMER_REVIEW"],
      [identity.fullName.value, "PASSPORT_OCR"],
      [customer?.name, "CUSTOMER_RECORD"],
    )),
    nationality: track("hirer.nationality", pick<string>(
      [review?.nationality, "CUSTOMER_REVIEW"],
      [identity.nationality.value, "PASSPORT_OCR"],
      [customer?.nationality, "CUSTOMER_RECORD"],
    )),
    passportNumber: track("hirer.passportNumber", pick<string>(
      [review?.passportNumber, "CUSTOMER_REVIEW"],
      [identity.passportNumber.value, "PASSPORT_OCR"],
      [customer?.passportNumber ?? customer?.identityNumber, "CUSTOMER_RECORD"],
    )),
    address: track("hirer.address", pick<string>(
      [review?.address, "CUSTOMER_REVIEW"],
      [customer?.address, "CUSTOMER_RECORD"],
    )),
    telephone: track("hirer.telephone", pick<string>(
      [review?.telephone, "CUSTOMER_REVIEW"],
      [customer?.mobile, "CUSTOMER_RECORD"],
    )),
    // License fields are OCR-derived only (no customer correction without an explicit business decision).
    driverLicenseNumber: track("hirer.driverLicenseNumber", pick<string>(
      [identity.driverLicenseNumber.value, "DRIVER_LICENSE_OCR"],
      [customer?.drivingLicenseNumber, "CUSTOMER_RECORD"],
    )),
    driverLicenseExpiryDate: track("hirer.driverLicenseExpiryDate", pick<string>(
      [identity.driverLicenseExpiryDate.value, "DRIVER_LICENSE_OCR"],
      [formatStoredExpiry(customer?.drivingLicenseExpiry ?? null), "CUSTOMER_RECORD"],
    )),
  };

  const custody = (
    prefix: "vehicleOut" | "vehicleIn",
    event: { occurredAt: Date; mileage: number; fuel: string; photos: { angle: OfficialContractView["vehicleOut"]["inspectionAngles"][number] }[] } | null,
    source: OfficialFieldSource,
    damage: unknown,
    signature: OfficialContractView["signatures"]["hirer"],
  ) => ({
    status: event ? ("RECORDED" as const) : ("NOT_AVAILABLE" as const),
    occurredAt: fixed(`${prefix}.occurredAt`, event?.occurredAt, source),
    mileage: fixed(`${prefix}.mileage`, event?.mileage, source),
    fuel: fixed(`${prefix}.fuel`, event?.fuel, source),
    inspectionAngles: event ? event.photos.map((p) => p.angle) : [],
    damage: readDamageMarks(damage),
    signatureStatus: signature.status,
  });

  const reviewable = OFFICIAL_CONTRACT_REVIEWABLE_STATUSES.includes(row.status);
  const canEdit = reviewable && (row.status === "FORM" || identity.identityReady);

  const additionalDriver = {
    name: fixed("additionalDriver.name", review?.additionalDriverName, "CUSTOMER_REVIEW"),
    nationality: fixed("additionalDriver.nationality", review?.additionalDriverNationality, "CUSTOMER_REVIEW"),
    driverLicenseNumber: fixed(
      "additionalDriver.driverLicenseNumber",
      review?.additionalDriverLicenseNumber,
      "CUSTOMER_REVIEW",
    ),
  };
  const sponsor = {
    name: fixed("sponsor.name", review?.sponsorName, "CUSTOMER_REVIEW"),
    idNumber: fixed("sponsor.idNumber", review?.sponsorIdNumber, "CUSTOMER_REVIEW"),
  };

  const required = new Set(requiredSignatureSlots({ additionalDriver, sponsor }));
  const captured = new Map(row.officialSignatures.map((s) => [s.slot, s.capturedAt]));
  const signature = (slot: OfficialContractSignatureSlot) => {
    const capturedAt = captured.get(slot) ?? null;
    // A legacy acceptance (pre-interactive signing) still counts as the hirer's signature.
    const legacy = slot === "HIRER" && !capturedAt && row.acceptance ? row.acceptance.acceptedAt : null;
    return {
      status: capturedAt || legacy ? ("SIGNED" as const) : ("NOT_SIGNED" as const),
      signedAt: capturedAt ?? legacy,
      hasImage: capturedAt !== null,
      required: reviewable && required.has(slot),
    };
  };
  const signatures = {
    hirer: signature("HIRER"),
    additionalDriver: signature("ADDITIONAL_DRIVER"),
    sponsor: signature("SPONSOR"),
    vehicleOutHirer: signature("VEHICLE_OUT_HIRER"),
    vehicleInHirer: signature("VEHICLE_IN_HIRER"),
  };

  const missingRequirements: string[] = [];
  if (reviewable) {
    if (row.status === "AWAITING" && !identity.identityReady) missingRequirements.push("IDENTITY");
    if (!hirer.name) missingRequirements.push("HIRER_NAME");
    if (!hirer.nationality) missingRequirements.push("NATIONALITY");
    if (!hirer.passportNumber) missingRequirements.push("PASSPORT_NUMBER");
    if (!hirer.address) missingRequirements.push("ADDRESS");
    if (!hirer.telephone) missingRequirements.push("TELEPHONE");
    if (!hirer.driverLicenseNumber) missingRequirements.push("DRIVER_LICENSE_NUMBER");
    if (!hirer.driverLicenseExpiryDate) missingRequirements.push("DRIVER_LICENSE_EXPIRY");
    if (options.requiresCardSetupBeforeSigning &&
        !(row.cardPaymentMethod?.provider === "stripe" && row.cardPaymentMethod.stripeCustomerId && row.cardPaymentMethod.stripePaymentMethodId)) {
      missingRequirements.push("CARD_SETUP");
    }
    for (const slot of required) {
      if (!captured.has(slot)) missingRequirements.push(`SIGNATURE_${slot}`);
    }
  }

  const editableFields = reviewable
    ? computePublicContractEditableFields(provenance, {
        "hirer.name": hirer.name,
        "hirer.nationality": hirer.nationality,
        "hirer.passportNumber": hirer.passportNumber,
        "hirer.address": hirer.address,
        "hirer.telephone": hirer.telephone,
        "additionalDriver.name": additionalDriver.name,
        "additionalDriver.nationality": additionalDriver.nationality,
        "additionalDriver.driverLicenseNumber": additionalDriver.driverLicenseNumber,
        "sponsor.name": sponsor.name,
        "sponsor.idNumber": sponsor.idNumber,
      })
    : [];

  const live: OfficialContractView = {
    header: { officeDisplayName: options.officeDisplayName, company },
    contract: {
      agreementNumber: row.contractNumber,
      status: row.status,
      templateVersion: OFFICIAL_CONTRACT_TEMPLATE_VERSION,
      termsVersion: row.termsVersion,
    },
    vehicle: {
      ...(() => {
        const vehiclePlate = resolveVehiclePlateFields({ plateNumber: row.vehicle.plateNumber });
        const plateCodeFromReview = review?.plateCode?.trim() || null;
        return {
          plateCode: fixed(
            "vehicle.plateCode",
            plateCodeFromReview ?? vehiclePlate.plateCode,
            plateCodeFromReview ? "OFFICIAL_CONTRACT_TERMS" : "VEHICLE",
          ),
          plateNumber: fixed("vehicle.plateNumber", vehiclePlate.plateNumber, "VEHICLE"),
        };
      })(),
      vehicleType: fixed(
        "vehicle.vehicleType",
        fleetVehicleTypeLabel(row.vehicle.vehicleName, row.vehicle.model?.name ?? null),
        "VEHICLE",
      ),
      yearMade: fixed("vehicle.yearMade", row.vehicle.modelYear, "VEHICLE"),
      color: fixed("vehicle.color", row.vehicle.color, "VEHICLE"),
      // Contract-visible notes only (staff-set). Internal/operational notes are never exposed.
      notes: fixed("vehicle.notes", review?.contractNotes, "OFFICIAL_CONTRACT_TERMS"),
    },
    hirer,
    additionalDriver,
    sponsor,
    rental: {
      plannedStartAt: fixed("rental.plannedStartAt", row.startAt, "RENTAL_AGREEMENT"),
      plannedEndAt: fixed("rental.plannedEndAt", row.endAt, "RENTAL_AGREEMENT"),
      durationValue: row.durationValue,
      durationUnit: row.durationUnit,
      periodConsistent: isPeriodConsistent(
        row.startAt,
        row.endAt,
        row.durationValue,
        row.durationUnit,
      ),
      // No rental-agreement source exists: staff-set official-contract terms, never defaulted.
      includedKmPerDay: fixed("rental.includedKmPerDay", review?.includedKmPerDay, "OFFICIAL_CONTRACT_TERMS"),
      extraKmRate: fixed(
        "rental.extraKmRate",
        review?.extraKmRate != null ? Number(review.extraKmRate) : null,
        "OFFICIAL_CONTRACT_TERMS",
      ),
    },
    card: { last4: fixed("card.last4", row.cardPaymentMethod?.provider === "stripe" ? row.cardPaymentMethod.cardLast4 : null, "CUSTOMER_REVIEW") },
    vehicleOut: custody(
      "vehicleOut",
      row.carOut
        ? { occurredAt: row.carOut.occurredAt, mileage: row.carOut.mileageOut, fuel: row.carOut.fuelOut, photos: row.carOut.photos }
        : null,
      "CAR_OUT",
      review?.damageOut,
      signatures.vehicleOutHirer,
    ),
    vehicleIn: custody(
      "vehicleIn",
      row.carIn
        ? { occurredAt: row.carIn.occurredAt, mileage: row.carIn.mileageIn, fuel: row.carIn.fuelIn, photos: row.carIn.photos }
        : null,
      "CAR_IN",
      review?.damageIn,
      signatures.vehicleInHirer,
    ),
    signatures,
    identity: { identityReady: identity.identityReady },
    permissions: {
      // Field policy is listed whenever the agreement is still reviewable; `canEdit`
      // carries the identity gate. The server enforces both on every write.
      canEdit,
      editableFields: [...editableFields],
      // Public contract review never edits custody. Car-Out / Car-In workflows own these flags.
      vehicleOut: { canEditDamage: false, canEditMileage: false, canEditFuel: false, canSign: false },
      vehicleIn: { canEditDamage: false, canEditMileage: false, canEditFuel: false, canSign: false },
      signableSlots: reviewable ? [...PUBLIC_SIGNABLE_SLOTS] : [],
      canSign: canEdit && missingRequirements.length === 0,
      missingRequirements,
    },
    layout: {
      sections: [...OFFICIAL_CONTRACT_SECTIONS],
      infoGrid: OFFICIAL_CONTRACT_INFO_GRID,
    },
  };
  provenance["contract.agreementNumber"] = "CONTRACT";
  provenance["rental.duration"] = "RENTAL_AGREEMENT";
  provenance["signatures.hirer"] = captured.has("HIRER")
    ? "OFFICIAL_SIGNATURE"
    : row.acceptance
      ? "CONTRACT_ACCEPTANCE"
      : "NONE";

  return { view: applyFrozenOfficialContract(live, row.snapshot), provenance };
}

type OfficialContractCompany = OfficialContractView["header"]["company"];

/**
 * The company identity to print for a signed contract.
 *
 * A snapshot frozen since multi-company support carries its own company block:
 * that is what the hirer signed, so it wins. Snapshots frozen before it carry no
 * company block at all; those contracts were all UNIQUE and their
 * `Contract.companyId` was backfilled to UNIQUE, so the live company is the
 * correct fallback. The stored JSON is never rewritten either way.
 */
export function officialContractCompany(
  frozen: unknown,
  live: OfficialContractCompany,
): OfficialContractCompany {
  if (!frozen || typeof frozen !== "object") return live;
  const header = (frozen as { header?: { company?: OfficialContractCompany } }).header;
  const company = header?.company;
  if (!company || typeof company.code !== "string" || !company.code) return live;
  return company;
}

/**
 * After signing, the agreement's legal content is served from the frozen
 * snapshot. Custody events (OUT / IN damage marked by staff at Car-Out /
 * Car-In) and signature state stay live.
 */
export function applyFrozenOfficialContract(
  live: OfficialContractView,
  snapshot: unknown,
): OfficialContractView {
  const frozen =
    snapshot && typeof snapshot === "object" && "officialContract" in snapshot
      ? ((snapshot as { officialContract?: OfficialContractView }).officialContract ?? null)
      : null;
  if (!frozen || OFFICIAL_CONTRACT_REVIEWABLE_STATUSES.includes(live.contract.status)) return live;
  const date = (value: unknown) => (value ? new Date(value as string) : null);
  const frozenRental = frozen.rental as OfficialContractView["rental"] & { numberOfDays?: number };
  const rentalDuration =
    frozenRental.durationValue != null && frozenRental.durationUnit
      ? { durationValue: frozenRental.durationValue, durationUnit: frozenRental.durationUnit }
      : frozenRental.numberOfDays != null
        ? { durationValue: frozenRental.numberOfDays, durationUnit: "DAY" as const }
        : { durationValue: live.rental.durationValue, durationUnit: live.rental.durationUnit };
  return {
    ...live,
    header: { ...live.header, company: officialContractCompany(frozen, live.header.company) },
    vehicle: frozen.vehicle,
    hirer: frozen.hirer,
    additionalDriver: frozen.additionalDriver,
    sponsor: frozen.sponsor,
    rental: {
      ...frozen.rental,
      ...rentalDuration,
      plannedStartAt: date(frozen.rental.plannedStartAt),
      plannedEndAt: date(frozen.rental.plannedEndAt),
    },
    card: frozen.card,
  };
}
