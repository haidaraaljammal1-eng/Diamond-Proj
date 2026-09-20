import { CAR_OUT_REQUIRED_ANGLES } from "src/modules/contracts/contracts.constants";

export function carInPhotoProgress(photos: readonly { angle: string }[]) {
  const present = new Set(photos.map((photo) => photo.angle));
  const missing = CAR_OUT_REQUIRED_ANGLES.filter((angle) => !present.has(angle));
  return {
    required: CAR_OUT_REQUIRED_ANGLES.length,
    completed: CAR_OUT_REQUIRED_ANGLES.length - missing.length,
    missing: [...missing],
    complete: missing.length === 0,
  };
}

/** Same shape as `carOutReadiness`, but the IN signature is part of readiness too: Car-In has no
 * optional-signature path, so `ready` never becomes true without one. */
export function carInReadiness(input: {
  mileageIn: number | null;
  fuelIn: string | null;
  hasSignature: boolean;
  photos: readonly { angle: string }[];
}) {
  const progress = carInPhotoProgress(input.photos);
  return {
    ...progress,
    ready: input.mileageIn !== null && input.fuelIn !== null && input.hasSignature && progress.complete,
  };
}
