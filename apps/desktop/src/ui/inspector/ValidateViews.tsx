import { useMemo, useState } from "react";
import type { Id, SourceContent, SourceNode } from "@composer/core";
import { METHOD_ORDER, METHODS, type Method, type StrategyData, type VerdictData } from "@composer/engine";
import { actions, postToSlack, toast, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { ingestUrl } from "../../app/ingest";
import { cx } from "../primitives/cx";
import styles from "./ValidateViews.module.css";

const KIND_TONE = { success: styles.success, guardrail: styles.guardrail, kill: styles.kill } as const;
const SESSION_NOTES = new Set(["transcript", "file", "paste", "data"]);

type Badge = { text: string; tone: "live" | "phase" | "neutral" | "muted" };

/** What's come back so far for each method, read from the evidence wired into Validate this loop. */
function useMethodBadges(on: Record<Method, boolean>): Record<Method, Badge> {
  const graph = useProject((s) => s.graph);
  const loop = useProject((s) => s.loop);
  const blobs = useProject((s) => s.blobs);
  return useMemo(() => {
    const sources = Object.values(graph.nodes).filter((n): n is SourceNode => n.kind === "source" && n.phase === "validate" && n.loop === loop);
    const items = (n: SourceNode) => (n.contentHash ? ((blobs.get(n.contentHash) as SourceContent | undefined)?.items ?? []) : []);
    const replies = sources.filter((n) => n.platform === "slack").reduce((sum, n) => sum + items(n).reduce((k, i) => k + Math.max(0, i.units.length - 1), 0), 0);
    const sessions = sources.filter((n) => SESSION_NOTES.has(n.platform)).length;
    const results = sources.some((n) => n.platform === "statsig");
    const off: Badge = { text: "off", tone: "muted" };
    return {
      slack: !on.slack ? off : replies ? { text: `${replies} ${replies === 1 ? "reply" : "replies"}`, tone: "live" } : { text: "ready", tone: "phase" },
      "360": !on["360"] ? off : sessions ? { text: `${sessions} ${sessions === 1 ? "session" : "sessions"}`, tone: "live" } : { text: "scheduled", tone: "phase" },
      statsig: !on.statsig ? off : results ? { text: "results in", tone: "live" } : { text: "draft", tone: "neutral" },
      survey: !on.survey ? off : { text: "planned", tone: "phase" },
    };
  }, [graph, loop, blobs, on]);
}

/** Figma 07 · Validate: metrics tied to the hypothesis, then the methods that can prove it. */
export function StrategyView({ data }: { data: StrategyData }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [experiment, setExperiment] = useState("");
  const slack = data.methods.find((m) => m.method === "slack");
  const on = useMemo(() => Object.fromEntries(METHOD_ORDER.map((k) => [k, !!data.methods.find((m) => m.method === k)?.use])) as Record<Method, boolean>, [data]);
  const badges = useMethodBadges(on);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.view}>
      <div className={styles.metrics}>
        {data.metrics.map((m, i) => (
          <p key={i}>
            <span className={cx(styles.kind, KIND_TONE[m.kind])}>{m.kind}</span>
            {m.text}
          </p>
        ))}
      </div>
      <span className={styles.methodsLabel}>Methods</span>
      {METHOD_ORDER.map((key) => {
        const m = data.methods.find((x) => x.method === key);
        const use = on[key];
        const badge = badges[key];
        return (
          <div key={key} className={styles.method}>
            <div className={styles.methodHead}>
              {/* Claude's plan, not a control: the strategy is an output, so changing it means rerunning. */}
              <span className={cx(styles.switch, use && styles.switchOn)} aria-label={use ? "In the plan" : "Not in the plan"} />
              <div className={styles.methodText}>
                <span className={styles.methodName}>{METHODS[key]}</span>
                <span className={styles.plan}>{m?.plan ?? "not needed for this hypothesis"}</span>
              </div>
              <span className={cx(styles.badge, styles[badge.tone])}>{badge.text}</span>
            </div>
            {use && key === "slack" && (
              <button
                type="button"
                className={styles.action}
                disabled={busy === "slack"}
                onClick={() =>
                  void run("slack", () =>
                    postToSlack([`*Feedback wanted:* ${data.metrics.find((x) => x.kind === "success")?.text ?? ""}`, ...(slack?.questions ?? []).map((q, i) => `${i + 1}. ${q}`)].join("\n")),
                  )
                }
              >
                {busy === "slack" ? "Posting…" : `Post ${slack?.questions.length ?? 0} questions to Slack`}
              </button>
            )}
            {use && key === "360" && (
              <button type="button" className={styles.action} onClick={() => useUi.getState().setAddMenuOpen(true)}>
                Add session notes or transcripts
              </button>
            )}
            {use && key === "statsig" && (
              <form
                className={styles.inline}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (experiment.trim()) void run("statsig", async () => actions.addSource(await ingestUrl(experiment.trim())));
                }}
              >
                <input placeholder="Statsig experiment link" value={experiment} onChange={(e) => setExperiment(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                <button type="submit" className={styles.action} disabled={busy === "statsig"}>
                  Pull results
                </button>
              </form>
            )}
          </div>
        );
      })}
      <p className={styles.rule}>{data.decision_rule}</p>
    </div>
  );
}

/** The verdict, metric by metric, and the designer's call: holds → Share, misses → back to Understand. */
export function VerdictView({ data, outputId }: { data: VerdictData; outputId?: Id }) {
  return (
    <div className={styles.view}>
      <div className={cx(styles.verdict, styles[`v_${data.verdict}`])}>
        <span className={styles.verdictWord}>{data.verdict === "holds" ? "Holds" : data.verdict === "misses" ? "Misses" : "Inconclusive"}</span>
        <p>{data.summary}</p>
      </div>
      <div className={styles.metrics}>
        {data.metrics.map((m, i) => (
          <p key={i}>
            <span className={cx(styles.kind, KIND_TONE[m.kind])}>{m.kind}</span>
            <span className={styles.metricText}>{m.text}</span>
            <span className={cx(styles.met, m.met === "yes" ? styles.yes : m.met === "no" ? styles.no : styles.unknown)}>
              {m.met === "yes" ? "✓" : m.met === "no" ? "✕" : "?"} {m.observed}
            </span>
          </p>
        ))}
      </div>
      {data.findings.length > 0 && (
        <div className={styles.findings}>
          {data.findings.map((f, i) => (
            <p key={i}>
              {f.text} <span>· {f.source}</span>
            </p>
          ))}
        </div>
      )}
      <p className={styles.rule}>Next: {data.next}</p>
      {outputId && (
        <div className={styles.calls}>
          <button type="button" className={styles.holds} onClick={() => void actions.lock(outputId, "holds")}>
            Metric holds → Share
          </button>
          <button type="button" className={styles.misses} onClick={() => void actions.lock(outputId, "misses")}>
            ↺ Misses → back to Understand
          </button>
        </div>
      )}
    </div>
  );
}
