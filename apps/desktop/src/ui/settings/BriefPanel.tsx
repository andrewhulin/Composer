import { useEffect, useMemo, useState } from "react";
import { Check, RotateCw, Sparkles, TriangleAlert } from "lucide-react";
import { PHASES, PHASE_INFO, type Phase } from "@composer/core";
import type { ProposalRow } from "@composer/data";
import type { BriefConflict, BriefPrinciple, CraftBrief } from "@composer/engine";
import { activeSkills, compileBrief, discardCandidate, isStale, keepBrief, proposeBrief, resolveConflict, useSkills } from "../../store/skills";
import { reject, useCraft } from "../../store/craft";
import { replayCases, useEvals } from "../../store/evals";
import { Badge, Button, Chip, Icon, Input } from "../primitives";
import { ReplayPanel } from "../foundations/ReplayPanel";
import styles from "./Skills.module.css";

/** The Craft Brief: what's live, a fresh compile with its conflicts, and the proposal that replays before it goes live. */
export function BriefPanel() {
  const brief = useSkills((s) => s.brief);
  const candidate = useSkills((s) => s.candidate);
  const compiling = useSkills((s) => s.compiling);
  const skills = useSkills((s) => s.skills);
  const overrides = useSkills((s) => s.overrides);
  const proposals = useCraft((s) => s.proposals);
  const pending = useMemo(() => proposals.find((p) => p.targetKind === "craft_brief" && p.status === "pending"), [proposals]);
  // Both read the store; this component already re-renders when skills, overrides or the brief change.
  void overrides;
  const active = activeSkills();
  const stale = isStale();
  const nameOf = (id: string) => skills.find((s) => s.id === id)?.name ?? id;

  return (
    <section className={styles.block}>
      <header className={styles.blockHead}>
        <span className="caps">Craft Brief</span>
        {brief ? <Badge tone={stale ? "warn" : "live"}>{stale ? `${brief.row.version} · stale` : `${brief.row.version} live`}</Badge> : <Badge tone="muted">Not compiled yet</Badge>}
        <span className={styles.grow} />
        <Button variant={stale || !brief ? "primary" : "secondary"} size="sm" icon={compiling ? RotateCw : Sparkles} disabled={compiling || !active.length} onClick={() => void compileBrief()}>
          {compiling ? "Compiling…" : brief ? "Recompile" : "Compile"}
        </Button>
      </header>
      <p className={styles.note}>
        Claude folds every Always-on skill ({active.length} on) into one short list of principles that rides along in every run, cached. The philosophy and the design system outrank it. Raw skill text never goes into a prompt.
        {stale && " Skills changed since this brief was compiled."}
      </p>

      {candidate && <Candidate brief={candidate} nameOf={nameOf} />}
      {pending && <PendingBrief p={pending} nameOf={nameOf} />}
      {!candidate && !pending && brief && <Principles brief={brief.content} nameOf={nameOf} />}
    </section>
  );
}

