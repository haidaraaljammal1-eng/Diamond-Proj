import type { InputHTMLAttributes } from "react";
import styles from "./input.module.css";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${styles.input} ${className ?? ""}`} />;
}
