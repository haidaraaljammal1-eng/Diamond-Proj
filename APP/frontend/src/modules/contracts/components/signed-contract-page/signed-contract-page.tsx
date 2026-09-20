"use client";

import { useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { CompanyIdentity } from "@/shared/components/company-identity";
import { useOperatingCompanies } from "@/modules/operating-companies";
import { OfficialContractA4 } from "@/modules/public-rental/components/official-contract-a4/official-contract-a4";
import { useContract } from "../../hooks/use-contract";
import { useSignedContractSignatures } from "../../hooks/use-signed-contract-signatures";
import { hasPostSigningRecords, liveContractView } from "../../utils/live-contract-view";
import { signedContractFromSnapshot } from "../../utils/signed-contract-snapshot";
import styles from "./signed-contract-page.module.css";

export interface SignedContractPageProps {
  contractId: string;
  /** Lay Car-Out / Car-In records made after signing over the signed sheet. */
  live?: boolean;
}

export function SignedContractPage({ contractId, live = false }: SignedContractPageProps) {
  const t = useTranslations("Contracts");
  const router = useRouter();
  const { detail, detailStatus, loadContract, locale } = useContract();
  const { companies, isLoading: companiesLoading } = useOperatingCompanies();
  useEffect(() => { void loadContract(contractId); }, [contractId, loadContract]);

  const current = detail?.id === contractId ? detail : null;
  // Memoised: the signature hook refetches whenever the view identity changes.
  const contract = useMemo(() => {
    if (!current) return null;
    const company = companies.find((item) => item.id === current.company.id);
    return live
      ? liveContractView(current, company)
      : signedContractFromSnapshot(current.snapshot, company);
  }, [companies, current, live]);
  const updated = live && current ? hasPostSigningRecords(current) : false;
  const signatures = useSignedContractSignatures(contractId, contract, live ? current?.carOutHandover.signature.url : null);
  const loading = companiesLoading || detailStatus === "idle" || detailStatus === "loading" || (detail?.id !== contractId && detailStatus !== "error");

  return <main className={styles.page}>
    <div className={styles.toolbar}>
      <div>
        <div className={styles.titleLine}>
          <h1>{updated ? t("document.liveTitle") : t("carOut.signedContractTitle")}</h1>
          {contract ? <CompanyIdentity company={contract.header.company} /> : null}
        </div>
        <p>{updated ? t("document.liveHint") : t("carOut.fullA4Hint")}</p>
      </div>
      <Button type="button" variant="secondary" size="md" onClick={() => router.push(`/${locale}/contracts`)}>{t("carOut.backToContracts")}</Button>
    </div>
    {loading ? <p role="status">{t("carOut.loading")}</p> : contract ?
      <div className={styles.sheet}><OfficialContractA4 contract={contract} mode="READONLY" signatureImageUrl={(slot) => signatures[slot] ?? null} /></div> :
      <p role="alert">{live ? t("document.missing") : t("carOut.signedContractMissing")}</p>}
  </main>;
}
