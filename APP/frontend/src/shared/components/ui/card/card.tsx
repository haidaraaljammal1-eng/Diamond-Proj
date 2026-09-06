import type { ElementType } from "react";
import { buildCardClassName } from "./card.utils";
import type { CardProps, CardSectionProps, CardTitleProps } from "./card.types";
import styles from "./card.module.css";

const styleMap = {
  card: styles.card,
  interactive: styles.interactive,
  selected: styles.selected,
  paddingDefault: styles.paddingDefault,
  paddingCompact: styles.paddingCompact,
  paddingNone: styles.paddingNone,
};

function CardHeader({ children, className }: CardSectionProps) {
  return <header className={[styles.header, className].filter(Boolean).join(" ")}>{children}</header>;
}

/**
 * Card title — the Demo `.card h3` line: 13.5px champagne text, an optional
 * gold icon, and an optional end slot (a chip, a count, a small action).
 */
function CardTitle({ children, icon, trailing, className }: CardTitleProps) {
  return (
    <h3 className={[styles.title, className].filter(Boolean).join(" ")}>
      {icon ? (
        <span className={styles.titleIcon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles.titleText}>{children}</span>
      {trailing ? <span className={styles.titleTrailing}>{trailing}</span> : null}
    </h3>
  );
}

function CardFooter({ children, className }: CardSectionProps) {
  return <footer className={[styles.footer, className].filter(Boolean).join(" ")}>{children}</footer>;
}

/**
 * Shared Diamond card surface. Domain cards (UserCard, VehicleCard, …) compose
 * this primitive instead of redefining borders, radius, shadows and hover.
 */
export function Card({
  children,
  interactive = false,
  selected = false,
  padding = "default",
  as = "article",
  className,
  ...props
}: CardProps) {
  const Component = as as ElementType;
  return (
    <Component
      className={buildCardClassName(styleMap, {
        interactive,
        selected,
        padding,
        className,
      })}
      {...props}
    >
      {children}
    </Component>
  );
}

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Footer = CardFooter;
