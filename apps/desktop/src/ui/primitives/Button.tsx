import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Kbd } from "./Kbd";
import { Tooltip } from "./Tooltip";
import styles from "./Button.module.css";

/**
 * primary: the one main action (light fill). phase: the main action in a phase surface (phase fill).
 * secondary: outlined. ghost: quiet, no border. tint: phase-tinted outline. danger: destructive.
 */
export type ButtonVariant = "primary" | "phase" | "secondary" | "ghost" | "tint" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconAfter?: LucideIcon;
  /** Shown after the label, such as ⌘↵. */
  shortcut?: string;
  /** Stretch to the container's width. */
  block?: boolean;
  /** On, for buttons that toggle a mode or open a menu (sets aria-pressed). */
  pressed?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconAfter,
  shortcut,
  block,
  pressed,
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const iconSize = size === "lg" ? "md" : "sm";
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cx(styles.button, styles[variant], styles[size], block && styles.block, pressed && styles.pressed, className)}
      {...rest}
    >
      {icon && <Icon icon={icon} size={iconSize} />}
      {children}
      {shortcut && <Kbd inherit>{shortcut}</Kbd>}
      {iconAfter && <Icon icon={iconAfter} size={iconSize} />}
    </button>
  );
}

export interface IconButtonProps extends Omit<ComponentProps<"button">, "children"> {
  icon: LucideIcon;
  /** Required: it's the button's only name. */
  label: string;
  variant?: "ghost" | "secondary";
  size?: "sm" | "md";
  /** Pressed state for toggles, such as a panel switch. */
  pressed?: boolean;
  /** Shown in the tooltip after the label. */
  shortcut?: string;
}

/** A square, icon-only button. Its label is spoken and shown as the tooltip. */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  pressed,
  shortcut,
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        type={type}
        aria-label={label}
        aria-pressed={pressed}
        className={cx(
          styles.button,
          styles.iconOnly,
          styles[variant],
          styles[`square-${size}`],
          pressed && styles.pressed,
          className,
        )}
        {...rest}
      >
        <Icon icon={icon} size={size === "sm" ? "sm" : "md"} />
      </button>
    </Tooltip>
  );
}
