export interface PendingEchoCandidate {
  id: string;
  textBody: string | null;
  messageType: string;
  createdAt: Date;
}

/**
 * Attach a WhatsApp Mobile/Web echo only when one pending Diamond send has the same text.
 * Several identical texts, or an echo with no text, are ambiguous and are not guessed.
 * A known provider message id is handled before this function runs.
 */
export function choosePendingEchoCandidate<T extends PendingEchoCandidate>(
  candidates: T[],
  echo: { textBody: string | null },
): T | null {
  const text = echo.textBody?.trim() ?? "";
  if (!text) return null;
  const matches = candidates.filter((candidate) => (candidate.textBody?.trim() ?? "") === text);
  return matches.length === 1 ? matches[0]! : null;
}
