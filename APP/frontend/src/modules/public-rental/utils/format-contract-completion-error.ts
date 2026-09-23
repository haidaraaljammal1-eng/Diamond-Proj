import type { ApiRequestError } from "@/infrastructure/api/errors";
import type { PublicRentalErrorTranslator } from "./resolve-public-rental-error";
import type { ContractRequirementCode } from "./official-contract-completion";

type ReviewTranslator = PublicRentalErrorTranslator;

export function requirementLabel(t: ReviewTranslator, code: ContractRequirementCode): string {
  const key = `requirements.${code}`;
  return t.has(key) ? t(key) : code;
}

export function formatMissingRequirementsMessage(
  t: ReviewTranslator,
  codes: ContractRequirementCode[],
): string {
  if (codes.length === 0) return "";
  const lines = codes.map((code) => `- ${requirementLabel(t, code)}`);
  return `${t("missingFieldsIntro")}\n${lines.join("\n")}`;
}

export function resolveContractCompletionError(
  t: ReviewTranslator,
  error: ApiRequestError | null,
): string | null {
  if (!error) return null;
  const reason = typeof error.context?.reason === "string" ? error.context.reason : null;
  const missing = Array.isArray(error.context?.missing)
    ? (error.context.missing as string[])
    : null;

  if (reason === "OFFICIAL_CONTRACT_INCOMPLETE" && missing?.length) {
    return formatMissingRequirementsMessage(t, missing as ContractRequirementCode[]);
  }
  if (reason === "PAYMENT_NOT_ALLOWED") {
    return t("errors.incompleteCustomerData");
  }
  return null;
}
