import { Fragment } from "react";
import { PHASES, PHASE_INFO, type Phase } from "@composer/core";
import { useUi } from "../../store/ui";
import { workspace, type PhaseStatus } from "../../fixtures/workspace";
import { PhaseHex } from "../primitives/PhaseHex";
import { Toggle } from "../primitives/Toggle";
import { cx } from "../primitives/cx";
import loopIcon from "../../assets/icons/loop.svg";
import styles from "./PhaseRail.module.css";

function outputLabel(phase: Phase, status: PhaseStatus): string {
  const output = phase === "define" ? workspace.activeFrame : PHASE_INFO[phase].output;
  if (status === "done") return `✓ ${output}`;
  if (status === "active") return `→ ${output}`;
  return output;
}

/** 56px rail: the five phases, the loop note, and the Focus toggle. */
export function PhaseRail() {
  const active = useUi((s) => s.activePhase);
  const setActive = useUi((s) => s.setActivePhase);
  const focus = useUi((s) => s.focus);
  const toggleFocus = useUi((s) => s.toggleFocus);

  return (
    <nav className={styles.rail} aria-label="Phases">
      {PHASES.map((phase, i) => {
        const status: PhaseStatus = phase === active ? "active" : workspace.phaseStatus[phase] === "done" ? "done" : "pending";
        const info = PHASE_INFO[phase];
        return (
          <Fragment key={phase}>
            {i > 0 && (
              <span className={styles.connector} aria-hidden>
                <span />
              </span>
            )}
            <button
              type="button"
              data-phase={phase}
              className={cx(styles.phase, styles[status])}
              aria-current={status === "active" ? "step" : undefined}
              onClick={() => setActive(phase)}
            >
              <PhaseHex phase={phase} />
              <span className={styles.index}>{info.index}</span>
              <span className={styles.name}>{info.name}</span>
              <span className={styles.output}>{outputLabel(phase, status)}</span>
            </button>
          </Fragment>
        );
      })}
      <span className={styles.loop}>
        <img src={loopIcon} alt="" width={12} height={12} />
        Loop {workspace.loop} · Validate loops back · Share exits
      </span>
      <span className={styles.spacer} />
      <label className={styles.focus} data-phase={active}>
        Focus
        <Toggle on={focus} onChange={toggleFocus} size="md" tone="phase" label="Focus on one phase" />
      </label>
    </nav>
  );
}
