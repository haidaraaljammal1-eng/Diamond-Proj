"use client";

import { useEffect, useState } from "react";

/**
 * Reactive CSS media query.
 *
 * Always returns `false` on the server and during the first client render so
 * hydration stays identical; the real value lands right after mount.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const sync = () => setMatches(mql.matches);

    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, [query]);

  return matches;
}
