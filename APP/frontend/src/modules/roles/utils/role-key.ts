/**
 * Role keys are the Backend's stable identifier (`^[a-z][a-z0-9_]*$`, max 50),
 * so they are derived rather than typed: the user names the role, the key is
 * built from that name and made unique against the roles already loaded.
 */
const MAX_KEY_LENGTH = 50;
const FALLBACK_BASE = "role";

/** Latin slug of a name; empty when the name carries no Latin letters/digits. */
function slugify(name: string): string {
  return name
    .normalize("NFD")
    // Strip combining marks so "é" → "e"; non-Latin scripts drop out below.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function withSuffix(base: string, suffix: string): string {
  return `${base.slice(0, MAX_KEY_LENGTH - suffix.length)}${suffix}`;
}

/**
 * A unique, Backend-valid role key for `name`.
 *
 * An Arabic-only name has no Latin slug, so it falls back to `role_2`,
 * `role_3`, … — the visible identity of a role is its name, not its key.
 */
export function buildRoleKey(name: string, existingKeys: Iterable<string>): string {
  const taken = new Set(existingKeys);
  const slug = slugify(name);
  const base = (/^[a-z]/.test(slug) ? slug : `${FALLBACK_BASE}_${slug}`)
    .replace(/_+$/, "")
    .slice(0, MAX_KEY_LENGTH);
  const candidate = base.length > 0 ? base : FALLBACK_BASE;

  if (!taken.has(candidate)) return candidate;

  for (let index = 2; index < 1000; index += 1) {
    const next = withSuffix(candidate, `_${index}`);
    if (!taken.has(next)) return next;
  }

  // Practically unreachable; keeps the function total.
  return withSuffix(candidate, `_${Date.now().toString(36)}`);
}
