/** NextAuth `status === "loading"` during `update()` must not unmount authorized pages. */
export function shouldShowFunctionalRouteGuardLoading(
  status: string,
  hasAuthenticatedUser: boolean,
): boolean {
  return status === "loading" && !hasAuthenticatedUser;
}
