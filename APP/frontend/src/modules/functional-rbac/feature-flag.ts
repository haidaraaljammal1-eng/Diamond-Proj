/**
 * Frontend RBAC V2 UI gate (default off). Does not change Backend enforcement.
 *
 * For staging, set `NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_UI=true` together with
 * `NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_BACKEND_ENABLED=true` when the API also runs V2.
 */
function envTruthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export function isFunctionalRbacV2UiEnabled(): boolean {
  return envTruthy(process.env.NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_UI);
}

/** Declared mirror of Backend `FUNCTIONAL_RBAC_V2_ENABLED` for mismatch warnings. */
export function isFunctionalRbacV2BackendDeclaredEnabled(): boolean {
  return envTruthy(process.env.NEXT_PUBLIC_FUNCTIONAL_RBAC_V2_BACKEND_ENABLED);
}

export function isFunctionalRbacV2ModeMismatch(): boolean {
  const ui = isFunctionalRbacV2UiEnabled();
  const backend = isFunctionalRbacV2BackendDeclaredEnabled();
  return ui !== backend;
}
