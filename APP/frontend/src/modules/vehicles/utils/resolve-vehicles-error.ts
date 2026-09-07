import type { ApiRequestError } from "@/infrastructure/api/errors";

export interface VehiclesErrorTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

function isPlateConflict(error: ApiRequestError): boolean {
  return /plate number already exists/i.test(error.message);
}

function isVinConflict(error: ApiRequestError): boolean {
  return /vin already exists/i.test(error.message);
}

function isRentedConflict(error: ApiRequestError): boolean {
  return /rented and cannot be modified/i.test(error.message);
}

/**
 * Maps Backend vehicle write errors to stable `Vehicles` namespace keys.
 * `CONFLICT` is overloaded — disambiguate by message.
 */
export function resolveVehiclesErrorMessage(
  t: VehiclesErrorTranslator,
  error: ApiRequestError | null,
): string | null {
  if (!error) return null;

  if (error.code === "CONFLICT") {
    if (isPlateConflict(error)) {
      const plateKey = "form.error.duplicatePlate";
      return t.has(plateKey) ? t(plateKey) : t("error.generic");
    }
    if (isVinConflict(error)) {
      const vinKey = "form.error.duplicateVin";
      return t.has(vinKey) ? t(vinKey) : t("error.generic");
    }
    if (isRentedConflict(error)) {
      const rentedKey = "form.error.rentedLocked";
      return t.has(rentedKey) ? t(rentedKey) : t("error.generic");
    }
  }

  const codeKey = `form.error.${error.code}`;
  if (t.has(codeKey)) return t(codeKey);

  const genericKey = `error.${error.code}`;
  return t.has(genericKey) ? t(genericKey) : t("error.generic");
}
