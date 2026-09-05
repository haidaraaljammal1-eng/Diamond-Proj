import type { ReactNode } from "react";
import styles from "./page-header.module.css";

export interface PageHeaderProps {
  /** Already-translated breadcrumb line (e.g. "Administration · Access"). */
  crumbs?: string;
  /** Already-translated page title. */
  title: string;
  /** Already-translated supporting line. */
  subtitle?: string;
  /** Page-level controls rendered at the end of the header row. */
  actions?: ReactNode;
}

/**
 * Shared page header (Demo `.vhead`). It knows nothing about APIs, stores,
 * routing or permissions — callers pass final, translated text.
 */
export function PageHeader({
  crumbs,
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        {crumbs ? <p className={styles.crumbs}>{crumbs}</p> : null}
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        <div className={styles.thread} aria-hidden="true" />
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
