import { PanelBottom, PanelLeft, PanelRight, type LucideIcon } from "lucide-react";
import { useUi, type Panel } from "../../store/ui";
import { IconButton } from "../primitives/Button";
import styles from "./PanelToggles.module.css";

const PANEL: Record<Panel, { name: string; keys: string; icon: LucideIcon }> = {
  left: { name: "sidebar", keys: "⌥⌘←", icon: PanelLeft },
  bottom: { name: "history", keys: "⌥⌘↓", icon: PanelBottom },
  right: { name: "inspector", keys: "⌥⌘→", icon: PanelRight },
};

/** Title-bar controls to collapse and expand the sidebar, history bar and inspector. */
export function PanelToggles() {
  const panels = useUi((s) => s.panels);
  const toggle = useUi((s) => s.togglePanel);
  return (
    <div className={styles.group} role="group" aria-label="Panels">
      {(["left", "bottom", "right"] as Panel[]).map((p) => (
        <IconButton
          key={p}
          icon={PANEL[p].icon}
          label={`${panels[p] ? "Hide" : "Show"} ${PANEL[p].name}`}
          shortcut={PANEL[p].keys}
          pressed={panels[p]}
          onClick={() => toggle(p)}
        />
      ))}
    </div>
  );
}
