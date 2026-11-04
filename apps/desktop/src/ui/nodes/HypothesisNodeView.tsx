import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { HypothesisNode } from "@composer/core";
import { useProject } from "../../store/project";
import { cx } from "../primitives/cx";
import { Port } from "./Port";
import styles from "./Node.module.css";
import own from "./HypothesisNodeView.module.css";

/** Node/Hypothesis: a block in the memory chain with swappable variables. */
export const HypothesisNodeView = memo(function HypothesisNodeView({ id, selected }: NodeProps) {
  const node = useProject((s) => s.graph.nodes[id]) as HypothesisNode | undefined;
  const block = useProject((s) => (node ? s.hypotheses[node.blockId] : undefined));
  if (!node) return null;
  return (
    <div className={cx(styles.node, own.hyp, selected && styles.selected, block?.status === "retired" && own.retired)}>
      <div className={styles.header}>
        <span className={cx(styles.glyph, own.glyph)}>{block?.label ?? "H"}</span>
        <span className={styles.title}>Hypothesis</span>
        <span className={styles.tag}>Hypothesis</span>
      </div>
      <div className={own.body}>
        <p className={own.statement}>{block?.statement ?? "Missing block"}</p>
        {!!block?.vars.length && (
          <div className={own.vars}>
            {block.vars.map((v) => (
              <div key={v.key} className={own.var}>
                <span className={own.varKey}>{v.key}</span>
                <span className={own.varValue}>{v.value}</span>
                <span className={own.swap} aria-hidden>
                  ⇄
                </span>
              </div>
            ))}
          </div>
        )}
        <div className={own.footer}>
          <span className={own.status}>{block?.status ?? "—"}</span>
          <span>confidence {block ? block.confidence.toFixed(2) : "—"}</span>
        </div>
      </div>
      <Port nodeId={id} port="evidence" type="text" side="in" top={14} color="var(--signal-hypothesis)" />
      <Port nodeId={id} port="out" type="hypothesis" side="out" top={14} />
    </div>
  );
});
