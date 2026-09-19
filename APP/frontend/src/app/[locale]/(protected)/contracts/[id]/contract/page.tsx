import { setRequestLocale } from "next-intl/server";
import { SignedContractPage } from "@/modules/contracts/components/signed-contract-page/signed-contract-page";

export default async function ContractDocumentPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <SignedContractPage contractId={id} live />;
}
