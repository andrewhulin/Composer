import { useEffect, useState } from "react";
import { hashOf, type TextArtifact } from "@composer/core";
import type { PrototypeData } from "@composer/engine";
import type { ProposalRow } from "@composer/data";
import { judgeReplay, loadReplay, runReplay, useEvals } from "../../store/evals";
import { PrototypeFrame } from "../inspector/PrototypeView";
import { Button, cx } from "../primitives";
import styles from "./ReplayPanel.module.css";

function Output({ art }: { art?: TextArtifact }) {
  if (!art) return <p className={styles.missing}>No output</p>;
  const proto = art.artifact === "prototype" ? (art.data as PrototypeData | undefined) : undefined;
  if (proto?.html) return <PrototypeFrame hash={hashOf(art)} html={proto.html} width={200} />;
  return <pre className={styles.text}>{art.text.length > 1400 ? `${art.text.slice(0, 1400)}…` : art.text}</pre>;
}

/**
 * The replay set for one proposal: past briefs rerun with the change, baseline beside candidate.
 * Keeping is the designer's call; the tally only says how the briefs went.
 */
export function ReplayPanel({ p, onKeep }: { p: ProposalRow; onKeep: () => void }) {
  const state = useEvals((s) => s.byProposal[p.id]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void loadReplay(p).then(() => useEvals.getState().byProposal[p.id] && setOpen(true));
  }, [p]);
  const has = !!state?.rows.length;

  return (
    <div className={styles.replay}>
      <div className={styles.bar}>
        <Button variant="tint" size="sm" className={styles.run} disabled={state?.running} onClick={() => (setOpen(true), void runReplay(p))}>
          {state?.running ? `Replaying ${state.done}/${state.total}…` : has ? "Replay again" : "Replay on past briefs"}
        </Button>
        {has && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
            {open ? "Hide side by side" : "Show side by side"}
          </Button>
        )}
        <span className={cx(styles.tally, state?.tally.favours && styles.favours)}>{state ? state.tally.line : "Reruns up to 4 kept briefs with this change, before it goes live"}</span>
        {state?.tally.favours && (
          <Button variant="phase" size="sm" className={styles.keep} onClick={onKeep}>
            Keep it
          </Button>
        )}
      </div>
      {open && has && (
        <div className={styles.rows}>
          {state!.rows.map((row) => (
            <div key={row.case.id} className={styles.row}>
              <span className={styles.name}>{row.case.name}</span>
              <div className={styles.sides}>
                <div className={cx(styles.side, row.result?.pick === "baseline" && styles.won)}>
                  <span className={styles.label}>Baseline · as it ran</span>
                  <Output {...(row.baseline ? { art: row.baseline } : {})} />
                </div>
                <div className={cx(styles.side, row.result?.pick === "candidate" && styles.won)}>
                  <span className={styles.label}>Candidate · with the change</span>
                  {row.result?.status === "error" ? <p className={styles.missing}>{row.result.error}</p> : row.candidate ? <Output art={row.candidate} /> : <p className={styles.missing}>Replaying…</p>}
                </div>
              </div>
              {row.result?.status === "done" && (
                <div className={styles.picks}>
                  {(["baseline", "same", "candidate"] as const).map((k) => (
                    <Button key={k} variant={row.result?.pick === k ? "tint" : "secondary"} size="sm" onClick={() => void judgeReplay(p, row.result!.id, k)}>
                      {k === "baseline" ? "Baseline better" : k === "same" ? "Same" : "Candidate better"}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
