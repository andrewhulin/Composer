import styles from "./Minimap.module.css";

/** Placeholder minimap matching Figma's 150 × 96 frame. M3 swaps in React Flow's MiniMap. */
const RECTS = [
  { x: 11, y: 9, w: 26, h: 10, c: "var(--phase-understand)" },
  { x: 11, y: 25, w: 26, h: 8, c: "var(--text-secondary)" },
  { x: 11, y: 37, w: 26, h: 8, c: "var(--text-secondary)" },
  { x: 11, y: 49, w: 26, h: 12, c: "var(--text-secondary)" },
  { x: 11, y: 65, w: 26, h: 14, c: "var(--signal-hypothesis)" },
  { x: 65, y: 33, w: 30, h: 14, c: "var(--text-primary)" },
  { x: 107, y: 35, w: 26, h: 12, c: "var(--phase-define)" },
];

export function Minimap() {
  return (
    <div className={styles.minimap} aria-hidden>
      {RECTS.map((r, i) => (
        <span key={i} style={{ left: r.x, top: r.y, width: r.w, height: r.h, background: r.c }} />
      ))}
      <span className={styles.viewport} />
    </div>
  );
}
