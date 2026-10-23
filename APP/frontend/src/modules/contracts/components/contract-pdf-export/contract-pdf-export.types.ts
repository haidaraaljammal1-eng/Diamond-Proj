import type {
  OfficialContractView,
  OfficialSignatureSlot,
} from "@/modules/public-rental/types/official-contract.types";

export type ContractPdfExportBootstrap = {
  contract: OfficialContractView;
  signatureImages: Partial<Record<OfficialSignatureSlot, string>>;
};
