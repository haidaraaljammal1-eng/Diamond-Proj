import type { ContractPayment, RentalCollectionMode } from "@prisma/client";

type ContractCollectionSource = {
  collectionMode: RentalCollectionMode | null;
  payments?: Pick<ContractPayment, "purpose" | "method" | "status">[];
};

/** Authoritative cash collection for a contract: frozen mode or confirmed CASH rental payment. */
export function isCashCollectionContract(contract: ContractCollectionSource): boolean {
  if (contract.collectionMode === "CASH") return true;
  const rental = contract.payments?.find((p) => p.purpose === "RENTAL" && p.status === "CONFIRMED");
  return rental?.method === "CASH";
}

export function isElectronicCollectionContract(contract: ContractCollectionSource): boolean {
  if (contract.collectionMode === "CASH") return false;
  if (contract.collectionMode === "ELECTRONIC") return true;
  const rental = contract.payments?.find((p) => p.purpose === "RENTAL" && p.status === "CONFIRMED");
  if (rental) return rental.method === "CARD";
  return true;
}
