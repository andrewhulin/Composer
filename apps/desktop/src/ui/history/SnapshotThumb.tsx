import { useEffect, useState } from "react";
import type { Graph, Phase } from "@composer/core";
import type { SnapshotRow } from "@composer/data";
import { graphAt } from "../../store/playback";

const FILL: Record<string, string> = { source: "#a29e94", claude: "#eeedea", hypothesis: "#e3c25a" };
const SIZE: Record<string, [number, number]> = { source: [150, 70], claude: [256, 174], hypothesis: [248, 190], output: [232, 120] };

/** A minimap of one snapshot's phase: blocks where the nodes were (Figma 04 filmstrip). */
export function SnapshotThumb({ snap, width = 120, height = 56 }: { snap: SnapshotRow; width?: number; height?: number }) {
  const [graph, setGraph] = useState<Graph | null>(null);
  useEffect(() => {
    let alive = true;
    void graphAt(snap).then((g) => alive && setGraph(g));
    return () => {
      alive = false;
    };
  }, [snap]);
  if (!graph) return <svg width={width} height={height} />;
  const nodes = Object.values(graph.nodes).filter((n) => n.phase === (snap.phase as Phase));
  if (!nodes.length) return <svg width={width} height={height} />;
  const xs = nodes.flatMap((n) => [n.position.x, n.position.x + (SIZE[n.kind]?.[0] ?? 200)]);
  const ys = nodes.flatMap((n) => [n.position.y, n.position.y + (SIZE[n.kind]?.[1] ?? 100)]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((width - 12) / Math.max(1, x1 - x0), (height - 10) / Math.max(1, y1 - y0));
  return (
    <svg width={width} height={height} aria-hidden>
      {nodes.map((n) => {
        const [w, h] = SIZE[n.kind] ?? [200, 100];
        const fill = n.kind === "output" ? `var(--phase-${n.phase})` : (FILL[n.kind] ?? "#888");
        return (
          <rect
            key={n.id}
            x={6 + (n.position.x - x0) * scale}
            y={5 + (n.position.y - y0) * scale}
            width={Math.max(4, w * scale)}
            height={Math.max(3, Math.min(h, 120) * scale * 0.55)}
            rx={1.5}
            fill={fill}
            opacity={n.kind === "source" && "weight" in n && n.weight === "mute" ? 0.3 : 0.9}
          />
        );
      })}
    </svg>
  );
}
