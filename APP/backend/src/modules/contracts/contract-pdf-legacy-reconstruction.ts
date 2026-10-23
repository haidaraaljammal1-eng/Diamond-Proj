import type { ContractDetail, OfficialContractView } from "src/modules/contracts/contracts.schema";

type LegacySnapshot = {
  contractNumber?: string;
  termsVersion?: string;
  vehicle?: {
    vehicleName?: string | null;
    displayName?: string | null;
    plateNumber?: string | null;
    color?: string | null;
    modelYear?: number | null;
  };
  customer?: {
    name?: string | null;
    mobile?: string | null;
    nationality?: string | null;
    passportNumber?: string | null;
    drivingLicenseNumber?: string | null;
    drivingLicenseExpiry?: string | Date | null;
    address?: string | null;
  };
  commercial?: {
    startAt?: string | Date | null;
    endAt?: string | Date | null;
    durationValue?: number;
    durationUnit?: OfficialContractView["rental"]["durationUnit"];
    rentalDays?: number;
  };
};

const RECONSTRUCTION_NOTE =
  "Historical reconstruction from contract records. No signed official snapshot is stored for this rental.";

function asDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function asExpiryString(value: string | Date | null | undefined): string | null {
  const d = asDate(value);
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * When `snapshot.officialContract` is absent, rebuild a read-only view from frozen
 * customer/vehicle/commercial snapshot fields plus the current official template shell.
 */
export function legacyContractReconstructionView(
  detail: ContractDetail,
  shell: OfficialContractView,
): OfficialContractView | null {
  if (!detail.snapshot || typeof detail.snapshot !== "object") return null;
  if ("officialContract" in detail.snapshot) return null;
  const snap = detail.snapshot as LegacySnapshot;

  return {
    ...shell,
    contract: {
      ...shell.contract,
      agreementNumber: snap.contractNumber ?? detail.contractNumber,
      status: detail.status,
      termsVersion: snap.termsVersion ?? shell.contract.termsVersion,
    },
    vehicle: {
      ...shell.vehicle,
      plateNumber: snap.vehicle?.plateNumber ?? shell.vehicle.plateNumber,
      vehicleType: snap.vehicle?.vehicleName ?? snap.vehicle?.displayName ?? shell.vehicle.vehicleType,
      yearMade: snap.vehicle?.modelYear ?? shell.vehicle.yearMade,
      color: snap.vehicle?.color ?? shell.vehicle.color,
      notes: RECONSTRUCTION_NOTE,
    },
    hirer: {
      ...shell.hirer,
      name: snap.customer?.name ?? shell.hirer.name,
      nationality: snap.customer?.nationality ?? shell.hirer.nationality,
      passportNumber: snap.customer?.passportNumber ?? shell.hirer.passportNumber,
      address: snap.customer?.address ?? shell.hirer.address,
      telephone: snap.customer?.mobile ?? shell.hirer.telephone,
      driverLicenseNumber: snap.customer?.drivingLicenseNumber ?? shell.hirer.driverLicenseNumber,
      driverLicenseExpiryDate:
        asExpiryString(snap.customer?.drivingLicenseExpiry) ?? shell.hirer.driverLicenseExpiryDate,
    },
    rental: {
      ...shell.rental,
      plannedStartAt: asDate(snap.commercial?.startAt) ?? shell.rental.plannedStartAt,
      plannedEndAt: asDate(snap.commercial?.endAt) ?? shell.rental.plannedEndAt,
      durationValue: snap.commercial?.durationValue ?? detail.durationValue ?? shell.rental.durationValue,
      durationUnit: snap.commercial?.durationUnit ?? detail.durationUnit ?? shell.rental.durationUnit,
      numberOfDays: snap.commercial?.rentalDays ?? detail.rentalDays,
    },
    signatures: {
      hirer: { ...shell.signatures.hirer, status: "NOT_SIGNED", hasImage: false, signedAt: null },
      additionalDriver: {
        ...shell.signatures.additionalDriver,
        status: "NOT_SIGNED",
        hasImage: false,
        signedAt: null,
      },
      sponsor: { ...shell.signatures.sponsor, status: "NOT_SIGNED", hasImage: false, signedAt: null },
      vehicleOutHirer: {
        ...shell.signatures.vehicleOutHirer,
        status: "NOT_SIGNED",
        hasImage: false,
        signedAt: null,
      },
      vehicleInHirer: {
        ...shell.signatures.vehicleInHirer,
        status: "NOT_SIGNED",
        hasImage: false,
        signedAt: null,
      },
    },
  };
}
