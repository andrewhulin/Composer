import { PHASES, type Phase, type ProcessGraph, type ProcessNode } from "./story";

/** Loops stack downward, one canvas height apart. */
const LOOP_H = 900;
const SIZE: Record<ProcessNode["kind"], { w: number; h: number }> = {
  source: { w: 220, h: 96 },
  claude: { w: 256, h: 174 },
  hypothesis: { w: 280, h: 132 },
  output: { w: 232, h: 120 },
};

export interface PlacedNode extends ProcessNode {
  px: number;
  py: number;
  w: number;
  h: number;
  /** 0-based position in creation order. */
  order: number;
}

export interface ProcessLayout {
  nodes: PlacedNode[];
  edges: { from: PlacedNode; to: PlacedNode }[];
  regions: { phase: Phase; x: number; w: number }[];
  scale: number;
}

/** Gap between phase columns once empty canvas is squeezed out. */
const GUTTER = 220;

/**
 * Fits the whole graph, every phase and loop, into a box. Each phase becomes a column as wide as
 * what was actually placed in it, so nodes stay legible; within a column the canvas arrangement holds.
 */
export function layoutProcess(graph: ProcessGraph, box: { width: number; height: number }): ProcessLayout {
  const ordered = [...graph.nodes].sort((a, b) => a.seq - b.seq);
  if (!ordered.length) return { nodes: [], edges: [], regions: [], scale: 1 };
  const used = PHASES.filter((p) => ordered.some((n) => n.phase === p));
  const columns = new Map<Phase, { minX: number; x: number; w: number }>();
  let cursor = 0;
  for (const phase of used) {
    const inPhase = ordered.filter((n) => n.phase === phase);
    const minX = Math.min(...inPhase.map((n) => n.x));
    const maxX = Math.max(...inPhase.map((n) => n.x + SIZE[n.kind].w));
    columns.set(phase, { minX, x: cursor, w: maxX - minX });
    cursor += maxX - minX + GUTTER;
  }
  const raw = ordered.map((n) => {
    const col = columns.get(n.phase)!;
    return { n, x: col.x + n.x - col.minX, y: (n.loop - 1) * LOOP_H + n.y, ...SIZE[n.kind] };
  });
  const minY = Math.min(...raw.map((r) => r.y));
  const maxX = Math.max(...raw.map((r) => r.x + r.w));
  const maxY = Math.max(...raw.map((r) => r.y + r.h));
  const scale = Math.min(box.width / maxX, box.height / (maxY - minY), 0.75);
  const offX = (box.width - maxX * scale) / 2;
  const offY = (box.height - (maxY - minY) * scale) / 2;
  const nodes: PlacedNode[] = raw.map((r, order) => ({ ...r.n, px: offX + r.x * scale, py: offY + (r.y - minY) * scale, w: r.w * scale, h: r.h * scale, order }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = graph.edges.flatMap((e) => {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    return from && to ? [{ from, to }] : [];
  });
  const regions = used.map((phase) => {
    const col = columns.get(phase)!;
    return { phase, x: offX + (col.x - GUTTER / 2) * scale, w: (col.w + GUTTER) * scale };
  });
  return { nodes, edges, regions, scale };
}

/** The frame a node appears on: spread across the first 75% of the chapter, in creation order. */
export function revealFrame(order: number, count: number, frames: number): number {
  const span = frames * 0.75;
  return Math.round(6 + (count <= 1 ? 0 : (span * order) / (count - 1)));
}

/** Pulls the first number out of a metric value ("+12%", "-0.9 pts") so it can count up. */
export function parseMetric(value: string): { prefix: string; number: number; decimals: number; suffix: string; plus: boolean } | null {
  const m = /^(.*?)([-+]?)(\d+(?:\.(\d+))?)(.*)$/.exec(value.trim());
  if (!m) return null;
  return { prefix: m[1] ?? "", number: Number(`${m[2] === "-" ? "-" : ""}${m[3]}`), decimals: m[4]?.length ?? 0, suffix: m[5] ?? "", plus: m[2] === "+" };
}

/** A metric value partway through its count-up, keeping its sign and precision. */
export function formatMetric(p: NonNullable<ReturnType<typeof parseMetric>>, t: number): string {
  const n = p.number * t;
  return `${p.prefix}${p.plus ? "+" : ""}${n.toFixed(p.decimals)}${p.suffix}`;
}
