import type { TarsOtpPublicState, TarsOtpUiStatus } from "../types/public-rental.types";

export function isTarsOtpBlockingSign(state: TarsOtpPublicState): boolean {
  return state.required && state.status !== "VERIFIED";
}

export function resolveTarsOtpDisplayStatus(
  backendStatus: TarsOtpUiStatus,
  clientPhase: "REQUESTING" | "VERIFYING" | null,
): TarsOtpUiStatus | "REQUESTING" | "VERIFYING" {
  if (clientPhase === "REQUESTING") return "REQUESTING";
  if (clientPhase === "VERIFYING") return "VERIFYING";
  return backendStatus;
}

export function minOtpCodeLength(state: TarsOtpPublicState): number {
  return state.otpLength ?? 1;
}

export function maxOtpCodeLength(state: TarsOtpPublicState): number {
  return state.otpLength ?? 32;
}
