import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import styles from "./Chip.module.css";

export interface ChipProps extends ComponentProps<"button"> {
  /** On, for filters and multi-select pickers. */
  selected?: boolean;
  icon?: LucideIcon;
  size?: "sm" | "md";
}

/** A small rounded button that toggles: area pickers, filters, suggestions. */
export function Chip({
  selected,
  icon,
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cx(styles.chip, styles[size], selected && styles.selected, className)}
      {...rest}
    >
      {icon && <Icon icon={icon} size="sm" />}
      {children}
    </button>
  );
}

export type BadgeTone = "neutral" | "live" | "hypothesis" | "warn" | "error" | "phase" | "muted";

export interface BadgeProps extends ComponentProps<"span"> {
  tone?: BadgeTone;
  icon?: LucideIcon;
  mono?: boolean;
  /** Filled with the tone's color, for a strong marker such as KEY. */
  solid?: boolean;
}

/** A static label for status or counts: "Proposed", "v3", "Over budget". */
export function Badge({ tone = "neutral", icon, mono, solid, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], mono && styles.mono, solid && styles.solid, className)} {...rest}>
      {icon && <Icon icon={icon} size="sm" />}
      {children}
    </span>
  );
}
