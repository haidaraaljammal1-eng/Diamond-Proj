import type { CSSProperties, HTMLAttributes } from "react";
import type { OperatingCompanyIdentity } from "@/modules/operating-companies";
import styles from "./company-identity.module.css";

interface CompanyIdentityProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  company: Pick<OperatingCompanyIdentity, "code" | "displayName" | "accentColor">;
  compact?: boolean;
}

export function CompanyIdentity({ company, compact = false, className, ...props }: CompanyIdentityProps) {
  return (
    <span
      {...props}
      className={[styles.identity, compact ? styles.compact : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      style={{ "--company-accent": company.accentColor } as CSSProperties}
      data-company-code={company.code}
    >
      <span className={styles.marker} aria-hidden="true" />
      <span className={styles.label} dir="ltr">{company.displayName}</span>
    </span>
  );
}
