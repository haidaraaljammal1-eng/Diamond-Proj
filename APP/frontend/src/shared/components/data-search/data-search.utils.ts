/** Trim a search draft before applying it to a server-side query. */
export function normalizeSearchSubmit(draft: string): string {
  return draft.trim();
}

/** Whether the clear affordance should be visible. */
export function hasSearchContent(draft: string, applied: string): boolean {
  return draft.length > 0 || applied.trim().length > 0;
}
