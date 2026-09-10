export interface DataSearchProps {
  /** Applied query value — syncs local draft when changed externally. */
  appliedValue: string;
  onSearch: (value: string) => void;
  onClear: () => void;
  placeholder: string;
  inputLabel: string;
  searchButtonLabel: string;
  clearButtonLabel: string;
  loading?: boolean;
  inputTestId?: string;
  className?: string;
  /**
   * Render a non-form wrapper so DataSearch can sit inside an existing `<form>`.
   * Default stays a `<form>` (Search/Enter submit). Embedded mode uses a `<div>`,
   * a `type="button"` Search control, and Enter on the input runs search only.
   */
  embedded?: boolean;
}
