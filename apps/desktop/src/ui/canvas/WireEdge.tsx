import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { GraphNode } from "@composer/core";
import { useProject } from "../../store/project";

function colorFor(from: GraphNode | undefined): string {
  if (!from) return "var(--text-muted)";
  switch (from.kind) {
    case "source":
      return "rgba(162, 158, 148, 0.75)";
    case "hypothesis":
      return "var(--signal-hypothesis)";
    case "claude":
      return "rgba(238, 237, 234, 0.8)";
    case "output":
      return "var(--phase-understand)";
  }
}

/** A wire colored by what it carries; dashed and moving while its target runs. */
export function WireEdge({ id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps) {
  const from = useProject((s) => s.graph.nodes[source]);
  const versions = useProject((s) => s.versions);
  const running = useProject((s) => s.live[target]?.status === "running");
  const disabled = useProject((s) => {
    const t = s.graph.nodes[target];
    return t?.kind === "claude" && t.disabledInputs.includes(source);
  });
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
