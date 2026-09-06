import { buildSwitchClassName } from "./switch.utils";
import styles from "./switch.module.css";

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name — required because the control has no visible label. */
  label: string;
  disabled?: boolean;
  className?: string;
}

const styleMap = {
  switch: styles.switch,
  checked: styles.checked,
};

/**
 * Shared Diamond toggle switch (Demo `.switch`). Uses the primary gold palette
 * for the ON state — never ad-hoc green toggles in feature modules.
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  className,
}: SwitchProps) {
  return (
    <button
      type="button"
      className={buildSwitchClassName(styleMap, { checked, className })}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}
