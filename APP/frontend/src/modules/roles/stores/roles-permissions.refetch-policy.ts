export type RolesLoadStatus = "idle" | "loading" | "ready" | "error";

/** Background refetch keeps `ready` so the matrix stays mounted (scroll position). */
export function shouldRefetchInBackground(status: RolesLoadStatus): boolean {
  return status === "ready";
}
