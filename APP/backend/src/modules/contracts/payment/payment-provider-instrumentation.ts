let providerStatusLookupCount = 0;

export function recordProviderStatusLookup(): void {
  providerStatusLookupCount += 1;
}

export function getProviderStatusLookupCount(): number {
  return providerStatusLookupCount;
}

export function resetProviderStatusLookupCount(): void {
  providerStatusLookupCount = 0;
}
