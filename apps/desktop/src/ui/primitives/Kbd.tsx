import type { ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Kbd.module.css";

/** A keyboard shortcut, such as ⌘K or ⇧←. Modifier symbols stay text, never icons. */
export function Kbd({
  children,
  boxed,
  inherit,
  className,
}: {
  children: ReactNode;
  boxed?: boolean;
  /** Take the surrounding control's color, dimmed. */ inherit?: boolean;
  className?: string;
}) {
  return (
    <kbd className={cx(styles.kbd, boxed && styles.boxed, inherit && styles.inherit, className)}>
      {children}
    </kbd>
  );
}
