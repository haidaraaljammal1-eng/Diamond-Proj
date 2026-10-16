import type { ContractSnapshot } from "src/modules/contracts/contracts-snapshot";

/** Hirer name frozen on this contract (form snapshot or signed snapshot). */
export function customerNameFromContractSnapshot(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const customer = (snapshot as ContractSnapshot).customer;
  if (!customer || typeof customer.name !== "string") return null;
  const trimmed = customer.name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Staff-facing hirer label: contract snapshot wins over the shared Customer master row.
 * Prevents one rental's form from retitling other contracts that share the same customerId.
 */
export function resolveContractDisplayCustomerName(
  snapshot: unknown,
  linkedCustomerName: string | null | undefined,
): string | null {
  return customerNameFromContractSnapshot(snapshot) ?? linkedCustomerName ?? null;
}
