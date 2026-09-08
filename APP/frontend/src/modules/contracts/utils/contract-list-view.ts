export type ContractsListView =
  | "denied"
  | "error"
  | "loading"
  | "empty"
  | "filteredEmpty"
  | "ready";

export function resolveContractsListView(input: {
  isAllowed: boolean;
  isReady: boolean;
  itemCount: number;
  activeFilterCount: number;
  hasError: boolean;
}): ContractsListView {
  if (!input.isAllowed) return "denied";
  if (input.hasError) return "error";
  if (!input.isReady && input.itemCount === 0) return "loading";
  if (input.itemCount === 0) {
    return input.activeFilterCount > 0 ? "filteredEmpty" : "empty";
  }
  return "ready";
}
