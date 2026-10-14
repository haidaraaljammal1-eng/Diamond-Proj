export { FN, ALL_FUNCTIONAL_CAPABILITY_KEYS, isFunctionalCapabilityKey } from "./keys";
export type { FunctionalCapabilityKey } from "./keys";
export type { FunctionalPageId, FunctionalAuthContext } from "./types";
export {
  FUNCTIONAL_PAGES,
  FUNCTIONAL_PAGE_ORDER,
  FUNCTIONAL_CAPABILITY_REGISTRY,
  getFunctionalCapability,
  getPageDefinition,
} from "./manifest";
export {
  normalizeFunctionalGrants,
  removeFunctionalGrant,
  canViewFunctionalPage,
  canPerformFunctionalCapability,
  extractFunctionalGrantsFromPermissions,
} from "./policy-engine";
export { applyFunctionalGrantToggle, roleHasFunctionalGrant } from "./checkbox-transitions";
export {
  isFunctionalRbacV2UiEnabled,
  isFunctionalRbacV2BackendDeclaredEnabled,
  isFunctionalRbacV2ModeMismatch,
} from "./feature-flag";
export { resolveFunctionalPageIdFromPath } from "./route-map";
export { useFunctionalAuthContext } from "./hooks/use-functional-auth";
export {
  useDiamondPageAccess,
  useDiamondCapability,
  useLegacyOrFunctionalCapability,
  useLegacyAnyOrFunctionalCapability,
  useDiamondAccessHelpers,
} from "./hooks/use-diamond-access";
export { FunctionalRouteGuard } from "./components/functional-route-guard";
export { RbacV2ModeBanner } from "./components/rbac-v2-mode-banner";
