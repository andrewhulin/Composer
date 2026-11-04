import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { ClaudeNode } from "@composer/core";
import { incoming } from "@composer/engine";
import { useProject, statusesOf, previewPrompt } from "../../store/project";
import { useDebounced } from "../../hooks/useDebounced";
import { ago, useNow } from "../../hooks/useNow";
import { formatTokens } from "../primitives/format";
import { cx } from "../primitives/cx";
import { Port } from "./Port";
import glyph from "../../assets/icons/claude-glyph.svg";
import styles from "./Node.module.css";
import own from "./ClaudeNodeView.module.css";

const MODE: Record<string, string> = {
  synthesize_insights: "synthesis",
  draft_statement: "statement",
  prototype: "prototype",
  test_strategy: "test plan",
  verdict: "verdict",
  release_story: "story",
  pr_description: "pull request",
};

/** Node/Claude: one prompt step, with its run state on the bar (idle, running, stale, over budget). */
export const ClaudeNodeView = memo(function ClaudeNodeView({ id, selected }: NodeProps) {
  const node = useProject((s) => s.graph.nodes[id]) as ClaudeNode | undefined;
  const graph = useProject((s) => s.graph);
  const env = useProject((s) => s.env);
  const live = useProject((s) => s.live[id]);
  const lastRun = useProject((s) => s.lastRuns[id]);
  const hypotheses = useProject((s) => s.hypotheses);
  const shake = useProject((s) => (s.shake?.id === id ? s.shake.at : 0));
  const settled = useDebounced(graph, 250);
  const prompt = node ? previewPrompt(settled, id) : undefined;
  const now = useNow(live?.status === "running" || !!lastRun, live?.status === "running" ? 250 : 15_000);
  if (!node) return null;

  const status = statusesOf(graph, env)[id];
  const inputs = incoming(graph, id).filter((e) => !node.disabledInputs.includes(e.from));
  const ctxCount = inputs.filter((e) => e.toPort === "context").length;
  const hypEdge = inputs.find((e) => e.toPort === "hypothesis");
  const hypNode = hypEdge ? graph.nodes[hypEdge.from] : undefined;
  const hypLabel = hypNode?.kind === "hypothesis" ? (hypotheses[hypNode.blockId]?.label ?? "H?") : "—";
  const over = prompt?.report.overBudget;

  let tone: "idle" | "running" | "stale" | "over" | "failed" | "fresh" = "idle";
  let line = "Not run yet";
  let fill = 0;
  if (live?.status === "running") {
    tone = "running";
    line = `Running · ${Math.round((now - live.startedAt) / 1000)}s`;
  } else if (live?.status === "failed") {
    tone = "failed";
    line = `Failed · ${live.error ?? "error"}`;
    fill = 1;
  } else if (over) {
    tone = "over";
    line = `Context ${formatTokens(prompt!.report.demand)} / ${formatTokens(node.budget)}`;
    fill = 1;
  } else if (status === "stale") {
    tone = "stale";
    line = "Inputs changed · rerun";
    fill = 1;
  } else if (status === "stale_env") {
    tone = "stale";
    line = "Rules changed · rerun";
    fill = 1;
  } else if (status === "fresh" && lastRun) {
    tone = "fresh";
    const secs = lastRun.endedAt ? Math.round((Date.parse(lastRun.endedAt) - Date.parse(lastRun.startedAt)) / 1000) : 0;
    line = `Ran ${ago(lastRun.endedAt ?? lastRun.startedAt, now)} · ${secs}s`;
    fill = 1;
  }

  return (
    <div className={cx(styles.node, own.claude, own[tone], selected && styles.selected, shake && styles.shake)} key={shake}>
      <div className={styles.header}>
        <span className={styles.glyph} style={{ background: "rgba(237, 235, 227, 0.12)" }}>
          <img src={glyph} alt="" width={12} height={12} />
        </span>
        <span className={styles.title}>{node.title}</span>
        <span className={styles.tag}>Claude</span>
      </div>
      <div className={styles.body}>
        <div className={styles.row}>
          <span className={styles.key}>in · context</span>
          <span className={cx(styles.val, over && own.overText)}>
            {ctxCount} {ctxCount === 1 ? "node" : "nodes"}
            {prompt ? ` · ${formatTokens(prompt.report.total)} tok` : ""}
          </span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>in · hypothesis</span>
          <span className={styles.val}>{hypLabel}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>memory</span>
          <span className={styles.val}>project + phase rules</span>
        </div>
        <div className={styles.row}>
          <span className={styles.key}>mode</span>
          <span className={styles.val}>{MODE[node.recipe] ?? node.recipe}</span>
        </div>
      </div>
      <div className={styles.runbar}>
        <div className={styles.runline}>
          <span className={own.line}>{line}</span>
          <span>⌘↵</span>
        </div>
        <div className={styles.progress}>
          {tone === "running" ? (
            <span className={cx(styles.fill, styles.indeterminate, own.fill)} />
          ) : (
            <span className={cx(styles.fill, own.fill)} style={{ width: `${fill * 100}%` }} />
          )}
        </div>
      </div>
      <Port nodeId={id} port="context" type="context" side="in" top={62} />
      <Port nodeId={id} port="hypothesis" type="hypothesis" side="in" top={82} />
      <Port nodeId={id} port="out" type="text" side="out" top={14} />
    </div>
  );
});
