import type { NodeProps } from "@xyflow/react";
import { PHASE_INFO, type Phase } from "@composer/core";
import styles from "./RegionNode.module.css";

/** A phase's area when every phase shares one canvas (Focus off). */
export function RegionNode({ data }: NodeProps) {
  const phase = (data as { phase: Phase }).phase;
  const info = PHASE_INFO[phase];
  return (
    <div className={styles.region} data-phase={phase}>
      <span className={styles.label}>
        <span className={styles.index}>{info.index}</span> {info.name}
        <span className={styles.output}>→ {info.output.toUpperCase()}</span>
      </span>
    </div>
  );
}

/** The Collect drop target from Figma 07, shown until the first source arrives. */
export function DropHint() {
  return (
    <div className={styles.drop}>
      + Drop files, links, boards, transcripts. Composer keeps all of it.
      <span className={styles.dropSub}>Or paste with ⌘V. Each item becomes a context card you can weigh.</span>
    </div>
  );
}
