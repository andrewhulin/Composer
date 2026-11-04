import { useEffect, useMemo, useState } from "react";
import { PHASE_INFO, type Graph, type TextArtifact } from "@composer/core";
import { describeChanges, incoming, type ChangeLine } from "@composer/engine";
import type { SnapshotRow } from "@composer/data";
import { ensureBlobs, useProject } from "../../store/project";
import { branchLine, graphAt } from "../../store/playback";
import { useUi } from "../../store/ui";
import styles from "./CompareView.module.css";

const ICON: Record<ChangeLine["icon"], string> = { swap: "⇄", add: "+", remove: "−", weight: "~", run: "↻", edit: "✎" };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** What a snapshot shipped: the newest output in its phase, its hypothesis, its context. */
function Summary({ snap, graph }: { snap: SnapshotRow; graph: Graph }) {
  const blobs = useProject((s) => s.blobs);
  const hypotheses = useProject((s) => s.hypotheses);
  const output = Object.values(graph.nodes).find((n) => n.kind === "output" && n.mode === "output" && n.phase === snap.phase);
  const feed = output ? incoming(graph, output.id)[0]?.from : undefined;
  const art = feed && graph.outputs[feed] ? (blobs.get(graph.outputs[feed]!.hash) as TextArtifact | undefined) : undefined;
  const hyp = Object.values(graph.nodes).find((n) => n.kind === "hypothesis" && n.phase === snap.phase);
  const block = hyp?.kind === "hypothesis" ? hypotheses[hyp.blockId] : undefined;
  const sources = Object.values(graph.nodes).filter((n) => n.kind === "source" && n.phase === snap.phase && n.weight !== "mute").length;
  const headline = art?.text.split("\n")[0]?.replace(/^[A-Za-z ]+:\s*/, "");
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardTitle}>Snapshot {snap.seq}</span>
        <span className={styles.meta}>
          {hhmm(snap.createdAt)}
          {snap.label ? ` · ${snap.label}` : ""}
        </span>
      </div>
      <div className={styles.paper}>
        <span className={styles.paperLabel}>{(output ? PHASE_INFO[snap.phase].output : "No output yet").toUpperCase()}</span>
        <p className={styles.paperText}>{headline ?? "Nothing ran in this phase yet."}</p>
      </div>
      <div className={styles.row}>
        <span>hypothesis</span>
        <span className={styles.hyp}>{block ? `${block.label} · ${block.statement.slice(0, 40)}${block.statement.length > 40 ? "…" : ""}` : "—"}</span>
      </div>
      <div className={styles.row}>
        <span>context</span>
        <span>{sources} {sources === 1 ? "source" : "sources"}</span>
      </div>
    </div>
  );
}

/** Figma 04 · Compare two snapshots: before, what changed, after. */
export function CompareView() {
  const open = useUi((s) => s.compareOpen);
  const setOpen = useUi((s) => s.setCompareOpen);
  const bookmarks = useProject((s) => s.bookmarks);
  const hypotheses = useProject((s) => s.hypotheses);
  useProject((s) => s.snapshots);
  const line = branchLine();
  const defaultA = useMemo(() => {
    const head = line[line.length - 1];
    const marked = [...bookmarks].reverse().find((b) => b.snapshotId !== head?.id && line.some((s) => s.id === b.snapshotId));
    return marked?.snapshotId ?? line[Math.max(0, line.length - 2)]?.id;
  }, [line, bookmarks]);
  const [aId, setA] = useState<string | undefined>();
  const [bId, setB] = useState<string | undefined>();
  const a = line.find((s) => s.id === (aId ?? defaultA));
  const b = line.find((s) => s.id === (bId ?? line[line.length - 1]?.id));
  const [graphs, setGraphs] = useState<[Graph, Graph] | null>(null);

  useEffect(() => {
    if (!open || !a || !b) return;
    let alive = true;
    void Promise.all([graphAt(a), graphAt(b)]).then(async ([ga, gb]) => {
      await Promise.all([ensureBlobs(ga), ensureBlobs(gb)]);
      if (alive) setGraphs([ga, gb]);
    });
    return () => {
      alive = false;
    };
  }, [open, a, b]);

  if (!open) return null;
  const changes = graphs ? describeChanges(graphs[0], graphs[1], hypotheses) : [];
  const pick = (value: string | undefined, onChange: (v: string) => void) => (
    <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
      {line.map((s) => (
        <option key={s.id} value={s.id}>
          #{s.seq} · {hhmm(s.createdAt)} {s.label ?? s.kind}
        </option>
      ))}
    </select>
  );

  return (
    <div className={styles.scrim} onPointerDown={() => setOpen(false)}>
      <div className={styles.panel} onPointerDown={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <span className="caps">Compare two snapshots</span>
          <span className={styles.pickers}>
            {pick(a?.id, setA)}
            <span>→</span>
            {pick(b?.id, setB)}
          </span>
          <button type="button" className={styles.close} onClick={() => setOpen(false)}>
            esc
          </button>
        </header>
        {graphs && a && b ? (
          <div className={styles.columns}>
            <Summary snap={a} graph={graphs[0]} />
            <div className={styles.changes}>
              <span className="caps">What changed</span>
              {changes.length === 0 && <p className={styles.none}>Nothing on the canvas changed between these two.</p>}
              {changes.map((c, i) => (
                <p key={i} className={styles.change} data-icon={c.icon}>
                  <span>{ICON[c.icon]}</span>
                  {c.text}
                </p>
              ))}
            </div>
            <Summary snap={b} graph={graphs[1]} />
          </div>
        ) : (
          <p className={styles.none}>Loading…</p>
        )}
      </div>
    </div>
  );
}
