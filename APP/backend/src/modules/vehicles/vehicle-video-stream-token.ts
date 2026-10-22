import { AppError } from "src/lib/errors/app-error";
import { encryptSecret, decryptSecret } from "src/lib/security/encryption";
import { VEHICLE_VIDEO_STREAM_ACCESS_TTL_SECONDS } from "src/modules/vehicles/vehicle-video.constants";

type StreamClaim = {
  vid: string;
  vehicleId: number;
  uid: number;
  exp: number;
};

export function mintVehicleVideoStreamToken(
  vehicleId: number,
  videoId: string,
  userId: number,
): { token: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + VEHICLE_VIDEO_STREAM_ACCESS_TTL_SECONDS * 1000);
  const claim: StreamClaim = {
    vid: videoId,
    vehicleId,
    uid: userId,
    exp: expiresAt.getTime(),
  };
  const token = encryptSecret(JSON.stringify(claim));
  return { token, expiresAt };
}

export function parseVehicleVideoStreamToken(token: string): StreamClaim {
  let claim: StreamClaim;
  try {
    claim = JSON.parse(decryptSecret(token)) as StreamClaim;
  } catch {
    throw AppError.notFound("Vehicle video not found");
  }
  if (
    !claim ||
    typeof claim.vid !== "string" ||
    typeof claim.vehicleId !== "number" ||
    typeof claim.uid !== "number" ||
    typeof claim.exp !== "number"
  ) {
    throw AppError.notFound("Vehicle video not found");
  }
  if (claim.exp < Date.now()) throw AppError.notFound("Vehicle video not found");
  return claim;
}
