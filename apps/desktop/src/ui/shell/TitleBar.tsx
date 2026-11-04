import { PHASE_INFO } from "@composer/core";
import { useUi } from "../../store/ui";
import { workspace } from "../../fixtures/workspace";
import { Dot } from "../primitives/Dot";
import styles from "./TitleBar.module.css";

/** 44px title bar. The native traffic lights sit in the left 68px (overlay title bar). */
export function TitleBar() {
  const phase = useUi((s) => s.activePhase);
  return (
    <header className={styles.bar} data-tauri-drag-region>
      <div className={styles.left} data-tauri-drag-region>
        <span className={styles.app} data-tauri-drag-region>
          Design Composer
        </span>
      </div>
      <div className={styles.crumbs} data-tauri-drag-region>
        <span className={styles.project}>{workspace.project}</span>
        <span className={styles.slash}>/</span>
        <span className={styles.phase}>{PHASE_INFO[phase].name}</span>
      </div>
      <div className={styles.right} data-tauri-drag-region>
        <Dot color="var(--signal-live)" />
        <span className={styles.saved}>Saved · snapshot {workspace.snapshot.current}</span>
      </div>
    </header>
  );
}
