"use client";

import { Dialog } from "@/shared/components/ui/dialog";
import { useTranslations } from "next-intl";
import { ContractLinkResult } from "../contract-link-result/contract-link-result";
import { useContract } from "../../hooks/use-contract";

export function ContractLinkResultDialog() {
  const t = useTranslations("Contracts");
  const { issuedLink, clearIssuedLink } = useContract();

  return (
    <Dialog
      open={issuedLink != null}
      onClose={clearIssuedLink}
      title={t("link.created")}
      closeLabel={t("detail.close")}
    >
      {issuedLink ? (
        <ContractLinkResult link={issuedLink} onClose={clearIssuedLink} />
      ) : null}
    </Dialog>
  );
}
