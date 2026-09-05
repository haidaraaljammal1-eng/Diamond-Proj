import type { ReactNode } from "react";
import styles from "./app-content.module.css";

/**
 * Main content area of the AppShell.
 *
 * Responsibilities: sizing relative to the rail, internal scroll, padding,
 * background relationship to the shell, and the centered Demo `.wrap`.
 * It never imposes cards/containers on pages — pages own their own content.
 */
export function AppContent({ children }: { children: ReactNode }) {
  return (
    <main className={styles.main} id="app-main">
      <div className={styles.wrap}>{children}</div>
    </main>
  );
}