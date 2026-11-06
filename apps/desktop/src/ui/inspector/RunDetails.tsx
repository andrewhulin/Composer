import type { RunRow } from "@composer/data";
import { MODEL_LABEL, cacheHitRate, costOf, formatUsd, isModelId } from "@composer/engine";
import { formatTokens } from "../primitives/format";
import styles from "./RunDetails.module.css";

const label = (m: string) => (isModelId(m) ? MODEL_LABEL[m] : m);

const CONSULTATION: Record<string, string> = {
  redacted: "Opus 5.5 advised · its advice is encrypted, so only the fact of it shows",
  text: "Opus 5.5 advised",
};

/** What the last run used: which model finished it, the advisor's consultations, tokens and cost. */
export function RunDetails({ run }: { run: RunRow }) {
  const u = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ...run.usage };
  const rate = cacheHitRate(u);
  return (
    <section className={styles.details} aria-label="Run details">
      <span className="caps">Run</span>
      <dl className={styles.facts}>
        <dt>Model</dt>
        <dd>
          {label(run.model)}
          {run.escalatedFrom && <span className={styles.moved}> · moved up from {label(run.escalatedFrom)}</span>}
        </dd>
        <dt>Advisor</dt>
        <dd>{run.advisor?.length ? `${run.advisor.length} consultation${run.advisor.length === 1 ? "" : "s"}` : isModelId(run.model) && run.model.includes("opus") ? "Not needed on Opus" : "Not consulted"}</dd>
        <dt>Tokens</dt>
        <dd>
          {formatTokens(u.input + u.cacheRead + u.cacheWrite)} in · {formatTokens(u.output)} out
        </dd>
        <dt>Cache</dt>
        <dd>{rate === null ? "—" : `${Math.round(rate * 100)}% read · ${formatTokens(u.cacheWrite)} written`}</dd>
        <dt>Cost</dt>
        <dd>{formatUsd(run.cost ?? costOf(run.model, u))}</dd>
      </dl>
      {!!run.advisor?.length && (
        <ol className={styles.consultations}>
          {run.advisor.map((c, i) => (
            <li key={i} className={c.kind === "error" ? styles.error : undefined}>
              {c.kind === "error" ? `Advisor unavailable · ${c.errorCode ?? "error"}` : (CONSULTATION[c.kind] ?? c.kind)}
              {c.kind === "text" && c.text && <q className={styles.advice}>{c.text}</q>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
