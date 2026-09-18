import { CAR_OUT_REQUIRED_ANGLES } from "src/modules/contracts/contracts.constants";

export function carOutPhotoProgress(photos: readonly { angle: string }[]) {
  const present = new Set(photos.map((photo) => photo.angle));
  const missing = CAR_OUT_REQUIRED_ANGLES.filter((angle) => !present.has(angle));
  return {
    required: CAR_OUT_REQUIRED_ANGLES.length,
    completed: CAR_OUT_REQUIRED_ANGLES.length - missing.length,
    missing: [...missing],
    complete: missing.length === 0,
  };
}

export function carOutReadiness(input: {
  mileageOut: number | null;
  fuelOut: string | null;
  hasSignature: boolean;
  photos: readonly { angle: string }[];
}) {
  const progress = carOutPhotoProgress(input.photos);
  return {
    ...progress,
    ready: input.mileageOut !== null && input.fuelOut !== null && input.hasSignature && progress.complete,
  };
}
