/** UI accept filter — JPEG/PNG only (no PDF in create flow). */
export const VEHICLE_PHOTO_ACCEPT = "image/jpeg,image/png";

const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

/** Stable button label key for the single photo picker control. */
export function resolvePhotoPickerButtonKey(
  hasFile: boolean,
): "uploadPhoto" | "changePhoto" {
  return hasFile ? "changePhoto" : "uploadPhoto";
}

export function isAcceptedVehiclePhotoFile(file: File): boolean {
  return ACCEPTED_MIME_TYPES.has(file.type);
}
