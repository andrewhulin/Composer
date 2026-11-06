import { useEffect, useState, type ReactNode } from "react";
import { Check, RotateCcw, TriangleAlert } from "lucide-react";
import type { TextArtifact } from "@composer/core";
import { MODEL_IDS, MODEL_LABEL, OPUS, TASKS, TASK_LABEL, formatUsd, isModelId, routeFor, type Budget, type Route } from "@composer/engine";
import { formatTokens } from "../primitives/format";
import { useProject } from "../../store/project";
import { canKeep, discardDraft, discardProposal, keepRouter, proposeRouter, replayOutputs, runRouterReplay, setBudget, setDraftRoute, useRouter, type RouterReplayCase } from "../../store/router";
import { Badge, Button, Input, Select, Toggle, cx } from "../primitives";
import styles from "./Router.module.css";

const label = (m: string) => (isModelId(m) ? MODEL_LABEL[m] : m);
const routeText = (r: Route) => `${label(r.model)}${r.advisor ? " + advisor" : ""}`;

/**
 * Settings → Model and API: which model runs each step, the budgets runs are held to, and what
 * this project has spent. A change to a step's model replays past briefs before it goes live.
 */
export function RouterSection({ Group }: { Group: (p: { title: string; note?: ReactNode; children?: ReactNode }) => ReactNode }) {
  return (
    <>
      <Group
        title="Routing"
        note="Opus 5.5 keeps every call that decides. Drafts and generation run on Sonnet 5.5 or Haiku 5.5, which consult Opus through the advisor tool. Opus returns its advice encrypted, so a run shows that it consulted, not what was said. Each node can pin its own model on its Node tab."
      >
        <RouterTable />
      </Group>
      <Group title="Budgets" note="Composer asks before a run that would go over one of these. Leave a field empty for no limit.">
        <Budgets />
      </Group>
      <Group title="This project's spend" note="Every run's tokens at list prices, including retries and escalations. Advisor tokens bill at Opus rates and aren't counted here yet.">
        <SpendFacts />
      </Group>
    </>
  );
}

