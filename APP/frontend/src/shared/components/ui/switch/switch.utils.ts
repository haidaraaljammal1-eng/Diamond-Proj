export interface SwitchClassOptions {
  checked?: boolean;
  className?: string;
}

export interface SwitchStyleMap {
  switch: string;
  checked: string;
}

export function buildSwitchClassName(
  styles: SwitchStyleMap,
  options: SwitchClassOptions = {},
): string {
  return [
    styles.switch,
    options.checked ? styles.checked : "",
    options.className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}
