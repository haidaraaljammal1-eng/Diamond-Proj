"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { OfficialContractA4 } from "@/modules/public-rental/components/official-contract-a4/official-contract-a4";
import { useContract } from "../../hooks/use-contract";
import { useSignedContractSignatures } from "../../hooks/use-signed-contract-signatures";
import { signedContractFromSnapshot } from "../../utils/signed-contract-snapshot";
import styles from "./signed-contract-page.module.css";

export function SignedContractPage({ contractId }: { contractId: string }) {
  const t = useTranslations("Contracts");
  const router = useRouter();
  const { detail, detailStatus, loadContract, locale } = useContract();
  useEffect(() => { void loadContract(contractId); }, [contractId, loadContract]);

  const signedContract = detail?.id === contractId ? signedContractFromSnapshot(detail.snapshot) : null;
  const signatures = useSignedContractSignatures(contractId, signedContract);
  const loading = detailStatus === "idle" || detailStatus === "loading" || (detail?.id !== contractId && detailStatus !== "error");

  return <main className={styles.page}>
    <div className={styles.toolbar}>
      <div>
        <h1>{t("carOut.signedContractTitle")}</h1>
        <p>{t("carOut.fullA4Hint")}</p>
      </div>
      <Button type="button" variant="secondary" size="md" onClick={() => router.push(`/${locale}/contracts`)}>{t("carOut.backToContracts")}</Button>
    </div>
    {loading ? <p role="status">{t("carOut.loading")}</p> : signedContract ?
      <div className={styles.sheet}><OfficialContractA4 contract={signedContract} mode="READONLY" signatureImageUrl={(slot) => signatures[slot] ?? null} /></div> :
      <p role="alert">{t("carOut.signedContractMissing")}</p>}
  </main>;
}
