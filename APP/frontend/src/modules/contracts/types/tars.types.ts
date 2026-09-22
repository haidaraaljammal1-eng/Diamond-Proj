/**
 * Read-only TARS integration state for one Contract.
 *
 * Mirrors the Backend staff projection (`GET /contracts/:id/tars`). Diamond
 * never executes a TARS operation from the frontend, so there is no payload,
 * no command and no retry shape here — only what the employee is shown.
 */

import type { OperatingCompanyIdentity } from "@/modules/operating-companies";

export type TarsOperationStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "PROCESSING"
  | "SUBMITTING"
  | "PENDING_PROVIDER"
  | "SUCCEEDED"
  | "FAILED";

/** Official RTA/TARS rental capabilities (current writes). */
export type TarsOfficialOperationKey =
  | "createRental"
  | "updateRental"
  | "returnRental"
  | "settleRental";

/** Legacy capability keys preserved for migration-safe history rows. */
export type TarsLegacyOperationKey =
  | "registerContract"
  | "contractAcceptance"
  | "handover"
  | "returnDocumentation"
  | "completeContract";

export type TarsOperationKey = TarsOfficialOperationKey | TarsLegacyOperationKey;

export interface ContractTarsStateDto {
  /** False until a real, credentialed TARS provider exists. Not an error. */
  configured: boolean;
  /**
   * The operating company this Contract's TARS traffic routes to, taken from
   * `Contract.company` by the Backend — never from the Vehicle. UNIQUE TARS and
   * ELITE TARS are separate integrations, so the employee must see which one a
   * Contract belongs to even while both providers are unconfigured.
   */
  company: OperatingCompanyIdentity;
  externalContractId: string | null;
  externalRentalDid: string | null;
  lastSuccessfulSyncAt: string | null;
  operations: Record<TarsOperationKey, TarsOperationStatus>;
}

export interface ContractTarsResponseDto {
  tars: ContractTarsStateDto;
}
