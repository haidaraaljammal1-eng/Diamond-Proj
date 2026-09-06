/** Locale-safe initials for avatar fallbacks (Latin uppercased; Arabic kept). */
export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";

  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return formatInitial(parts[0][0] + parts[1][0]);
  }

  const word = parts[0];
  if (word.length >= 2) {
    return formatInitial(word.slice(0, 2));
  }

  return formatInitial(word[0]);
}

function formatInitial(value: string): string {
  if (/[A-Za-z]/.test(value)) return value.toUpperCase();
  return value;
}

export function getDisplayName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : email;
}
