import { acquireAdvisoryLock } from "src/lib/db/advisory-lock";
import { normalizeIdentifier, normalizePhone } from "src/lib/security/normalize";
import type { Tx } from "src/lib/db/transaction";
import type { ContractSnapshot } from "src/modules/contracts/contracts-snapshot";
import { contractError } from "src/modules/contracts/contracts.errors";
import type { Prisma } from "@prisma/client";

export const CUSTOMER_MATERIALIZATION_LOCK_NS = "customer_materialization";

type MaterializableCustomer = {
  name: string;
  mobile: string;
  email: string | null;
  nationality: string | null;
  identityNumber: string | null;
  passportNumber: string | null;
  drivingLicenseNumber: string;
  drivingLicenseExpiry: Date;
  address: string | null;
};

type StrongIdentity = {
  identityNumber: string | null;
  passportNumber: string | null;
  drivingLicenseNumber: string | null;
};

function normalizeStrongIdentity(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const normalized = normalizeIdentifier(value);
  return normalized.length >= 3 ? normalized : null;
}

export function extractStrongIdentity(input: StrongIdentity): StrongIdentity {
  return {
    identityNumber: normalizeStrongIdentity(input.identityNumber),
    passportNumber: normalizeStrongIdentity(input.passportNumber),
    drivingLicenseNumber: normalizeStrongIdentity(input.drivingLicenseNumber),
  };
}

function parseSnapshotCustomer(snapshot: unknown): Partial<MaterializableCustomer> | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const customer = (snapshot as ContractSnapshot).customer;
  if (!customer || typeof customer !== "object") return null;
  const name = typeof customer.name === "string" ? customer.name.trim() : "";
  const mobile = typeof customer.mobile === "string" ? customer.mobile.trim() : "";
  if (!name || !mobile) return null;
  const expiry =
    typeof customer.drivingLicenseExpiry === "string" && customer.drivingLicenseExpiry
      ? new Date(customer.drivingLicenseExpiry)
      : null;
  const licenseNumber =
    typeof customer.drivingLicenseNumber === "string" ? customer.drivingLicenseNumber.trim() : "";
  if (!licenseNumber || !expiry || Number.isNaN(expiry.getTime())) return null;
  return {
    name,
    mobile,
    email: typeof customer.email === "string" ? customer.email : null,
    nationality: typeof customer.nationality === "string" ? customer.nationality : null,
    identityNumber: typeof customer.identityNumber === "string" ? customer.identityNumber : null,
    passportNumber: typeof customer.passportNumber === "string" ? customer.passportNumber : null,
    drivingLicenseNumber: licenseNumber,
    drivingLicenseExpiry: expiry,
    address: typeof customer.address === "string" ? customer.address : null,
  };
}

export function canMaterializeContractCustomer(input: {
  customerId: number | null;
  snapshot: unknown;
}): boolean {
  if (input.customerId) return true;
  return Boolean(parseSnapshotCustomer(input.snapshot));
}

function hasStrongIdentity(identity: StrongIdentity): boolean {
  return Boolean(
    identity.identityNumber || identity.passportNumber || identity.drivingLicenseNumber,
  );
}

