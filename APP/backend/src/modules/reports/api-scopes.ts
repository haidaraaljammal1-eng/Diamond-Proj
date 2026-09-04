/** Bounded external-API-key scope catalog. Keys carry a subset of these. */
export const API_SCOPES = [
  "customers.read",
  "responses.read_pii", // dedicated scope required to see customer PII via the API
  "complaints.read",
  "complaints.create",
  "complaints.update",
  "reports.kpi.read",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_SET = new Set<string>(API_SCOPES);
