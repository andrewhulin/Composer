import { useUi, type Panel } from "../../store/ui";
import { cx } from "../primitives/cx";
import styles from "./PanelToggles.module.css";

const LABEL: Record<Panel, { name: string; keys: string }> = {
  left: { name: "sidebar", keys: "⌥⌘←" },
  bottom: { name: "history", keys: "⌥⌘↓" },
  right: { name: "inspector", keys: "⌥⌘→" },
};

/** A window outline with the panel's side filled in when it's showing. */
function Glyph({ panel, open }: { panel: Panel; open: boolean }) {
  const fill = panel === "left" ? { x: 2, y: 2, w: 4.5, h: 12 } : panel === "right" ? { x: 9.5, y: 2, w: 4.5, h: 12 } : { x: 2, y: 9.5, w: 12, h: 4.5 };
  const line = panel === "left" ? "M6.5 2v12" : panel === "right" ? "M9.5 2v12" : "M2 9.5h12";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      {open && <rect x={fill.x} y={fill.y} width={fill.w} height={fill.h} rx="1" fill="currentColor" opacity="0.35" />}
      <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d={line} stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** Title-bar controls to collapse and expand the sidebar, history bar and inspector. */
export function PanelToggles() {
  const panels = useUi((s) => s.panels);
  const toggle = useUi((s) => s.togglePanel);
  return (
    <div className={styles.group} role="group" aria-label="Panels">
      {(["left", "bottom", "right"] as Panel[]).map((p) => (
        <button
          key={p}
          type="button"
          className={cx(styles.toggle, panels[p] && styles.on)}
          aria-pressed={panels[p]}
          aria-label={`${panels[p] ? "Hide" : "Show"} ${LABEL[p].name}`}
          title={`${panels[p] ? "Hide" : "Show"} ${LABEL[p].name}  ${LABEL[p].keys}`}
          onClick={() => toggle(p)}
        >
          <Glyph panel={p} open={panels[p]} />
        </button>
      ))}
    </div>
  );
}
