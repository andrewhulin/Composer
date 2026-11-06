import { Fragment, useMemo } from "react";
import { PHASES, PHASE_INFO, type Phase } from "@composer/core";
import { actions, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { PhaseHex } from "../primitives/PhaseHex";
import { Toggle } from "../primitives/Toggle";
import { cx } from "../primitives/cx";
import { useOutputLabel } from "../canvas/Canvas";
import { ArrowRight, Check, RotateCw } from "lucide-react";
import { Icon } from "../primitives/Icon";
import styles from "./PhaseRail.module.css";

type Status = "done" | "active" | "pending";

function PhaseButton({ phase, status }: { phase: Phase; status: Status }) {
  const info = PHASE_INFO[phase];
  const output = useOutputLabel(phase);
  return (
    <button
      type="button"
      data-phase={phase}
      className={cx(styles.phase, styles[status])}
      aria-current={status === "active" ? "step" : undefined}
      onClick={() => void actions.setActivePhase(phase)}
    >
      <PhaseHex phase={phase} />
      <span className={styles.index}>{info.index}</span>
      <span className={styles.name}>{info.name}</span>
      <span className={styles.output}>
        {status === "done" && <Icon icon={Check} size="sm" />}
        {status === "active" && <Icon icon={ArrowRight} size="sm" />}
        {output}
      </span>
    </button>
  );
}

/** 56px rail: the five phases, the loop note, and the Focus toggle. */
export function PhaseRail() {
  const active = useProject((s) => s.activePhase);
  const loop = useProject((s) => s.loop);
  const versions = useProject((s) => s.versions);
  const locked = useMemo(() => new Set(Object.values(versions).filter((v) => v.loop === loop).map((v) => v.phase)), [versions, loop]);
  const focus = useUi((s) => s.focus);
  const toggleFocus = useUi((s) => s.toggleFocus);

  return (
    <nav className={styles.rail} aria-label="Phases" data-tour="phase-rail">
      {PHASES.map((phase, i) => (
        <Fragment key={phase}>
          {i > 0 && (
            <span className={styles.connector} aria-hidden>
              <span />
            </span>
          )}
          <PhaseButton phase={phase} status={phase === active ? "active" : locked.has(phase) ? "done" : "pending"} />
        </Fragment>
      ))}
      <span className={styles.loop} title="Validate loops back to Understand · Share exits">
        <Icon icon={RotateCw} size="sm" />
        Loop {loop}
        <span className={styles.loopHint}>· Validate loops back · Share exits</span>
      </span>
      <span className={styles.spacer} />
      <label className={styles.focus} data-phase={active}>
        Focus
        <Toggle on={focus} onChange={toggleFocus} size="md" tone="phase" label="Focus on one phase" />
      </label>
    </nav>
  );
}