function RouterTable() {
  const { table, draft, row, proposal } = useRouter();
  const shown = draft ?? table;
  return (
    <div className={styles.router}>
      <div className={styles.version}>
        <span className={styles.mono}>{row ? `Router ${row.version}` : "Default routing"}</span>
        {row && <span className={styles.muted}>kept {new Date(row.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Model</th>
            <th scope="col">Advisor</th>
            <th scope="col" aria-label="Change" />
          </tr>
        </thead>
        <tbody>
          {TASKS.map((task) => {
            const r = routeFor(shown, task);
            const live = routeFor(table, task);
            const changed = r.model !== live.model || r.advisor !== live.advisor;
            return (
              <tr key={task} className={cx(changed && styles.changed)}>
                <th scope="row" className={styles.step}>
                  {TASK_LABEL[task]}
                </th>
                <td>
                  <Select size="sm" aria-label={`Model for ${TASK_LABEL[task]}`} value={r.model} onChange={(e) => setDraftRoute(task, { model: e.target.value as Route["model"], advisor: e.target.value === OPUS ? false : r.advisor || live.model === OPUS })}>
                    {MODEL_IDS.map((m) => (
                      <option key={m} value={m}>
                        {MODEL_LABEL[m]}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>{r.model === OPUS ? <span className={styles.muted}>Not needed</span> : <Toggle label={`Advisor for ${TASK_LABEL[task]}`} on={r.advisor} onChange={() => setDraftRoute(task, { ...r, advisor: !r.advisor })} />}</td>
                <td className={styles.was}>{changed ? `was ${routeText(live)}` : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {draft && (
        <div className={styles.actions}>
          <Button variant="tint" size="sm" onClick={() => void proposeRouter()}>
            Replay and propose
          </Button>
          <Button variant="ghost" size="sm" onClick={discardDraft}>
            Discard changes
          </Button>
          <span className={styles.muted}>Steps that run on briefs replay up to 3 scored briefs each on the new model, and Opus scores old and new outputs blind.</span>
        </div>
      )}
      {proposal && !draft && <RouterReplay />}
    </div>
  );
}

function RouterReplay() {
  const { proposal: p, replay } = useRouter();
  if (!p) return null;
  const keepable = canKeep(p, replay);
  const recipesChanged = p.diff.tasks.some((t) => !["compile", "review", "reflect", "judge"].includes(t));
  return (
    <section className={styles.replay} aria-label="Router change">
      <header className={styles.replayHead}>
        <span className="caps">Proposed router {p.diff.version}</span>
        <span className={styles.grow} />
        {replay?.running ? (
          <Badge tone="muted">{`Replaying ${replay.summary.done + replay.summary.errors}/${replay.summary.briefs}…`}</Badge>
        ) : !recipesChanged ? (
          <Badge tone="live" icon={Check}>
            Nothing to replay
          </Badge>
        ) : replay?.summary.passes ? (
          <Badge tone="live" icon={Check}>
            Holds the score
          </Badge>
        ) : (
          <Badge tone="warn" icon={TriangleAlert}>
            {replay?.summary.briefs ? "Doesn't pass yet" : "No briefs yet"}
          </Badge>
        )}
      </header>
      <p className={styles.rationale}>{p.rationale}</p>
      {recipesChanged ? (
        <p className={cx(styles.summary, replay?.summary.passes && styles.pass)}>{replay?.summary.line ?? "Not replayed yet"}</p>
      ) : (
        <p className={styles.summary}>Only craft jobs change. They don't run on stored briefs, so there's no golden set to replay.</p>
      )}
      {!!replay?.cases.length && (
        <ul className={styles.cases}>
          {replay.cases.map((c) => (
            <ReplayCase key={c.caseId} c={c} />
          ))}
        </ul>
      )}
      {recipesChanged && !replay?.running && !keepable && (
        <p className={styles.muted}>
          {replay?.summary.briefs
            ? "A change goes live only when every brief replays and the judged score drops by no more than 0.25."
            : "Score a few runs of these steps first, so there are briefs to replay."}
        </p>
      )}
      <div className={styles.actions}>
        <Button variant="phase" size="sm" disabled={!keepable} onClick={() => void keepRouter()}>
          Keep {p.diff.version}
        </Button>
        {recipesChanged && (
          <Button variant="secondary" size="sm" icon={RotateCcw} disabled={replay?.running} onClick={() => void runRouterReplay(p)}>
            Replay again
          </Button>
        )}
        <Button variant="ghost" size="sm" disabled={replay?.running} onClick={() => void discardProposal()}>
          Discard
        </Button>
      </div>
    </section>
  );
}

function ReplayCase({ c }: { c: RouterReplayCase }) {
  const [open, setOpen] = useState(false);
  const [outputs, setOutputs] = useState<{ baseline?: TextArtifact; candidate?: TextArtifact } | null>(null);
  useEffect(() => {
    if (open && !outputs) void replayOutputs(c).then(setOutputs);
  }, [open, outputs, c]);
  return (
    <li className={styles.case}>
      <div className={styles.caseHead}>
        <span className={styles.caseName}>{c.name}</span>
        <span className={styles.mono}>
          {label(c.from)} → {routeText(c.to)}
        </span>
      </div>
      {c.status === "pending" && <span className={styles.muted}>Replaying…</span>}
      {c.status === "error" && <span className={styles.error}>{c.error}</span>}
      {c.status === "done" && (
        <>
          <dl className={styles.deltas}>
            <dt>Score</dt>
            <dd>
              {c.baselineScore} → {c.candidateScore}
            </dd>
            <dt>Cost</dt>
            <dd>
              {c.baselineCost !== null ? formatUsd(c.baselineCost) : "—"} → {c.candidateCost !== null ? formatUsd(c.candidateCost) : "—"}
            </dd>
            <dt>Advisor</dt>
            <dd>{c.to.advisor ? `consulted ${c.consulted ?? 0}×` : "off"}</dd>
          </dl>
          {c.reasons && (
            <p className={styles.reasons}>
              <span>Before: {c.reasons.baseline}</span>
              <span>After: {c.reasons.candidate}</span>
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
            {open ? "Hide outputs" : "Show outputs"}
          </Button>
          {open && (
            <div className={styles.sides}>
              <Side title={`As it ran · ${label(c.from)}`} art={outputs?.baseline} />
              <Side title={`Replayed · ${routeText(c.to)}`} art={outputs?.candidate} />
            </div>
          )}
        </>
      )}
    </li>
  );
}

function Side({ title, art }: { title: string; art?: TextArtifact | undefined }) {
  return (
    <div className={styles.side}>
      <span className={styles.sideTitle}>{title}</span>
      <pre className={styles.text}>{art ? (art.text.length > 1600 ? `${art.text.slice(0, 1600)}…` : art.text) : "Loading…"}</pre>
    </div>
  );
}

const FIELDS: { key: keyof Budget; label: string; unit: "usd" | "tokens" }[] = [
  { key: "perRunUsd", label: "Per run, dollars", unit: "usd" },
  { key: "perRunTokens", label: "Per run, prompt tokens", unit: "tokens" },
  { key: "perProjectUsd", label: "Per project, dollars", unit: "usd" },
  { key: "perProjectTokens", label: "Per project, tokens", unit: "tokens" },
];

function Budgets() {
  const budget = useRouter((s) => s.budget);
  const ready = useRouter((s) => s.ready);
  if (!ready) return null;
  const save = (key: keyof Budget, raw: string) => {
    const n = Number.parseFloat(raw.replace(/[$,\s]/g, ""));
    const value = raw.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : n;
    if (value !== budget[key]) void setBudget({ ...budget, [key]: value });
  };
  return (
    <div className={styles.budgets}>
      {FIELDS.map((f) => (
        <label key={f.key} className={styles.budgetField}>
          <span>{f.label}</span>
          <Input
            size="sm"
            mono
            inputMode="decimal"
            placeholder="No limit"
            defaultValue={budget[f.key] ?? ""}
            key={`${f.key}:${budget[f.key] ?? ""}`}
            onBlur={(e) => save(f.key, e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        </label>
      ))}
    </div>
  );
}

function SpendFacts() {
  const spend = useProject((s) => s.spend);
  const project = useProject((s) => s.project);
  const perProject = useRouter((s) => s.budget.perProjectUsd);
  if (!project) return <p className={styles.muted}>Open a project to see what it has spent.</p>;
  if (!spend?.runs) return <p className={styles.muted}>No runs in {project.name} yet.</p>;
  return (
    <dl className={styles.spend}>
      <dt>Spent</dt>
      <dd>
        {formatUsd(spend.usd)}
        {perProject !== null && <span className={styles.muted}> of {formatUsd(perProject)}</span>} · {spend.runs} run{spend.runs === 1 ? "" : "s"}
      </dd>
      <dt>Tokens</dt>
      <dd>{formatTokens(spend.tokens)}</dd>
      <dt>Cache hit rate</dt>
      <dd>{spend.cacheHitRate === null ? "—" : `${Math.round(spend.cacheHitRate * 100)}% of prompt tokens read from cache`}</dd>
      {Object.entries(spend.byModel).map(([m, v]) => (
        <div key={m} className={styles.contents}>
          <dt>{label(m)}</dt>
          <dd>
            {formatUsd(v!.usd)} · {v!.runs} run{v!.runs === 1 ? "" : "s"} · {formatTokens(v!.tokens)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
