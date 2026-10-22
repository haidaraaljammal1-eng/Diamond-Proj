export const VEHICLE_VIDEO_ACCEPT = "video/mp4";
export const VEHICLE_VIDEO_MAX_BYTES = 26_214_400;

export function isAcceptedVehicleVideoFile(file: File): boolean {
  if (file.type !== VEHICLE_VIDEO_ACCEPT) return false;
  return file.size > 0 && file.size <= VEHICLE_VIDEO_MAX_BYTES;
}
