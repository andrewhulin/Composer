import { PHASE_INFO, nextPhase, previousPhase, type Phase } from "@composer/core";
import styles from "./PhaseRails.module.css";

/**
 * Focus mode collapses neighbouring phases into 28px rails: the previous phase's locked output
 * comes in on the left (inlet), and the next phase waits on the right (outlet).
 */
export function PhaseRails({ phase }: { phase: Phase }) {
  const prev = previousPhase(phase);
  const next = nextPhase(phase);
  return (
    <>
      {prev && (
        <div className={`${styles.rail} ${styles.inlet}`} data-phase={prev}>
          <span className={styles.label}>
            {PHASE_INFO[prev].index} · {PHASE_INFO[prev].name.toUpperCase()}
            {"  ·  "}INLET{"  ·  "}
            {PHASE_INFO[prev].output.toUpperCase()}
          </span>
        </div>
      )}
      <div className={`${styles.rail} ${styles.outlet}`} data-phase={next ?? "share"}>
        <span className={styles.label}>
          {next
            ? `${PHASE_INFO[next].index} · ${PHASE_INFO[next].name.toUpperCase()}  ·  OUTLET  ·  WAITING`
            : "EXIT  ·  OUTSIDE COMPOSER"}
        </span>
      </div>
    </>
  );
}
