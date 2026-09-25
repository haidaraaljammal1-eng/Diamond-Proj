import { vehicleDisplayName } from "src/modules/vehicles/vehicles.mapper";
import {
  CONTRACT_CURRENCY,
  CONTRACT_TERMS_VERSION,
} from "src/modules/contracts/contracts.constants";

export interface ContractSnapshot {
  contractNumber: string;
  customer: {
    name: string;
    mobile: string | null;
    email: string | null;
    nationality: string | null;
    identityNumber: string | null;
    passportNumber: string | null;
    drivingLicenseNumber: string | null;
    drivingLicenseExpiry: string | null;
    address: string | null;
  };
  vehicle: {
    displayName: string;
    vehicleName: string | null;
    plateNumber: string | null;
    modelYear: number | null;
    color: string | null;
    vin: string | null;
  };
  commercial: {
    agreedAmount: number;
    priceType: string;
    rentalDays: number;
    durationValue: number;
    durationUnit: string;
    startAt: string | null;
    endAt: string | null;
    currency: string;
  };
  termsVersion: string;
}

type CustomerSnapInput = {
  name: string;
  mobile: string | null;
  email: string | null;
  nationality: string | null;
  identityNumber: string | null;
  passportNumber: string | null;
  drivingLicenseNumber: string | null;
  drivingLicenseExpiry: Date | null;
  address: string | null;
};

type VehicleSnapInput = {
  vehicleName: string | null;
  plateNumber: string | null;
  modelYear: number | null;
  color: string | null;
  vin: string | null;
  modelName: string | null;
};

type CommercialSnapInput = {
  agreedAmount: number;
  priceType: string;
  rentalDays: number;
  durationValue: number;
  durationUnit: string;
  startAt: Date | null;
  endAt: Date | null;
  currency?: string;
};

export function buildContractSnapshot(input: {
  contractNumber: string;
  customer: CustomerSnapInput | null;
  vehicle: VehicleSnapInput;
  commercial: CommercialSnapInput;
  termsVersion?: string;
}): ContractSnapshot {
  const customer = input.customer;
  return {
    contractNumber: input.contractNumber,
    customer: {
      name: customer?.name ?? "",
      mobile: customer?.mobile ?? null,
      email: customer?.email ?? null,
      nationality: customer?.nationality ?? null,
      identityNumber: customer?.identityNumber ?? null,
      passportNumber: customer?.passportNumber ?? null,
      drivingLicenseNumber: customer?.drivingLicenseNumber ?? null,
      drivingLicenseExpiry: customer?.drivingLicenseExpiry
        ? customer.drivingLicenseExpiry.toISOString().slice(0, 10)
        : null,
      address: customer?.address ?? null,
    },
    vehicle: {
      displayName: vehicleDisplayName({
        vehicleName: input.vehicle.vehicleName,
        modelName: input.vehicle.modelName,
        modelYear: input.vehicle.modelYear,
        plateNumber: input.vehicle.plateNumber,
      }),
      vehicleName: input.vehicle.vehicleName,
      plateNumber: input.vehicle.plateNumber,
      modelYear: input.vehicle.modelYear,
      color: input.vehicle.color,
      vin: input.vehicle.vin,
    },
    commercial: {
      agreedAmount: input.commercial.agreedAmount,
      priceType: input.commercial.priceType,
      rentalDays: input.commercial.rentalDays,
      durationValue: input.commercial.durationValue,
      durationUnit: input.commercial.durationUnit,
      startAt: input.commercial.startAt?.toISOString() ?? null,
      endAt: input.commercial.endAt?.toISOString() ?? null,
      currency: input.commercial.currency ?? CONTRACT_CURRENCY,
    },
    termsVersion: input.termsVersion ?? CONTRACT_TERMS_VERSION,
  };
}
