import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { GraphNode } from "@composer/core";
import { useProject } from "../../store/project";
import { useDisplayGraph, usePlaybackActive } from "../../store/display";

function colorFor(from: GraphNode | undefined): string {
  if (!from) return "var(--text-muted)";
  switch (from.kind) {
    case "source":
      return "rgba(var(--rgb-secondary), 0.75)";
    case "hypothesis":
      return "var(--signal-hypothesis)";
    case "claude":
      return "rgba(var(--rgb-ink), 0.8)";
    case "output":
      return "var(--phase-understand)";
  }
}

/** A wire colored by what it carries; dashed and moving while its target runs. */
export function WireEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps) {
  const graph = useDisplayGraph();
  const playing = usePlaybackActive();
  const from = graph.nodes[source];
  const versions = useProject((s) => s.versions);
  const runningLive = useProject((s) => s.live[target]?.status === "running");
  const running = !playing && runningLive;
  const t = graph.nodes[target];
  const disabled = t?.kind === "claude" && t.disabledInputs.includes(source);
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.35 });
  let stroke = colorFor(from);
  if (from?.kind === "output" && from.versionId) {
    const v = versions[from.versionId];
    if (v) stroke = `var(--phase-${v.phase})`;
  }
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{
        stroke,
        strokeWidth: selected ? 2 : 1.5,
        strokeDasharray: running ? "5 5" : disabled ? "2 4" : undefined,
        opacity: disabled ? 0.35 : 1,
        animation: running ? "wire-flow 0.6s linear infinite" : undefined,
      }}
    />
  );
}
