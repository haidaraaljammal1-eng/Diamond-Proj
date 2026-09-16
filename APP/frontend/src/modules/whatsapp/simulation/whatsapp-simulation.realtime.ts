import { useWhatsAppSimulationStore } from "./whatsapp-simulation.store";

/**
 * Frontend-only simulated realtime source. Deleting this file must not require
 * backend, SSE endpoint, API contract, or Inbox business-logic changes.
 */
export function emitSimulatedWhatsAppInbound(): void {
  useWhatsAppSimulationStore.getState().simulateInbound();
}

export function emitSimulatedWhatsAppProviderStatus(
  status: "SENT" | "DELIVERED" | "READ" | "FAILED",
): void {
  useWhatsAppSimulationStore.getState().simulateProviderStatus(status);
}
