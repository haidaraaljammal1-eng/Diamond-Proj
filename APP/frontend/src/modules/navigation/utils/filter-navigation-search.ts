import type {
  TranslatedNavigationGroup,
  TranslatedNavigationItem,
} from "../navigation.types";

export type NavigationSearchHit = TranslatedNavigationItem & {
  groupLabel: string;
};

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase().normalize("NFKC");
}

/**
 * Filters visible rail link items by their translated label.
 * Empty / whitespace query → no hits (dropdown stays closed).
 * Action items and items without `href` are never searchable.
 */
export function filterNavigationSearch(
  groups: TranslatedNavigationGroup[],
  query: string,
): NavigationSearchHit[] {
  const needle = normalizeSearchText(query);
  if (!needle) return [];

  const hits: NavigationSearchHit[] = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (item.type !== "link" || !item.href) continue;
      if (!normalizeSearchText(item.label).includes(needle)) continue;
      hits.push({ ...item, groupLabel: group.label });
    }
  }
  return hits;
}
