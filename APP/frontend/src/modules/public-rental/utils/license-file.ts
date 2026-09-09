export const LICENSE_ACCEPT = "image/jpeg,image/png,.jpg,.jpeg,.png";

export function isAcceptedLicenseFile(file: File): boolean {
  if (file.type === "image/jpeg" || file.type === "image/png") return true;
  const name = file.name.toLowerCase();
  return name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png");
}
