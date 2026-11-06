import { useEffect, useId, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Kbd } from "./Kbd";
import styles from "./Tooltip.module.css";

interface TooltipProps {
  label: string;
  shortcut?: string;
  side?: "top" | "bottom";
  /** One element that takes focus and pointer events, usually a button. */
  children: ReactNode;
}

const DELAY = 450;

/** A short label on hover or keyboard focus, drawn above everything so panels can't clip it. */
export function Tooltip({ label, shortcut, side = "top", children }: TooltipProps) {
  const id = useId();
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = (wrap: HTMLElement, wait: number) => {
    const anchor = wrap.firstElementChild as HTMLElement | null;
    if (!anchor) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = anchor.getBoundingClientRect();
      anchor.setAttribute("aria-describedby", id);
      setAt({ x: r.left + r.width / 2, y: side === "top" ? r.top : r.bottom });
    }, wait);
  };
  const hide = (wrap: HTMLElement) => {
    window.clearTimeout(timer.current);
    wrap.firstElementChild?.removeAttribute("aria-describedby");
    setAt(null);
  };

  return (
    // display: contents, so the wrapper adds no box; events from the child still pass through it.
    <span
      className={styles.anchor}
      onPointerEnter={(e) => show(e.currentTarget, DELAY)}
      onPointerLeave={(e) => hide(e.currentTarget)}
      onPointerDown={(e) => hide(e.currentTarget)}
      onFocus={(e: FocusEvent<HTMLSpanElement>) => (e.target as HTMLElement).matches(":focus-visible") && show(e.currentTarget, 0)}
      onBlur={(e) => hide(e.currentTarget)}
    >
      {children}
      {at &&
        createPortal(
          <span role="tooltip" id={id} className={`${styles.tip} ${styles[side]}`} style={{ left: at.x, top: at.y }}>
            {label}
            {shortcut && <Kbd inherit>{shortcut}</Kbd>}
          </span>,
          document.body,
        )}
    </span>
  );
}
