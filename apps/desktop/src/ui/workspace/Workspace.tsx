import { PHASE_SURFACE, type Phase } from "@composer/core";
import { useUi } from "../../store/ui";
import { DefineWorkspace } from "./DefineWorkspace";
import { ValidateWorkspace } from "./ValidateWorkspace";
import styles from "./Workspace.module.css";

/** Define and Validate are purpose-built workspaces over the same graph; the graph is one toggle away. */
export function Workspace({ phase }: { phase: Phase }) {
  const surface = PHASE_SURFACE[phase];
  return (
    <div className={styles.workspace} data-phase={phase}>
      {surface === "writing" ? <DefineWorkspace /> : surface === "scorecard" ? <ValidateWorkspace /> : null}
    </div>
  );
}

/** The switch between a workspace and the graph under it. */
export function SurfaceToggle({ phase }: { phase: Phase }) {
  const show = useUi((s) => s.showGraph);
  const set = useUi((s) => s.setShowGraph);
  if (PHASE_SURFACE[phase] === "canvas") return null;
  const name = PHASE_SURFACE[phase] === "writing" ? "Writing" : "Scorecard";
  return (
    <div className={styles.toggle} role="tablist" aria-label="View">
      <button type="button" role="tab" aria-selected={!show} className={!show ? styles.toggleOn : undefined} onClick={() => set(false)}>
        {name}
      </button>
      <button type="button" role="tab" aria-selected={show} className={show ? styles.toggleOn : undefined} onClick={() => set(true)}>
        Graph
      </button>
    </div>
  );
}
