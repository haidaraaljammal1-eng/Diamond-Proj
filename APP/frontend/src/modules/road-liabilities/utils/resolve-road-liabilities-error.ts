import type { ApiRequestError } from "@/infrastructure/api/errors";

export interface RoadLiabilitiesErrorTranslator {
  (key: string): string;
  has: (key: string) => boolean;
}

export function resolveRoadLiabilitiesErrorMessage(
  t: RoadLiabilitiesErrorTranslator,
  error: ApiRequestError | null,
): string | null {
  if (!error) return null;
  const codeKey = `error.${error.code}`;
  if (t.has(codeKey)) return t(codeKey);
  return t("error.generic");
}
