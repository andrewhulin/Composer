import { memo } from "react";
import type { NodeProps } from "@xyflow/react";
import { PHASE_INFO, nextPhase, type OutputNode, type TextArtifact } from "@composer/core";
import { incoming, outputLockState } from "@composer/engine";
import { latestVersionOf, useProject } from "../../store/project";
import { useDisplayGraph, usePlaybackActive } from "../../store/display";
import { ArrowLeft, ArrowRight, Diamond } from "lucide-react";
import { cx } from "../primitives/cx";
import { Icon } from "../primitives/Icon";
import { Port } from "./Port";
import styles from "./Node.module.css";
import own from "./OutputNodeView.module.css";

function firstLine(text: string | undefined): string | undefined {
  if (!text) return;
  const line = text.split("\n").find((l) => l.trim())?.replace(/^[A-Za-z ]+:\s*/, "") ?? "";
  return line.length > 140 ? `${line.slice(0, 138)}…` : line;
}

/** Node/Output: the one artifact a phase ships, or (as an inlet) the locked artifact it starts from. */
export const OutputNodeView = memo(function OutputNodeView({ id, selected }: NodeProps) {
  const graph = useDisplayGraph();
  const node = graph.nodes[id] as OutputNode | undefined;
  const playing = usePlaybackActive();
  const relock = useProject((s) => !playing && !!s.preview?.relock.includes(id));
  const versions = useProject((s) => s.versions);
  const blobs = useProject((s) => s.blobs);
  const shake = useProject((s) => (s.shake?.id === id ? s.shake.at : 0));
  if (!node) return null;

  const inlet = node.mode === "inlet";
  const version = inlet ? (node.versionId ? versions[node.versionId] : undefined) : latestVersionOf(node.familyId);
  const latest = latestVersionOf(node.familyId);
  const edge = inlet ? undefined : incoming(graph, id)[0];
  const draft = edge ? graph.outputs[edge.from] : undefined;
  const lockState = inlet ? "locked" : outputLockState(graph, id, version?.contentHash);
  const shown = (lockState === "draft" || lockState === "newer_available") && draft ? draft.hash : version?.contentHash;
  const text = shown ? (blobs.get(shown) as TextArtifact | undefined)?.text : undefined;
  const fromPhase = inlet && version ? version.phase : undefined;
  const accent = fromPhase ?? node.phase;
  const next = nextPhase(node.phase);

  let status: string;
  let tone: "locked" | "draft" | "warn" | "empty";
  if (inlet) {
    status = version ? `v${version.version} · locked` : "waiting";
    tone = "locked";
    if (latest && version && latest.version > version.version) {
      status = `v${version.version} · v${latest.version} available`;
      tone = "warn";
    }
  } else if (relock) {
    status = "would need relock";
    tone = "warn";
  } else if (lockState === "locked") {
    status = `v${version!.version} · locked`;
    tone = "locked";
  } else if (lockState === "newer_available") {
    status = `v${version!.version} locked · new draft`;
    tone = "warn";
  } else if (lockState === "draft") {
    status = "draft · not locked";
    tone = "draft";
  } else {
    status = "waiting for a run";
    tone = "empty";
  }

  return (
    <div className={cx(styles.node, own.output, selected && styles.selected, shake && styles.shake)} data-phase={accent} key={shake}>
      <div className={styles.header}>
        <span className={cx(styles.glyph, own.glyph)}>
          <Icon icon={Diamond} size="sm" fill="currentColor" />
        </span>
        <span className={styles.title}>{node.title}</span>
        <span className={styles.tag}>{inlet ? "Inlet" : "Output"}</span>
      </div>
      <div className={own.body}>
        <p className={cx(own.preview, !text && own.empty)}>{text ? `“${firstLine(text)}”` : inlet ? "Nothing locked yet." : "Lock the result here to hand it to the next phase."}</p>
        <div className={own.footer}>
          <span className={cx(own.status, own[tone])}>{status}</span>
          <span className={own.next}>
            <Icon icon={inlet && fromPhase ? ArrowLeft : ArrowRight} size="sm" />
            {inlet && fromPhase ? PHASE_INFO[fromPhase].name : next ? PHASE_INFO[next].name : "out"}
          </span>
        </div>
      </div>
      {!inlet && <Port nodeId={id} port="text" type="text" side="in" top={18} color="var(--phase)" />}
      <Port nodeId={id} port="out" type="phase_output" side="out" top={18} />
    </div>
  );
});
