import type { Tx } from "src/lib/db/transaction";
import { normalizePhone } from "src/lib/security/normalize";
import type { ContractSnapshot } from "src/modules/contracts/contracts-snapshot";
import { contractError } from "src/modules/contracts/contracts.errors";

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

export async function ensureContractCustomerForPayment(tx: Tx, contractId: string): Promise<number> {
  const contract = await tx.contract.findUnique({
    where: { id: contractId },
    select: { id: true, customerId: true, snapshot: true },
  });
  if (!contract) throw contractError.notFound();
  if (contract.customerId) return contract.customerId;

  const fromSnapshot = parseSnapshotCustomer(contract.snapshot);
  const materialized: MaterializableCustomer | null = fromSnapshot
    ? {
        name: fromSnapshot.name!,
        mobile: fromSnapshot.mobile!,
        email: fromSnapshot.email ?? null,
        nationality: fromSnapshot.nationality ?? null,
        identityNumber: fromSnapshot.identityNumber ?? null,
        passportNumber: fromSnapshot.passportNumber ?? null,
        drivingLicenseNumber: fromSnapshot.drivingLicenseNumber!,
        drivingLicenseExpiry: fromSnapshot.drivingLicenseExpiry!,
        address: fromSnapshot.address ?? null,
      }
    : null;

  if (!materialized) throw contractError.paymentNotAllowed();

  const created = await tx.customer.create({
    data: {
      name: materialized.name,
      mobile: normalizePhone(materialized.mobile),
      email: materialized.email,
      nationality: materialized.nationality,
      identityNumber: materialized.identityNumber,
      passportNumber: materialized.passportNumber,
      drivingLicenseNumber: materialized.drivingLicenseNumber,
      drivingLicenseExpiry: materialized.drivingLicenseExpiry,
      address: materialized.address,
    },
  });
  await tx.contract.update({
    where: { id: contractId },
    data: { customerId: created.id },
  });
  return created.id;
}

