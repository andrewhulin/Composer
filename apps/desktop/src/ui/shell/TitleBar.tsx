import { useState } from "react";
import { PHASE_INFO } from "@composer/core";
import { actions, useProject } from "../../store/project";
import { useSession } from "../../store/session";
import { Dot } from "../primitives/Dot";
import styles from "./TitleBar.module.css";

/** 44px title bar. The native traffic lights sit in the left 68px (overlay title bar). */
export function TitleBar() {
  const phase = useProject((s) => s.activePhase);
  const project = useProject((s) => s.project);
  const snapshots = useProject((s) => s.snapshots);
  const running = useProject((s) => Object.values(s.live).some((r) => r.status === "running"));
  const session = useSession();
  const [editing, setEditing] = useState(false);

  const status =
    session.status === "error"
      ? { color: "var(--phase-define)", text: `Storage error · ${session.message}` }
      : session.status === "booting"
        ? { color: "var(--text-muted)", text: "Opening…" }
        : running
          ? { color: "var(--text-primary)", text: "Running…" }
          : { color: "var(--signal-live)", text: snapshots.length ? `Saved · snapshot ${snapshots[snapshots.length - 1]!.seq}` : "Saved" };

  return (
    <header className={styles.bar} data-tauri-drag-region>
      <div className={styles.left} data-tauri-drag-region>
        <span className={styles.app} data-tauri-drag-region>
          Design Composer
        </span>
      </div>
      <div className={styles.crumbs} data-tauri-drag-region>
        {editing ? (
          <input
            autoFocus
            className={styles.rename}
            defaultValue={project?.name ?? ""}
            onBlur={(e) => {
              void actions.renameProject(e.currentTarget.value);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setEditing(false);
              e.stopPropagation();
            }}
          />
        ) : (
          <button type="button" className={styles.project} onDoubleClick={() => setEditing(true)} title="Double-click to rename">
            {project?.name ?? "Design Composer"}
          </button>
        )}
        <span className={styles.slash}>/</span>
        <span className={styles.phase}>{PHASE_INFO[phase].name}</span>
      </div>
      <div className={styles.right} data-tauri-drag-region>
        <Dot color={status.color} />
        <span className={styles.saved} title={status.text}>
          {status.text}
        </span>
      </div>
    </header>
  );
}
