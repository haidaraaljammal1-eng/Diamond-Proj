import { AppError } from "src/lib/errors/app-error";
import {
  CAR_OUT_PHOTO_ANGLES,
  CAR_OUT_REQUIRED_ANGLES,
} from "src/modules/contracts/contracts.constants";

const ALLOWED = new Set<string>(CAR_OUT_PHOTO_ANGLES);

export function assertCustodyPhotoAngles(photos: readonly { angle: string }[]): void {
  const present = new Set<string>();
  for (const photo of photos) {
    if (!ALLOWED.has(photo.angle)) {
      throw AppError.validation("Invalid custody photo angle");
    }
    if (present.has(photo.angle)) {
      throw AppError.validation("Duplicate custody photo angle");
    }
    present.add(photo.angle);
  }
  for (const required of CAR_OUT_REQUIRED_ANGLES) {
    if (!present.has(required)) {
      throw AppError.validation("Custody requires all required photo angles");
    }
  }
}

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
    ready:
      input.mileageOut !== null &&
      input.fuelOut !== null &&
      input.hasSignature &&
      progress.complete,
  };
}
