"use client";

import { useEffect, type ReactNode } from "react";
import {
  selectSidebarExpanded,
  useAppShellStore,
} from "./store/app-shell.store";
import styles from "./app-shell.module.css";

/**
 * ShellFrame — the client boundary that publishes the shell layout state.
 *
 * It renders the shell stage and exposes the rail state as a data attribute,
 * which drives the `--rail-w` custom property. Everything inside the shell
 * (rail width, main content offset) reads that single variable, so no
 * component duplicates layout numbers.
 */
export function ShellFrame({ children }: { children: ReactNode }) {
  const expanded = useAppShellStore(selectSidebarExpanded);
  const markHydrated = useAppShellStore((s) => s.markHydrated);

  useEffect(() => {
    markHydrated();
  }, [markHydrated]);

  return (
    <div
      className={styles.shell}
      data-sidebar={expanded ? "expanded" : "collapsed"}
    >
      {children}
    </div>
  );
}
