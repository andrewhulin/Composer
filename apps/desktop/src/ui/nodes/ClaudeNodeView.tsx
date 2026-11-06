import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import type { ClaudeNode } from "@composer/core";
import { MODEL_LABEL, ZERO_USAGE, costOf, effectiveRoute, formatUsd, incoming, isModelId, totalTokens } from "@composer/engine";
import { useProject, statusesOf, previewPrompt } from "../../store/project";
import { useRouter } from "../../store/router";
import { useDisplayGraph, usePlaybackActive } from "../../store/display";
import { useDebounced } from "../../hooks/useDebounced";
import { ago, useNow } from "../../hooks/useNow";
import { formatTokens } from "../primitives/format";
import { cx } from "../primitives/cx";
import { Port } from "./Port";
import { Icon } from "../primitives/Icon";
import { ClaudeGlyph } from "../primitives/glyphs";
import { Kbd } from "../primitives/Kbd";
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

const short = (m: string) => (isModelId(m) ? MODEL_LABEL[m].replace(" 5.5", "") : m);

/** The model the next run uses, or the one running now, and where that choice came from. */
function modelLine(node: ClaudeNode, table: Parameters<typeof effectiveRoute>[0], live?: { status: string; model?: string; advisor?: boolean; escalatedFrom?: string }): string {
  if (live?.status === "running" && live.model) return `${MODEL_LABEL[live.model as keyof typeof MODEL_LABEL] ?? live.model}${live.advisor ? " + advisor" : ""}${live.escalatedFrom ? " · moved up" : ""}`;
  const r = effectiveRoute(table, node);
  const how = r.source === "pinned" ? " · pinned" : r.source === "escalated" ? " · escalated" : "";
  return `${MODEL_LABEL[r.model]}${r.advisor ? " + advisor" : ""}${how}`;
}

/** What the last run used: the model that finished it, advisor consultations, tokens and cost. */
function runLine(run: { model: string; advisor: unknown[] | null; usage: Record<string, number> | null; cost: number | null; escalatedFrom: string | null }): string {
  const parts = [run.escalatedFrom ? `${short(run.escalatedFrom)}→${short(run.model)}` : short(run.model)];
  if (run.advisor?.length) parts.push(`advised ${run.advisor.length}×`);
  if (run.usage) parts.push(`${formatTokens(totalTokens(run.usage))} tok`);
  // Runs from before routing stored no cost; their usage prices them the same way.
  const cost = run.cost ?? (run.usage ? costOf(run.model, { ...ZERO_USAGE, ...run.usage }) : null);
  if (cost !== null) parts.push(formatUsd(cost));
  return parts.join(" · ");
}

/** Node/Claude: one prompt step, with its run state on the bar (idle, running, stale, over budget). */
export const ClaudeNodeView = memo(function ClaudeNodeView({ id, selected }: NodeProps) {
  const graph = useDisplayGraph();
  const playing = usePlaybackActive();
  const node = graph.nodes[id] as ClaudeNode | undefined;
  const env = useProject((s) => s.env);
  const liveRun = useProject((s) => s.live[id]);
  const live = playing ? undefined : liveRun;
  const previewed = useProject((s) => !playing && !!s.preview?.stale.includes(id));
  const lastRun = useProject((s) => s.lastRuns[id]);
  const table = useRouter((s) => s.table);
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

  let tone: "idle" | "running" | "stale" | "env" | "over" | "failed" | "fresh" = "idle";
  let line = "Not run yet";
  let fill = 0;
  if (live?.status === "running") {
    tone = "running";
    line = `Running · ${Math.round((now - live.startedAt) / 1000)}s`;
  } else if (live?.status === "failed") {
    tone = "failed";
    line = `Failed · ${live.error ?? "error"}`;
    fill = 1;
  } else if (previewed) {
    tone = "stale";
    line = "Would rerun after the swap";
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
    // Softer than stale: inputs are the same; only the foundations, learned rules or routing moved.
    tone = "env";
    line = "Foundations, rules or routing changed";
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
        <span className={cx(styles.glyph, own.glyph)}>
          <Icon icon={ClaudeGlyph} size="sm" />
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
          <span className={styles.key}>model</span>
          <span className={styles.val}>{modelLine(node, table, live)}</span>
        </div>
        {lastRun?.status === "succeeded" && !live && (
          <div className={styles.row}>
            <span className={styles.key}>last run</span>
            <span className={styles.val}>{runLine(lastRun)}</span>
          </div>
        )}
        <div className={styles.row}>
          <span className={styles.key}>mode</span>
          <span className={styles.val}>{MODE[node.recipe] ?? node.recipe}</span>
        </div>
      </div>
      <div className={styles.runbar}>
        <div className={styles.runline}>
          <span className={own.line}>{line}</span>
          <Kbd>⌘↵</Kbd>
        </div>
        <div className={styles.progress}>
          {tone === "running" ? (
            <span className={cx(styles.fill, styles.indeterminate, own.fill)} />
          ) : (
            <span className={cx(styles.fill, own.fill)} style={{ width: `${fill * 100}%` }} />
          )}
        </div>
      </div>
      <Port nodeId={id} port="context" type="context" side="in" top={64} />
      <Port nodeId={id} port="hypothesis" type="hypothesis" side="in" top={89} />
      <Port nodeId={id} port="out" type="text" side="out" top={18} />
    </div>
  );
});
