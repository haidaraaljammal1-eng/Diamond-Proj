import type { z } from "zod";
import type { AuthUser } from "src/lib/context/auth-context";
import { AppError } from "src/lib/errors/app-error";
import type { UpdateVehicleSchema } from "src/modules/vehicles/vehicles.schema";
import { FN } from "./keys";
import { hasFunctionalCapability, isFunctionalRbacV2Enabled } from "./enforcement";

const RATE_FIELDS = new Set([
  "hourlyRate",
  "dailyRate",
  "weeklyRate",
  "monthlyRate",
]);

const IDENTITY_FIELDS = new Set([
  "vin",
  "vehicleName",
  "modelId",
  "modelYear",
  "color",
  "plateNumber",
  "operationalStatus",
  "externalId",
  "companyId",
]);

type UpdateInput = z.infer<typeof UpdateVehicleSchema>;

export function assertVehicleUpdateAuthorized(
  auth: AuthUser,
  input: UpdateInput,
): void {
  if (!isFunctionalRbacV2Enabled()) return;
  if (auth.isSystemAdmin) return;

  const touched = Object.keys(input) as (keyof UpdateInput)[];
  const touchesRates = touched.some((k) => RATE_FIELDS.has(k as string));
  const touchesIdentity = touched.some((k) => IDENTITY_FIELDS.has(k as string));

  if (touchesIdentity) {
    throw AppError.forbidden();
  }
  if (touchesRates && !hasFunctionalCapability(auth, FN.vehicles.editPrices)) {
    throw AppError.forbidden();
  }
}
