import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import styles from "./Field.module.css";

type FieldSize = "sm" | "md";
interface FieldLook {
  size?: FieldSize;
  /** Red outline, for a value that failed a check. */
  invalid?: boolean;
  /** Monospace, for tokens, keys and ids. */
  mono?: boolean;
}

export function Input({ size = "md", invalid, mono, className, ...rest }: Omit<ComponentProps<"input">, "size"> & FieldLook) {
  return <input className={cx(styles.field, styles[size], invalid && styles.invalid, mono && styles.mono, className)} aria-invalid={invalid || undefined} {...rest} />;
}

export function Textarea({ size = "md", invalid, mono, className, ...rest }: ComponentProps<"textarea"> & FieldLook) {
  return <textarea className={cx(styles.field, styles.area, styles[size], invalid && styles.invalid, mono && styles.mono, className)} aria-invalid={invalid || undefined} {...rest} />;
}

/** A native select, so the macOS menu and keyboard handling come for free. */
export function Select({ size = "md", invalid, className, children, ...rest }: Omit<ComponentProps<"select">, "size"> & Omit<FieldLook, "mono">) {
  return (
    <span className={cx(styles.selectWrap, className)}>
      <select className={cx(styles.field, styles.select, styles[size], invalid && styles.invalid)} aria-invalid={invalid || undefined} {...rest}>
        {children}
      </select>
      <Icon icon={ChevronDown} size="sm" className={styles.chevron} />
    </span>
  );
}
