import type { WhapiHistoryListResult } from "src/modules/whatsapp/whapi.history.client";

/** Default P3-D history mock: no Whapi groups in automated tests unless overridden. */
export async function whapiHistoryNoGroups(
  count: number,
  offset: number,
): Promise<WhapiHistoryListResult<Record<string, unknown>>> {
  if (offset > 0) return { items: [], pageSize: count, hasMore: false };
  return { items: [], pageSize: count, hasMore: false };
}
