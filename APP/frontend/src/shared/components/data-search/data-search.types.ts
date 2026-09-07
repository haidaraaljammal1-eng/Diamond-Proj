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
}
