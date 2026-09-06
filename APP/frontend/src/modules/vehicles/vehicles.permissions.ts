/** Backend catalog keys from `APP/backend/src/constants/permissions.ts`. */
export const VEHICLES_READ_PERMISSION = "vehicles.read";
export const VEHICLES_MANAGE_PERMISSION = "vehicles.manage";

export const VEHICLES_PAGE_PERMISSIONS = [VEHICLES_READ_PERMISSION] as const;

/** Lookup gate for the model filter (Backend any-of). */
export const REFERENCE_DATA_LOOKUP_PERMISSION = "reference_data.lookup";
export const VEHICLE_MODELS_READ_PERMISSION = "vehicle_models.read";
