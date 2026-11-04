import { diffGraphs, type Graph, type GraphChange, type GraphNode, type HypothesisBlock, type Id } from "@composer/core";

export interface HistoryFrame {
  id: Id;
  seq: number;
  kind: string;
  createdAt: string;
}

/** Which frames playback steps through: every snapshot, or only runs. */
export function playbackFrames<T extends HistoryFrame>(frames: T[], runsOnly: boolean): T[] {
  return runsOnly ? frames.filter((f) => f.kind === "run") : frames;
}

/**
 * How long playback waits on a frame before the next one: the real gap, capped so idle time
 * doesn't stall the story, then scaled by speed.
 */
export function frameDelay(a: HistoryFrame, b: HistoryFrame, speed: number, capMs = 1500, floorMs = 450): number {
  const real = Math.max(0, Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return Math.max(floorMs, Math.min(capMs, real)) / speed;
}

/** The order playback reveals a frame's additions in: creation sequence, nodes before their wires. */
export function revealOrder(before: Graph, after: Graph): { nodes: Id[]; edges: Id[] } {
  const changes = diffGraphs(before, after);
  return {
    nodes: changes.filter((c): c is Extract<GraphChange, { type: "node_added" }> => c.type === "node_added").map((c) => c.id),
    edges: changes.filter((c): c is Extract<GraphChange, { type: "edge_added" }> => c.type === "edge_added").map((c) => c.id),
  };
}

export type ChangeLine = { icon: "swap" | "add" | "remove" | "weight" | "run" | "edit"; text: string };

const name = (n: GraphNode | undefined) => n?.title ?? "a node";

/**
 * "What changed" between two snapshots (Figma 04 · Compare): swaps, wiring, weights and reruns,
 * in words. Hypothesis blocks are looked up so a swap reads "H1 swapped for H2 · audience …".
 */
export function describeChanges(a: Graph, b: Graph, blocks: Record<Id, HypothesisBlock>): ChangeLine[] {
  const lines: ChangeLine[] = [];
  for (const c of diffGraphs(a, b)) {
    if (c.type === "node_added") lines.push({ icon: "add", text: `${name(b.nodes[c.id])} added` });
    else if (c.type === "node_removed") lines.push({ icon: "remove", text: `${name(a.nodes[c.id])} removed` });
    else if (c.type === "edge_added") lines.push({ icon: "add", text: `${name(b.nodes[c.from])} wired into ${name(b.nodes[c.to])}` });
    else if (c.type === "edge_removed") lines.push({ icon: "remove", text: `${name(a.nodes[c.from])} unwired from ${name(a.nodes[c.to])}` });
    else if (c.type === "output_changed") lines.push({ icon: "run", text: `${name(b.nodes[c.id])} ran again` });
    else if (c.type === "node_changed") {
      const before = a.nodes[c.id]!;
      const after = b.nodes[c.id]!;
      if (before.kind === "hypothesis" && after.kind === "hypothesis" && c.fields.includes("blockId")) {
        const x = blocks[before.blockId];
        const y = blocks[after.blockId];
        const diff = y?.vars.filter((v) => x?.vars.find((o) => o.key === v.key)?.value !== v.value).map((v) => `${v.key} → ${v.value}`) ?? [];
        lines.push({ icon: "swap", text: `${x?.label ?? "H?"} swapped for ${y?.label ?? "H?"}${diff.length ? ` · ${diff.join(", ")}` : ""}` });
      } else if (after.kind === "output" && after.mode === "inlet" && c.fields.includes("versionId")) {
        lines.push({ icon: "run", text: `${name(after)} inlet moved to a newer locked version` });
      } else if (c.fields.includes("weight") && "weight" in after) {
        lines.push({ icon: "weight", text: `${name(after)} weighed ${"weight" in before ? before.weight : "normal"} → ${after.weight}` });
      } else if (c.fields.some((f) => f !== "position")) {
        lines.push({ icon: "edit", text: `${name(after)} edited (${c.fields.filter((f) => f !== "position").join(", ")})` });
      }
    }
  }
  return lines;
}
