/**
 * Telephony provider abstraction. Real vendor integration is out of scope for
 * BE-3A — no fake telephony. When no provider is configured, calls run in MANUAL
 * mode (the agent dials externally) and recordings are honestly UNAVAILABLE.
 */

export type ProviderRecordingStatus = "PENDING" | "AVAILABLE" | "FAILED" | "UNAVAILABLE";

export interface StartCallInput {
  to: string;
  agentUserId: number;
  queueItemId: number;
}
export interface StartCallResult {
  providerCallId: string;
}
export interface CallStatusResult {
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  durationSeconds?: number;
}
export interface RecordingResult {
  status: ProviderRecordingStatus;
  providerRecordingId?: string;
  storageKey?: string;
  durationSeconds?: number;
}

export interface CallTelephonyProvider {
  readiness(): "CONFIGURED" | "NOT_CONFIGURED";
  startCall(input: StartCallInput): Promise<StartCallResult>;
  getCallStatus(providerCallId: string): Promise<CallStatusResult>;
  getRecording(providerCallId: string): Promise<RecordingResult>;
}

/** No provider configured: manual mode only, recordings honestly unavailable. */
export function nullTelephonyProvider(): CallTelephonyProvider {
  return {
    readiness: () => "NOT_CONFIGURED",
    startCall: () => Promise.reject(new Error("telephony provider not configured")),
    getCallStatus: () => Promise.resolve({ status: "COMPLETED" }),
    getRecording: () => Promise.resolve({ status: "UNAVAILABLE" }),
  };
}

export function defaultTelephonyProvider(): CallTelephonyProvider {
  // No real vendor wired in this build. Swap here when one is configured.
  return nullTelephonyProvider();
}
