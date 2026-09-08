import type { ContractStatus } from "@prisma/client";
import { ALLOWED_TRANSITIONS } from "src/modules/contracts/contracts.constants";
import { contractError } from "src/modules/contracts/contracts.errors";

export function canTransition(from: ContractStatus, to: ContractStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ContractStatus, to: ContractStatus): void {
  if (!canTransition(from, to)) {
    throw contractError.invalidTransition(from, to);
  }
}

export function assertStatus(actual: ContractStatus, expected: ContractStatus): void {
  if (actual !== expected) {
    throw contractError.invalidTransition(actual, expected);
  }
}
