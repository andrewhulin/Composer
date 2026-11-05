import { useMemo, useState } from "react";
import type { ClaudeNode, SourceContent, SourceNode, SourcePlatform, TextArtifact } from "@composer/core";
import { METHOD_ORDER, METHODS, statementForm, type Method, type StatementData, type StrategyData, type VerdictData } from "@composer/engine";
import { actions, postToSlack, toast, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { ingestUrl } from "../../app/ingest";
import { cx } from "../primitives/cx";
import { StatementForm } from "./StatementForm";
import { useKey } from "./useKey";
import styles from "./Workspace.module.css";

/** Which evidence lands in which lane. */
const LANE_PLATFORMS: Record<Method, SourcePlatform[]> = {
  slack: ["slack"],
  "360": ["transcript", "file", "paste", "data"],
  statsig: ["statsig"],
  survey: ["findings", "link", "request"],
};

const MET = { yes: "met", no: "not met", unknown: "unknown" } as const;

/**
 * Validate as a scorecard: the locked statement pinned on top, the metrics with their targets,
 * one lane per source of evidence, and the verdict, which is the designer's call.
 */
export function ValidateWorkspace() {
  const key = useKey("validate");
  const graph = useProject((s) => s.graph);
  const loop = useProject((s) => s.loop);
  const versions = useProject((s) => s.versions);
  const blobs = useProject((s) => s.blobs);
  const live = useProject((s) => s.live);
  const [busy, setBusy] = useState<string | null>(null);
  const [experiment, setExperiment] = useState("");

  const claudes = Object.values(graph.nodes).filter((n): n is ClaudeNode => n.kind === "claude" && n.phase === "validate" && n.loop === loop);
  const strategyNode = claudes.find((n) => n.recipe === "test_strategy");
  const verdictNode = claudes.find((n) => n.recipe === "verdict");
  const artifactOf = (n?: ClaudeNode) => (n && graph.outputs[n.id] ? (blobs.get(graph.outputs[n.id]!.hash) as TextArtifact | undefined) : undefined);
  const strategy = artifactOf(strategyNode)?.data as StrategyData | undefined;
  const verdict = artifactOf(verdictNode)?.data as VerdictData | undefined;

  const statement = useMemo(() => {
    const v = Object.values(versions)
      .filter((x) => x.phase === "define" && x.loop === loop)
      .sort((a, b) => b.version - a.version)[0];
    const d = v ? ((blobs.get(v.contentHash) as TextArtifact | undefined)?.data as StatementData | undefined) : undefined;
    return d ? { form: statementForm(d), version: v!.version } : undefined;
  }, [versions, blobs, loop]);

  const sources = Object.values(graph.nodes).filter((n): n is SourceNode => n.kind === "source" && n.phase === "validate" && n.loop === loop);
  const itemsOf = (n: SourceNode) => (n.contentHash ? ((blobs.get(n.contentHash) as SourceContent | undefined)?.items ?? []) : []);

  const run = async (k: string, fn: () => Promise<unknown>) => {
    setBusy(k);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const observed = (i: number, text: string) => verdict?.metrics.find((m) => m.text === text) ?? verdict?.metrics[i];
  const running = (n?: ClaudeNode) => !!n && live[n.id]?.status === "running";
  const output = key?.output;
  const readOnly = output ? output.loop !== loop : true;

  return (
    <div className={styles.validate}>
      <section className={styles.pinned} aria-label="Statement under test">
        <span className="caps">{statement ? `Under test · statement v${statement.version}` : "Under test"}</span>
        {statement ? <StatementForm form={statement.form} readOnly size="pinned" /> : <p className={styles.railEmpty}>Lock a statement in Define first.</p>}
      </section>

      <section className={styles.scorecard} aria-label="Metrics">
        <div className={styles.sectionHead}>
          <span className="caps">Metrics</span>
          <span className={styles.fill} />
          {strategyNode && !readOnly && (
            <button type="button" className={styles.secondary} disabled={running(strategyNode)} onClick={() => actions.run(strategyNode.id)}>
              {running(strategyNode) ? "Writing…" : strategy ? "Rewrite strategy" : "Write the strategy"}
            </button>
          )}
        </div>
        {strategy ? (
          <table className={styles.metrics}>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Metric</th>
                <th>Target</th>
                <th>Observed</th>
                <th>Met</th>
              </tr>
            </thead>
            <tbody>
              {strategy.metrics.map((m, i) => {
                const o = observed(i, m.text);
                return (
                  <tr key={i}>
                    <td>
                      <span className={cx(styles.kind, styles[`k_${m.kind}`])}>{m.kind}</span>
                    </td>
                    <td>{m.text}</td>
                    <td className={styles.mono}>{m.target ?? "–"}</td>
                    <td className={styles.mono}>{o?.observed ?? "–"}</td>
                    <td>
                      <span className={cx(styles.met, o ? styles[`m_${o.met}`] : styles.m_unknown)}>{o ? MET[o.met] : "pending"}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className={styles.railEmpty}>Claude writes success, guardrail and kill metrics from the statement, each with the target that decides it.</p>
        )}
        {strategy && <p className={styles.rule}>{strategy.decision_rule}</p>}
      </section>

      <section className={styles.lanes} aria-label="Evidence lanes">
        {METHOD_ORDER.map((method) => {
          const m = strategy?.methods.find((x) => x.method === method);
          const evidence = sources.filter((s) => LANE_PLATFORMS[method].includes(s.platform));
          const off = strategy && !m?.use;
          return (
            <div key={method} className={cx(styles.lane, off && styles.laneOff)}>
              <div className={styles.laneHead}>
                <span className={styles.laneName}>{METHODS[method]}</span>
                <span className={styles.laneCount}>{off ? "off" : `${evidence.length} in`}</span>
              </div>
              {m && <p className={styles.lanePlan}>{m.plan}</p>}
              {m?.use && m.questions.length > 0 && (
                <ol className={styles.questions}>
                  {m.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ol>
              )}
              {!readOnly && m?.use && method === "slack" && (
                <button
                  type="button"
                  className={styles.laneAction}
                  disabled={busy === "slack"}
                  onClick={() => void run("slack", () => postToSlack([`*Feedback wanted:* ${strategy?.metrics.find((x) => x.kind === "success")?.text ?? ""}`, ...m.questions.map((q, i) => `${i + 1}. ${q}`)].join("\n")))}
                >
                  {busy === "slack" ? "Posting…" : `Post ${m.questions.length} questions to Slack`}
                </button>
              )}
              {!readOnly && m?.use && (method === "360" || method === "survey") && (
                <button type="button" className={styles.laneAction} onClick={() => useUi.getState().setAddMenuOpen(true)}>
                  Add {method === "360" ? "session notes or transcripts" : "survey results"}
                </button>
              )}
              {!readOnly && m?.use && method === "statsig" && (
                <form
                  className={styles.inline}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (experiment.trim()) void run("statsig", async () => actions.addSource(await ingestUrl(experiment.trim())));
                  }}
                >
                  <input placeholder="Statsig experiment link" value={experiment} onChange={(e) => setExperiment(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
                  <button type="submit" className={styles.laneAction} disabled={busy === "statsig"}>
                    Pull
                  </button>
                </form>
              )}
              {evidence.map((s) => {
                const first = itemsOf(s)[0]?.units[0]?.text;
                return (
                  <button key={s.id} type="button" className={styles.evidenceCard} onClick={() => actions.select(s.id)}>
                    <span className={styles.citeLabel}>{s.title}</span>
                    {first && <span className={styles.citeText}>{first.slice(0, 140)}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </section>

      <section className={cx(styles.verdictBar, verdict && styles[`v_${verdict.verdict}`])} aria-label="Verdict">
        <div className={styles.verdictText}>
          <span className="caps">Verdict</span>
          {verdict ? (
            <>
              <span className={styles.verdictWord}>{verdict.verdict === "holds" ? "Holds" : verdict.verdict === "misses" ? "Misses" : "Inconclusive"}</span>
              <p>{verdict.summary}</p>
            </>
          ) : (
            <p>Claude reads the evidence against each target. The call is yours.</p>
          )}
        </div>
        {!readOnly && verdictNode && (
          <button type="button" className={styles.secondary} disabled={running(verdictNode)} onClick={() => actions.run(verdictNode.id)}>
            {running(verdictNode) ? "Reading…" : verdict ? "Read again" : "Read the evidence"}
          </button>
        )}
        {!readOnly && output && verdict && (
          <>
            <button type="button" className={styles.holds} onClick={() => void actions.lock(output.id, "holds")}>
              Holds → Share
            </button>
            <button type="button" className={styles.misses} onClick={() => void actions.lock(output.id, "misses")}>
              ↺ Misses → Understand
            </button>
          </>
        )}
      </section>
    </div>
  );
}
