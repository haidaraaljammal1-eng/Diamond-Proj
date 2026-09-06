export type CardPadding = "default" | "compact" | "none";

export interface CardClassOptions {
  interactive?: boolean;
  selected?: boolean;
  padding?: CardPadding;
  className?: string;
}

export interface CardStyleMap {
  card: string;
  interactive: string;
  selected: string;
  paddingDefault: string;
  paddingCompact: string;
  paddingNone: string;
}

/** Pure class-name merger so Card variants stay unit-testable without a DOM. */
export function buildCardClassName(
  styles: CardStyleMap,
  options: CardClassOptions = {},
): string {
  const padding = options.padding ?? "default";
  const paddingClass =
    padding === "none"
      ? styles.paddingNone
      : padding === "compact"
        ? styles.paddingCompact
        : styles.paddingDefault;

  return [
    styles.card,
    options.interactive ? styles.interactive : "",
    options.selected ? styles.selected : "",
    paddingClass,
    options.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}
