export type LocalSaveCapability = "directory" | "manual" | "iphone";

/**
 * Server rendering has no `window`. A partial `navigator` must not be treated
 * as a browser. Directory saving stays available after the client mounts.
 */
export function detectLocalSaveCapability(): LocalSaveCapability {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "manual";
  const ua = navigator.userAgent ?? "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iphone";
  if ("showDirectoryPicker" in window) return "directory";
  return "manual";
}
