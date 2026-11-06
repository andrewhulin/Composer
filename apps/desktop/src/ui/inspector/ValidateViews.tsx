import { useMemo, useState } from "react";
import type { Id, SourceContent, SourceNode } from "@composer/core";
import { METHOD_ORDER, METHODS, type Method, type StrategyData, type VerdictData } from "@composer/engine";
import { actions, postToSlack, toast, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { ingestUrl } from "../../app/ingest";
import { Check, CircleHelp, RotateCcw, X } from "lucide-react";
import { Badge, Button, Icon, Input } from "../primitives";
import { cx } from "../primitives/cx";
import styles from "./ValidateViews.module.css";

const KIND_TONE = { success: "phase", guardrail: "warn", kill: "neutral" } as const;
const SESSION_NOTES = new Set(["transcript", "file", "paste", "data"]);

type MethodBadge = { text: string; tone: "live" | "phase" | "neutral" | "muted" };

/** What's come back so far for each method, read from the evidence wired into Validate this loop. */
function useMethodBadges(on: Record<Method, boolean>): Record<Method, MethodBadge> {
  const graph = useProject((s) => s.graph);
  const loop = useProject((s) => s.loop);
  const blobs = useProject((s) => s.blobs);
  return useMemo(() => {
    const sources = Object.values(graph.nodes).filter((n): n is SourceNode => n.kind === "source" && n.phase === "validate" && n.loop === loop);
    const items = (n: SourceNode) => (n.contentHash ? ((blobs.get(n.contentHash) as SourceContent | undefined)?.items ?? []) : []);
    const replies = sources.filter((n) => n.platform === "slack").reduce((sum, n) => sum + items(n).reduce((k, i) => k + Math.max(0, i.units.length - 1), 0), 0);
    const sessions = sources.filter((n) => SESSION_NOTES.has(n.platform)).length;
    const results = sources.some((n) => n.platform === "statsig");
    const off: MethodBadge = { text: "off", tone: "muted" };
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
    <div className={styles.view} data-phase="validate">
      <div className={styles.metrics}>
        {data.metrics.map((m, i) => (
          <p key={i}>
            <Badge tone={KIND_TONE[m.kind]} mono>
              {m.kind}
            </Badge>
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
              <Badge tone={badge.tone} mono>
                {badge.text}
              </Badge>
            </div>
            {use && key === "slack" && (
              <Button
                variant="secondary"
                size="sm"
                className={styles.action}
                disabled={busy === "slack"}
                onClick={() =>
                  void run("slack", () =>
                    postToSlack([`*Feedback wanted:* ${data.metrics.find((x) => x.kind === "success")?.text ?? ""}`, ...(slack?.questions ?? []).map((q, i) => `${i + 1}. ${q}`)].join("\n")),
                  )
                }
              >
                {busy === "slack" ? "Posting…" : `Post ${slack?.questions.length ?? 0} questions to Slack`}
              </Button>
            )}
            {use && key === "360" && (
              <Button variant="secondary" size="sm" className={styles.action} onClick={() => useUi.getState().setAddMenuOpen(true)}>
                Add session notes or transcripts
              </Button>
            )}
            {use && key === "statsig" && (
              <form
                className={styles.inline}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (experiment.trim()) void run("statsig", async () => actions.addSource(await ingestUrl(experiment.trim())));
                }}
              >
                <Input size="sm" mono className={styles.inlineInput} placeholder="Statsig experiment link" value={experiment} onChange={(e) => setExperiment(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                <Button type="submit" variant="secondary" size="sm" disabled={busy === "statsig"}>
                  Pull results
                </Button>
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
    <div className={styles.view} data-phase="validate">
      <div className={cx(styles.verdict, styles[`v_${data.verdict}`])}>
        <span className={styles.verdictWord}>{data.verdict === "holds" ? "Holds" : data.verdict === "misses" ? "Misses" : "Inconclusive"}</span>
        <p>{data.summary}</p>
      </div>
      <div className={styles.metrics}>
        {data.metrics.map((m, i) => (
          <p key={i}>
            <Badge tone={KIND_TONE[m.kind]} mono>
              {m.kind}
            </Badge>
            <span className={styles.metricText}>{m.text}</span>
            <span className={cx(styles.met, m.met === "yes" ? styles.yes : m.met === "no" ? styles.no : styles.unknown)}>
              <Icon icon={m.met === "yes" ? Check : m.met === "no" ? X : CircleHelp} size="sm" label={m.met === "yes" ? "Met" : m.met === "no" ? "Not met" : "Unknown"} />
              {m.observed}
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
            <Icon icon={RotateCcw} size="md" className={styles.callIcon} />
            Misses → back to Understand
          </button>
        </div>
      )}
    </div>
  );
}
