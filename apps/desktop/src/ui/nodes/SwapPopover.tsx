import { useEffect, useMemo, useState } from "react";
import type { HypothesisBlock, Id, SourceContent } from "@composer/core";
import { swapCandidates } from "@composer/engine";
import { actions, useProject } from "../../store/project";
import { cx } from "../primitives/cx";
import styles from "./SwapPopover.module.css";

/**
 * Swap a variable (Figma 05): candidates from the memory chain plus anything typed, ranked by
 * how much evidence in the sources backs them. Hovering paints the blast radius amber first.
 */
export function SwapPopover({ nodeId, block, varKey, onClose }: { nodeId: Id; block: HypothesisBlock; varKey: string; onClose: () => void }) {
  const hypotheses = useProject((s) => s.hypotheses);
  const graph = useProject((s) => s.graph);
  const blobs = useProject((s) => s.blobs);
  const preview = useProject((s) => s.preview);
  const [typed, setTyped] = useState("");
  const [picked, setPicked] = useState<string | null>(null);

  const contents = useMemo(
    () => Object.values(graph.nodes).flatMap((n) => (n.kind === "source" && n.contentHash ? [blobs.get(n.contentHash) as SourceContent] : [])).filter(Boolean),
    [graph.nodes, blobs],
  );
  const candidates = useMemo(() => swapCandidates(block, varKey, Object.values(hypotheses), contents, typed.trim() ? [typed] : []), [block, varKey, hypotheses, contents, typed]);

  useEffect(() => {
    actions.previewSwap(nodeId);
    return () => actions.clearPreview();
  }, [nodeId]);

  const commit = (value: string) => {
    onClose();
    void actions.forkSwap(nodeId, varKey, value);
  };
  const current = block.vars.find((v) => v.key === varKey)?.value;

  return (
    <div className={cx(styles.popover, "nodrag", "nopan", "nowheel")} onPointerDown={(e) => e.stopPropagation()}>
      <div className={styles.head}>
        <span className={styles.key}>{varKey}</span>
        <span className={styles.current}>{current}</span>
      </div>
      {candidates.length === 0 && !typed && <p className={styles.empty}>No other values in the chain yet. Type one below.</p>}
      {candidates.map((c) => (
        <button key={c.value} type="button" className={cx(styles.option, picked === c.value && styles.picked)} onClick={() => setPicked(c.value)}>
          <span>{c.value}</span>
          <span className={styles.evidence}>
            {c.evidence} {c.evidence === 1 ? "source" : "sources"}
          </span>
        </button>
      ))}
      <input
        className={styles.input}
        autoFocus
        placeholder={`Another ${varKey}…`}
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          setPicked(e.target.value.trim() || null);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && (e.metaKey || picked)) commit(picked ?? typed.trim());
        }}
      />
      {preview && (preview.stale.length > 0 || preview.relock.length > 0) && (
        <p className={styles.radius}>
          {preview.stale.length} {preview.stale.length === 1 ? "node goes" : "nodes go"} stale
          {preview.relock.length ? ` · ${preview.relock.length} output${preview.relock.length === 1 ? "" : "s"} to relock` : ""}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={styles.primary} disabled={!picked} onClick={() => picked && commit(picked)}>
          Fork and rerun <span>⌘↵</span>
        </button>
      </div>
      <p className={styles.note}>{block.label} is retired, not deleted. The timeline gets a branch; ⌘Z merges it back.</p>
    </div>
  );
}
