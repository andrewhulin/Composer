import type { UpdateState } from "../../app/updates";
import { updates, useUpdates } from "../../store/updates";
import { ago, useNow } from "../../hooks/useNow";
import { Dot } from "../primitives/Dot";
import { Button } from "../primitives/Button";
import styles from "./SettingsDialog.module.css";

function describe(state: UpdateState, checkedAt: number | null, now: number): { text: string; color: string } {
  switch (state.status) {
    case "unsupported":
      return { text: "Browser preview · updates install in the Mac app", color: "var(--text-muted)" };
    case "idle":
      return { text: "Not checked yet", color: "var(--text-muted)" };
    case "checking":
      return { text: "Checking…", color: "var(--text-primary)" };
    case "current":
      return { text: `Up to date${checkedAt ? ` · checked ${ago(checkedAt, now)}` : ""}`, color: "var(--signal-live)" };
    case "error":
      return { text: `Couldn't check · ${state.message}`, color: "var(--phase-define)" };
    case "available":
      return { text: `v${state.version} is ready`, color: "var(--signal-live)" };
    case "downloading":
      return { text: `Downloading v${state.version}${state.progress !== null ? ` · ${Math.round(state.progress * 100)}%` : "…"}`, color: "var(--text-primary)" };
    case "waiting":
      return { text: `v${state.version} installs when ${state.reason} finishes`, color: "var(--signal-warn)" };
    case "restarting":
      return { text: "Restarting…", color: "var(--text-primary)" };
    case "failed":
      return { text: `Couldn't update to v${state.version} · ${state.message}`, color: "var(--phase-define)" };
  }
}

/** Settings → Updates: the running version, the last check, and the one action that fits. */
export function UpdatesSection() {
  const { current, checkedAt, state } = useUpdates((s) => s);
  const now = useNow(state.status === "current", 30_000);
  const status = describe(state, checkedAt, now);
  return (
    <section className={styles.section}>
      <span className="caps">Updates</span>
      <p className={styles.note}>
        Composer checks GitHub Releases for a signed update a few seconds after launch and every four hours. Restarting waits for any running Claude call to finish.
      </p>
      <div className={styles.updateStatus}>
        <Dot color={status.color} />
        {current && <span className={styles.version}>Version {current}</span>}
        <span className={styles.updateText} title={status.text}>
          {status.text}
        </span>
      </div>
      <div className={styles.row}>
        {state.status === "available" || state.status === "failed" ? (
          <Button variant="primary" onClick={() => void updates.restart()}>
            {state.status === "failed" ? "Try again" : `Restart to update`}
          </Button>
        ) : state.status === "waiting" ? (
          <Button variant="secondary" onClick={updates.cancelRestart}>
            Don't restart yet
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => void updates.check({ manual: true })}
            disabled={state.status === "unsupported" || state.status === "checking" || state.status === "downloading" || state.status === "restarting"}
          >
            {state.status === "checking" ? "Checking…" : "Check for updates"}
          </Button>
        )}
      </div>
    </section>
  );
}
