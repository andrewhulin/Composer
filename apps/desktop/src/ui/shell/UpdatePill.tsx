import { updates, useUpdates } from "../../store/updates";
import { Dot } from "../primitives/Dot";
import styles from "./UpdatePill.module.css";

/** Title-bar pill once an update is found: "Update ready · v0.1.1 · Restart". */
export function UpdatePill() {
  const state = useUpdates((s) => s.state);
  switch (state.status) {
    case "available":
      return (
        <button type="button" className={styles.pill} onClick={() => void updates.restart()} title={`Download v${state.version}, install it and relaunch`}>
          <Dot color="var(--signal-live)" />
          Update ready · v{state.version} <span className={styles.action}>Restart</span>
        </button>
      );
    case "downloading":
      return (
        <span className={styles.pill} role="status">
          <span className={styles.spinner} />
          Updating · v{state.version}
          {state.progress !== null && <span className={styles.meter}>{Math.round(state.progress * 100)}%</span>}
        </span>
      );
    case "waiting":
      return (
        <button type="button" className={styles.pill} onClick={updates.cancelRestart} title={`Restarts when ${state.reason} finishes. Click to cancel.`}>
          <span className={styles.spinner} />
          Update ready · v{state.version} <span className={styles.quiet}>Waiting</span>
        </button>
      );
    case "restarting":
      return (
        <span className={styles.pill} role="status">
          <span className={styles.spinner} />
          Restarting…
        </span>
      );
    case "failed":
      return (
        <button type="button" className={styles.pill} onClick={() => void updates.restart()} title={state.message}>
          <Dot color="var(--phase-define)" />
          Update failed · v{state.version} <span className={styles.action}>Retry</span>
        </button>
      );
    default:
      return null;
  }
}
