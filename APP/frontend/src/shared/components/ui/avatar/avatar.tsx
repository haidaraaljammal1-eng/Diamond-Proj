import { getInitials } from "./avatar.utils";
import styles from "./avatar.module.css";

export interface AvatarProps {
  /** Display name used to derive initials. */
  name: string;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Shared initials avatar — Demo `.emp .avatar` octagon. No image URLs; callers
 * pass the resolved display name (name or email fallback).
 */
export function Avatar({ name, size = "md", className }: AvatarProps) {
  return (
    <span
      className={[styles.avatar, styles[size], className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  );
}

export { getDisplayName, getInitials } from "./avatar.utils";
