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
