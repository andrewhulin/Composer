import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";
import styles from "./Panel.module.css";

export interface PanelProps extends Omit<ComponentProps<"section">, "title"> {
  /** card: a quiet grouped block in a panel. raised: a floating surface (popovers, docks). paper: rendered output. */
  tone?: "card" | "raised" | "paper";
  title?: ReactNode;
  /** Right side of the header: a count, a toggle, a small button. */
  actions?: ReactNode;
  padding?: "sm" | "md" | "lg";
}

/** A surface that groups related content, with an optional header row. */
export function Panel({ tone = "card", title, actions, padding = "md", className, children, ...rest }: PanelProps) {
  return (
    <section className={cx(styles.panel, styles[tone], styles[`pad-${padding}`], className)} {...rest}>
      {(title || actions) && (
        <header className={styles.head}>
          {title && <h3 className={styles.title}>{title}</h3>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
