import type { ElementType } from "react";
import { buildCardClassName } from "./card.utils";
import type { CardProps, CardSectionProps } from "./card.types";
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
Card.Footer = CardFooter;