function Principles({ brief, nameOf }: { brief: CraftBrief; nameOf: (id: string) => string }) {
  const groups: [string, BriefPrinciple[]][] = [["Everywhere", brief.general], ...PHASES.flatMap((p): [string, BriefPrinciple[]][] => (brief.phases[p]?.length ? [[PHASE_INFO[p].name, brief.phases[p]!]] : []))];
  let n = 0;
  return (
    <div className={styles.principles}>
      {groups.map(([label, items]) => (
        <div key={label} className={styles.group}>
          <span className={styles.groupLabel}>{label}</span>
          <ol className={styles.principleList}>
            {items.map((p) => (
              <li key={`${label}-${p.text}`} className={styles.principle}>
                <span className={styles.num}>{String(++n).padStart(2, "0")}</span>
                <span className={styles.principleText}>{p.text}</span>
                <span className={styles.sources}>
                  {p.sources.map((s) => (
                    <Badge key={s} tone="muted" mono>
                      {nameOf(s)}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function Candidate({ brief, nameOf }: { brief: CraftBrief; nameOf: (id: string) => string }) {
  return (
    <div className={styles.candidate}>
      <div className={styles.candidateHead}>
        <strong>Fresh compile</strong>
        <span className={styles.meta}>
          {brief.general.length + PHASES.reduce((n, p) => n + (brief.phases[p]?.length ?? 0), 0)} principles · {brief.conflicts.length} to resolve · {brief.flagged.length} flagged
        </span>
        <span className={styles.grow} />
        <Button variant="ghost" size="sm" onClick={() => void discardCandidate()}>
          Discard
        </Button>
        <Button variant="primary" size="sm" disabled={!!brief.conflicts.length} onClick={() => void proposeBrief()} title={brief.conflicts.length ? "Resolve every conflict first" : undefined}>
          {brief.conflicts.length ? `Resolve ${brief.conflicts.length} first` : "Propose this brief"}
        </Button>
      </div>
      {brief.flagged.map((f) => (
        <p key={`${f.skill}-${f.principle}`} className={styles.flag}>
          <Icon icon={TriangleAlert} size="sm" />
          <span>
            <strong>{nameOf(f.skill)}</strong> contradicts philosophy {String(f.principle).padStart(2, "0")}: “{f.says}” {f.why} Left out of the brief.
          </span>
        </p>
      ))}
      {brief.conflicts.map((c) => (
        <Conflict key={c.key} c={c} nameOf={nameOf} />
      ))}
      <Principles brief={brief} nameOf={nameOf} />
    </div>
  );
}

/** Two skills disagree. Pick one, split them by phase, or keep both as a stated tradeoff. */
function Conflict({ c, nameOf }: { c: BriefConflict; nameOf: (id: string) => string }) {
  const [mode, setMode] = useState<"scope" | "both" | null>(null);
  const [a, setA] = useState<Phase[]>([]);
  const [b, setB] = useState<Phase[]>([]);
  const [note, setNote] = useState("");
  const flip = (list: Phase[], p: Phase) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]);
  return (
    <div className={styles.conflict}>
      <span className={styles.conflictTopic}>
        <Icon icon={TriangleAlert} size="sm" />
        {c.topic}
      </span>
      <div className={styles.sides}>
        <div className={styles.side}>
          <span className={styles.sideName}>{nameOf(c.a.skill)}</span>
          <p>{c.a.says}</p>
          <Button variant="secondary" size="sm" onClick={() => void resolveConflict(c.key, { choice: "a" })}>
            Use this
          </Button>
        </div>
        <div className={styles.side}>
          <span className={styles.sideName}>{nameOf(c.b.skill)}</span>
          <p>{c.b.says}</p>
          <Button variant="secondary" size="sm" onClick={() => void resolveConflict(c.key, { choice: "b" })}>
            Use this
          </Button>
        </div>
      </div>
      <div className={styles.row}>
        <Button variant={mode === "scope" ? "primary" : "ghost"} size="sm" onClick={() => setMode(mode === "scope" ? null : "scope")}>
          Split by phase
        </Button>
        <Button variant={mode === "both" ? "primary" : "ghost"} size="sm" onClick={() => setMode(mode === "both" ? null : "both")}>
          Keep both as a tradeoff
        </Button>
      </div>
      {mode === "scope" && (
        <div className={styles.scope}>
          {([["a", a, setA], ["b", b, setB]] as const).map(([side, list, setList]) => (
            <div key={side} className={styles.phases}>
              <span className={styles.phasesLabel}>{nameOf(side === "a" ? c.a.skill : c.b.skill)} in</span>
              {PHASES.map((p) => (
                <Chip key={p} size="sm" selected={list.includes(p)} onClick={() => setList(flip(list, p))}>
                  {PHASE_INFO[p].name}
                </Chip>
              ))}
            </div>
          ))}
          <Button variant="primary" size="sm" disabled={!a.length && !b.length} onClick={() => void resolveConflict(c.key, { choice: "scope", a, b })}>
            Split it this way
          </Button>
        </div>
      )}
      {mode === "both" && (
        <div className={styles.row}>
          <Input className={styles.grow} size="sm" placeholder="When does each win? e.g. dense in tools, airy in onboarding" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button variant="primary" size="sm" disabled={!note.trim()} onClick={() => void resolveConflict(c.key, { choice: "both", note })}>
            Keep both
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * A proposed brief: what it adds and removes, the replay on past briefs, and Keep, which only
 * unlocks once the replay has run (or there's nothing to replay yet).
 */
function PendingBrief({ p, nameOf }: { p: ProposalRow; nameOf: (id: string) => string }) {
  const d = p.diff as { version: string; brief: CraftBrief; added: string[]; removed: string[] };
  const state = useEvals((s) => s.byProposal[p.id]);
  const [cases, setCases] = useState<number | null>(null);
  useEffect(() => {
    void replayCases(p).then((c) => setCases(c.length)).catch(() => setCases(0));
  }, [p]);
  const replayed = !!state && !state.running && state.total > 0 && state.done === state.total;
  const canKeep = replayed || cases === 0;
  return (
    <div className={styles.candidate}>
      <div className={styles.candidateHead}>
        <strong>Brief {d.version} proposed</strong>
        <span className={styles.meta}>
          +{d.added.length} −{d.removed.length}
        </span>
        <span className={styles.grow} />
        <Button variant="ghost" size="sm" onClick={() => void reject(p, "no")}>
          Reject
        </Button>
        <Button variant="phase" size="sm" icon={Check} disabled={!canKeep} onClick={() => void keepBrief(p)} title={canKeep ? undefined : "Replay it on past briefs first"}>
          {cases === 0 ? "Keep (nothing to replay yet)" : `Keep ${d.version}`}
        </Button>
      </div>
      {(d.added.length > 0 || d.removed.length > 0) && (
        <ul className={styles.changes}>
          {d.added.map((t) => (
            <li key={`+${t}`} className={styles.added}>
              + {t}
            </li>
          ))}
          {d.removed.map((t) => (
            <li key={`-${t}`} className={styles.removed}>
              − {t}
            </li>
          ))}
        </ul>
      )}
      {cases === 0 ? (
        <p className={styles.note}>There are no past briefs to replay yet. Score a few runs, or keep one as a replay brief from the inspector, and later briefs will replay before they go live.</p>
      ) : (
        <ReplayPanel p={p} onKeep={() => void keepBrief(p)} />
      )}
      <Principles brief={d.brief} nameOf={nameOf} />
    </div>
  );
}
