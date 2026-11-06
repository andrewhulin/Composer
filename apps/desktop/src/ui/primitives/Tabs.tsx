import type { KeyboardEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import styles from "./Tabs.module.css";

export interface TabItem<T extends string> {
  value: T;
  label: ReactNode;
  icon?: LucideIcon;
  /** A count or status after the label. */
  meta?: ReactNode;
  disabled?: boolean;
  /** Hover hint for the option. */
  title?: string;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** underline: switches a panel's view (Preview / Prompt / Node). segmented: picks one option (Mute / Light / Normal / Heavy). */
  variant?: "underline" | "segmented";
  size?: "sm" | "md";
  /** Segmented only: fill the width, splitting it evenly. */
  block?: boolean;
  className?: string;
}

/** Tabs and segmented controls. Arrow keys move the choice, as macOS does. */
export function Tabs<T extends string>({ items, value, onChange, label, variant = "underline", size = "md", block, className }: TabsProps<T>) {
  const tabs = variant === "underline";
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const live = items.filter((i) => !i.disabled);
    const at = live.findIndex((i) => i.value === value);
    const next = live[(at + (e.key === "ArrowRight" ? 1 : -1) + live.length) % live.length];
    if (!next) return;
    e.preventDefault();
    onChange(next.value);
    (e.currentTarget.querySelector(`[data-value="${CSS.escape(next.value)}"]`) as HTMLElement | null)?.focus();
  };
  return (
    <div
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={label}
      className={cx(styles.list, styles[variant], styles[size], block && styles.block, className)}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const on = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            data-value={item.value}
            role={tabs ? "tab" : "radio"}
            aria-selected={tabs ? on : undefined}
            aria-checked={tabs ? undefined : on}
            tabIndex={on ? 0 : -1}
            disabled={item.disabled}
            title={item.title}
            className={cx(styles.tab, on && styles.on)}
            onClick={() => onChange(item.value)}
          >
            {item.icon && <Icon icon={item.icon} size="sm" />}
            {item.label}
            {item.meta !== undefined && <span className={styles.meta}>{item.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}