async function findCustomersByStrongField(
  tx: Tx,
  field: "identityNumber" | "passportNumber" | "drivingLicenseNumber",
  value: string,
): Promise<number[]> {
  const rows = await tx.customer.findMany({
    where: { [field]: value, isActive: true },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * Conservative customer resolver. Strong identifiers only — never merge on phone/email alone.
 */
export async function resolveCustomerIdFromIdentity(
  tx: Tx,
  materialized: MaterializableCustomer,
): Promise<number> {
  const strong = extractStrongIdentity(materialized);
  if (!hasStrongIdentity(strong)) {
    throw contractError.customerIdentityAmbiguous();
  }

  const candidateSets: number[][] = [];
  if (strong.identityNumber) {
    candidateSets.push(await findCustomersByStrongField(tx, "identityNumber", strong.identityNumber));
  }
  if (strong.passportNumber) {
    candidateSets.push(await findCustomersByStrongField(tx, "passportNumber", strong.passportNumber));
  }
  if (strong.drivingLicenseNumber) {
    candidateSets.push(
      await findCustomersByStrongField(tx, "drivingLicenseNumber", strong.drivingLicenseNumber),
    );
  }

  const nonEmpty = candidateSets.filter((set) => set.length > 0);
  if (nonEmpty.length === 0) {
    const created = await tx.customer.create({
      data: customerCreateData(materialized),
    });
    return created.id;
  }

  const union = new Set(nonEmpty.flat());
  if (union.size > 1) {
    throw contractError.customerIdentityAmbiguous();
  }
  const customerId = [...union][0];
  if (customerId == null) {
    throw contractError.customerIdentityAmbiguous();
  }
  await tx.customer.update({
    where: { id: customerId },
    data: customerEnrichData(materialized),
  });
  return customerId;
}

function customerCreateData(materialized: MaterializableCustomer): Prisma.CustomerCreateInput {
  const strong = extractStrongIdentity(materialized);
  return {
    name: materialized.name,
    mobile: normalizePhone(materialized.mobile),
    email: materialized.email,
    nationality: materialized.nationality,
    identityNumber: strong.identityNumber,
    passportNumber: strong.passportNumber,
    drivingLicenseNumber: strong.drivingLicenseNumber ?? materialized.drivingLicenseNumber,
    drivingLicenseExpiry: materialized.drivingLicenseExpiry,
    address: materialized.address,
  };
}

/** Enrich existing customer without overwriting authoritative non-null values. */
function customerEnrichData(materialized: MaterializableCustomer): Prisma.CustomerUpdateInput {
  const strong = extractStrongIdentity(materialized);
  const data: Prisma.CustomerUpdateInput = {};
  if (materialized.name) data.name = materialized.name;
  if (materialized.mobile) data.mobile = normalizePhone(materialized.mobile);
  if (materialized.email) data.email = materialized.email;
  if (materialized.nationality) data.nationality = materialized.nationality;
  if (materialized.address) data.address = materialized.address;
  if (strong.identityNumber) data.identityNumber = strong.identityNumber;
  if (strong.passportNumber) data.passportNumber = strong.passportNumber;
  if (strong.drivingLicenseNumber) data.drivingLicenseNumber = strong.drivingLicenseNumber;
  if (materialized.drivingLicenseExpiry) data.drivingLicenseExpiry = materialized.drivingLicenseExpiry;
  return data;
}

function materializedFromSnapshot(snapshot: unknown): MaterializableCustomer | null {
  const fromSnapshot = parseSnapshotCustomer(snapshot);
  if (!fromSnapshot?.name || !fromSnapshot.mobile || !fromSnapshot.drivingLicenseNumber || !fromSnapshot.drivingLicenseExpiry) {
    return null;
  }
  return {
    name: fromSnapshot.name,
    mobile: fromSnapshot.mobile,
    email: fromSnapshot.email ?? null,
    nationality: fromSnapshot.nationality ?? null,
    identityNumber: fromSnapshot.identityNumber ?? null,
    passportNumber: fromSnapshot.passportNumber ?? null,
    drivingLicenseNumber: fromSnapshot.drivingLicenseNumber,
    drivingLicenseExpiry: fromSnapshot.drivingLicenseExpiry,
    address: fromSnapshot.address ?? null,
  };
}

function materializationLockKey(materialized: MaterializableCustomer, contractId: string): string {
  return [
    materialized.identityNumber,
    materialized.passportNumber,
    materialized.drivingLicenseNumber,
    normalizePhone(materialized.mobile),
  ]
    .filter(Boolean)
    .join(":") || contractId;
}

/**
 * Strong-identity resolution for public form submission and signing.
 * Reuses an existing Customer when unambiguous; fails closed on conflict.
 */
export async function resolvePublicFormCustomerId(
  tx: Tx,
  contractId: string,
  materialized: MaterializableCustomer,
  existingCustomerId: number | null,
): Promise<number> {
  await acquireAdvisoryLock(
    tx,
    CUSTOMER_MATERIALIZATION_LOCK_NS,
    materializationLockKey(materialized, contractId),
  );

  const resolvedId = await resolveCustomerIdFromIdentity(tx, materialized);

  if (existingCustomerId != null && existingCustomerId !== resolvedId) {
    throw contractError.customerIdentityAmbiguous();
  }

  return resolvedId;
}

/** Canonical customer binding at public signing using the frozen snapshot. */
export async function finalizeContractCustomerAtSigning(
  tx: Tx,
  contractId: string,
  snapshot: unknown,
): Promise<number> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    select: { id: true, customerId: true },
  });
  if (!contract) throw contractError.notFound();

  const materialized = materializedFromSnapshot(snapshot);
  if (!materialized) throw contractError.paymentNotAllowed();

  return resolvePublicFormCustomerId(tx, contractId, materialized, contract.customerId);
}

/**
 * Resolves customer from an in-memory snapshot (signing boundary) or persisted snapshot.
 */
export async function resolveContractCustomerFromSnapshot(
  tx: Tx,
  contractId: string,
  snapshot: unknown,
): Promise<number> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    select: { id: true, customerId: true },
  });
  if (!contract) throw contractError.notFound();
  if (contract.customerId) return contract.customerId;

  const materialized = materializedFromSnapshot(snapshot);
  if (!materialized) throw contractError.paymentNotAllowed();

  await acquireAdvisoryLock(
    tx,
    CUSTOMER_MATERIALIZATION_LOCK_NS,
    materializationLockKey(materialized, contractId),
  );

  const refreshed = await tx.contract.findUnique({
    where: { id: contractId },
    select: { customerId: true },
  });
  if (refreshed?.customerId) return refreshed.customerId;

  const customerId = await resolveCustomerIdFromIdentity(tx, materialized);
  await tx.contract.update({
    where: { id: contractId },
    data: { customerId },
  });
  return customerId;
}

/** Authoritative customer resolution at signing using the frozen snapshot payload. */
export async function resolveContractCustomerAtSigning(tx: Tx, contractId: string): Promise<number> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    select: { id: true, customerId: true, snapshot: true },
  });
  if (!contract) throw contractError.notFound();
  if (contract.customerId) return contract.customerId;
  return resolveContractCustomerFromSnapshot(tx, contractId, contract.snapshot);
}

/**
 * Legacy repair for historical SIGNED contracts with customerId = null.
 * Same resolver; idempotent when customer already linked.
 */
export async function ensureContractCustomerForPayment(tx: Tx, contractId: string): Promise<number> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    select: { id: true, customerId: true, snapshot: true },
  });
  if (!contract) throw contractError.notFound();

  const materialized = materializedFromSnapshot(contract.snapshot);
  if (!materialized) throw contractError.paymentNotAllowed();

  await acquireAdvisoryLock(
    tx,
    CUSTOMER_MATERIALIZATION_LOCK_NS,
    materializationLockKey(materialized, contractId),
  );

  const resolvedId = await resolveCustomerIdFromIdentity(tx, materialized);

  if (contract.customerId != null && contract.customerId !== resolvedId) {
    throw contractError.customerIdentityAmbiguous();
  }

  if (!contract.customerId) {
    await tx.contract.update({
      where: { id: contractId },
      data: { customerId: resolvedId },
    });
  }

  return resolvedId;
}
