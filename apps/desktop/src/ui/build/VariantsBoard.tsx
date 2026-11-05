import { useState } from "react";
import type { ClaudeNode, TextArtifact } from "@composer/core";
import { DIRECTIONS, type Direction, type PrototypeData } from "@composer/engine";
import { actions, statusesOf, toast, useProject } from "../../store/project";
import { useUi } from "../../store/ui";
import { keySource, roundOf, variantsOf } from "../../app/scaffold";
import { PrototypeFrame } from "../inspector/PrototypeView";
import { keyOutput } from "../workspace/useKey";
import { cx } from "../primitives/cx";
import styles from "./Build.module.css";

const STATUS = { never_run: "not run", fresh: "fresh", stale: "stale", stale_env: "rules changed" } as const;
const directionOf = (n: ClaudeNode) => (n.options.direction as Direction | undefined) ?? "direct";

/**
 * Build's variants, side by side by round. Each is one direction on the same brief; fork the one
 * you like into a next round, open it to tweak or note, and compare in pairs to teach the loop.
 */
export function VariantsBoard() {
  const graph = useProject((s) => s.graph);
  const env = useProject((s) => s.env);
  const loop = useProject((s) => s.loop);
  const blobs = useProject((s) => s.blobs);
  const live = useProject((s) => s.live);
  const [pairing, setPairing] = useState(false);
  const [pairIndex, setPairIndex] = useState(0);
  const [adding, setAdding] = useState<Direction>("minimal");
  const close = () => useUi.getState().setVariantsOpen(false);

  const variants = variantsOf(graph, loop);
  const statuses = statusesOf(graph, env);
  const out = keyOutput(graph, "build", loop);
  const keyId = out ? keySource(graph, out.id)?.id : undefined;
  const rounds = [...new Set(variants.map(roundOf))].sort((a, b) => a - b);
  const latest = Math.max(1, ...rounds);
  const dataOf = (n: ClaudeNode) => {
    const o = graph.outputs[n.id];
    return o ? { hash: o.hash, runId: o.runId, data: (blobs.get(o.hash) as TextArtifact | undefined)?.data as PrototypeData | undefined } : undefined;
  };

  const ready = variants.filter((n) => roundOf(n) === latest && graph.outputs[n.id]);
  const pairs: [ClaudeNode, ClaudeNode][] = [];
  for (let i = 0; i < ready.length; i++) for (let j = i + 1; j < ready.length; j++) pairs.push([ready[i]!, ready[j]!]);
  const pair = pairs[pairIndex];

  const choose = async (winner: ClaudeNode | null, a: ClaudeNode, b: ClaudeNode) => {
    if (winner) {
      const loser = winner === a ? b : a;
      const w = graph.outputs[winner.id]?.runId;
      const l = graph.outputs[loser.id]?.runId;
      if (w && l) await actions.pick(w, l, "build", "variants", undefined, `Preferred ${winner.title} over ${loser.title}`);
    }
    if (pairIndex + 1 >= pairs.length) {
      setPairing(false);
      setPairIndex(0);
      toast(`${pairs.length} pair${pairs.length === 1 ? "" : "s"} judged · picks feed the improvement loop`, "success");
    } else setPairIndex(pairIndex + 1);
  };

  return (
    <div className={styles.board} data-phase="build" role="dialog" aria-label="Variants">
      <header className={styles.boardHead}>
        <span className={styles.studioTitle}>Variants</span>
        <span className={styles.meta}>
          {variants.length} across {rounds.length} round{rounds.length === 1 ? "" : "s"} · the key node ships one
        </span>
        <span className={styles.fill} />
        <button type="button" className={styles.ghost} onClick={() => variants.filter((n) => roundOf(n) === latest).forEach((n) => actions.run(n.id))}>
          Run round {latest}
        </button>
        <select className={styles.select} value={adding} onChange={(e) => setAdding(e.target.value as Direction)} aria-label="Direction to add">
          {(Object.keys(DIRECTIONS) as Direction[]).map((d) => (
            <option key={d} value={d}>
              {DIRECTIONS[d].split(":")[0]}
            </option>
          ))}
        </select>
        <button type="button" className={styles.ghost} onClick={() => actions.addDirection(adding)}>
          Add direction
        </button>
        <button type="button" className={cx(styles.ghost, pairing && styles.ghostOn)} disabled={!pairs.length} onClick={() => (setPairing(!pairing), setPairIndex(0))} title={pairs.length ? undefined : "Run at least two variants in the latest round"}>
          Compare in pairs{pairs.length ? ` · ${pairs.length}` : ""}
        </button>
        <button type="button" className={styles.ghost} onClick={close}>
          Close
        </button>
      </header>

      {pairing && pair ? (
        <div className={styles.pairs}>
          <p className={styles.pairQ}>
            Which is closer to what you'd ship? <span>{`${pairIndex + 1} of ${pairs.length}`}</span>
          </p>
          <div className={styles.pairRow}>
            {pair.map((n) => {
              const d = dataOf(n);
              return (
                <div key={n.id} className={styles.pairSide}>
                  <span className={styles.cardTitle}>{n.title}</span>
                  {d?.data && <PrototypeFrame hash={d.hash} html={d.data.html} width={300} />}
                  <button type="button" className={styles.primary} onClick={() => void choose(n, pair[0], pair[1])}>
                    This one
                  </button>
                </div>
              );
            })}
          </div>
          <button type="button" className={styles.ghost} onClick={() => void choose(null, pair[0], pair[1])}>
            About the same
          </button>
        </div>
      ) : (
        <div className={styles.rounds}>
          {rounds.map((r) => (
            <section key={r} className={styles.round}>
              <span className="caps">{r === 1 ? "Round 1 · first directions" : `Round ${r} · forked`}</span>
              <div className={styles.cards}>
                {variants
                  .filter((n) => roundOf(n) === r)
                  .map((n) => {
                    const d = dataOf(n);
                    const status = statuses[n.id];
                    const running = live[n.id]?.status === "running";
                    const isKey = n.id === keyId;
                    return (
                      <article key={n.id} className={cx(styles.card, isKey && styles.cardKey)}>
                        <div className={styles.cardHead}>
                          <span className={styles.cardTitle}>{n.title}</span>
                          {isKey && <span className={styles.keyBadge}>KEY</span>}
                          <span className={styles.meta}>{running ? "running" : STATUS[status ?? "never_run"]}</span>
                        </div>
                        <p className={styles.direction}>{DIRECTIONS[directionOf(n)].split(": ")[1]}</p>
                        <div className={styles.thumb} onDoubleClick={() => d && useUi.getState().setStudio({ nodeId: n.id })}>
                          {d?.data ? <PrototypeFrame hash={d.hash} html={d.data.html} width={220} /> : <span className={styles.notRun}>{running ? (live[n.id]?.text ? "Writing…" : "Starting…") : "Not run yet"}</span>}
                        </div>
                        {(n.notes?.length ?? 0) > 0 && <span className={styles.meta}>{n.notes!.filter((x) => x.runId === d?.runId).length} note(s) for the next run</span>}
                        <div className={styles.cardActions}>
                          <button type="button" className={styles.ghost} disabled={running} onClick={() => actions.run(n.id)}>
                            {d ? "Rerun" : "Run"}
                          </button>
                          <button type="button" className={styles.ghost} disabled={!d} onClick={() => useUi.getState().setStudio({ nodeId: n.id })}>
                            Open
                          </button>
                          {!isKey && (
                            <button type="button" className={styles.ghost} onClick={() => actions.useVariant(n.id)}>
                              Use
                            </button>
                          )}
                          <button type="button" className={styles.ghost} disabled={!d} onClick={() => void actions.forkVariant(n.id)} title="Three new directions that start from this one">
                            Fork
                          </button>
                        </div>
                      </article>
                    );
                  })}
              </div>
            </section>
          ))}
          {!variants.length && <p className={styles.hint}>Lock a statement in Define and Build lays out three variants here.</p>}
        </div>
      )}
    </div>
  );
}
