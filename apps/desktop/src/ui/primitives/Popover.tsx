import { useEffect, useRef, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Kbd } from "./Kbd";
import styles from "./Popover.module.css";

export interface PopoverProps extends ComponentProps<"div"> {
  /** Called on Escape or a press outside. Leave it out when the parent closes the popover itself. */
  onDismiss?: () => void;
  /** Keeps canvas drags, pans and node keys from starting inside it. */
  onCanvas?: boolean;
  /** "sm" for a popover that's just a Menu, so its rows sit close to the edge. */
  padding?: "sm" | "md";
}

/** A floating surface. The parent places it (absolute or fixed); this gives it the look and dismissal. */
export function Popover({ onDismiss, onCanvas, padding = "md", className, children, ...rest }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onDismiss) return;
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onDismiss();
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && onDismiss();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [onDismiss]);
  return (
    <div ref={ref} className={cx(styles.popover, padding === "sm" && styles.tight, onCanvas && "nodrag nopan nokey", className)} {...rest}>
      {children}
    </div>
  );
}

/** A list of actions in a popover. Arrow keys move between items. */
export function Menu({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
    if (!items.length) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]!.focus();
  };
  return (
    <div role="menu" aria-label={label} className={cx(styles.menu, className)} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}

export interface MenuItemProps extends Omit<ComponentProps<"button">, "children"> {
  icon?: LucideIcon;
  /** Second line, in a quieter color. */
  hint?: ReactNode;
  /** Right-aligned mono detail, such as a count or #seq. */
  meta?: ReactNode;
  shortcut?: string;
  /** Shows a check, for menus that pick one option. */
  checked?: boolean;
  danger?: boolean;
  children: ReactNode;
}

export function MenuItem({ icon, hint, meta, shortcut, checked, danger, className, children, type = "button", ...rest }: MenuItemProps) {
  return (
    <button type={type} role="menuitem" className={cx(styles.item, danger && styles.danger, className)} {...rest}>
      {icon && <Icon icon={icon} size="sm" className={styles.itemIcon} />}
      <span className={styles.itemText}>
        <span className={styles.itemLabel}>{children}</span>
        {hint && <span className={styles.itemHint}>{hint}</span>}
      </span>
      {meta !== undefined && <span className={styles.meta}>{meta}</span>}
      {shortcut && <Kbd>{shortcut}</Kbd>}
      {checked && <Icon icon={Check} size="sm" className={styles.check} />}
    </button>
  );
}

export function MenuDivider() {
  return <div role="separator" className={styles.divider} />;
}
