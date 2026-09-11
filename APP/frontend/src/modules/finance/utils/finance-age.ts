type AgeTranslator = (key: string, values?: { count?: number }) => string;

export function formatObligationAge(
  obligationCreatedAt: string,
  now: Date,
  t: AgeTranslator,
): string {
  const created = new Date(obligationCreatedAt);
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startCreated = new Date(created);
  startCreated.setHours(0, 0, 0, 0);
  const diffDays = Math.max(
    0,
    Math.floor((startToday.getTime() - startCreated.getTime()) / 86_400_000),
  );

  if (diffDays === 0) return t("age.today");
  if (diffDays === 1) return t("age.oneDay");
  return t("age.days", { count: diffDays });
}
