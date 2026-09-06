import type { HTMLAttributes, ReactNode } from "react";
import type { CardPadding } from "./card.utils";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  /** Demo `.emp:hover` lift — for clickable or hoverable surfaces only. */
  interactive?: boolean;
  /** Optional active/selected visual state. */
  selected?: boolean;
  padding?: CardPadding;
  /** Render as a different element when needed (defaults to `article`). */
  as?: "article" | "div" | "section";
}

export interface CardSectionProps {
  children: ReactNode;
  className?: string;
}

export interface CardTitleProps {
  children: ReactNode;
  /** Optional gold icon before the title (Demo `.card h3 svg`). */
  icon?: ReactNode;
  /** Optional end slot — a chip, count or small action. */
  trailing?: ReactNode;
  className?: string;
}
