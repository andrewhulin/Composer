import { hashOf, type Hash } from "./canonical";
import type { Id } from "./ids";
import type { Edge, GraphNode, NodeOutput } from "./types";

/** The working graph: what is on the canvas now. Treated as immutable; edits return a new graph. */
export interface Graph {
  nodes: Record<Id, GraphNode>;
  edges: Edge[];
  outputs: Record<Id, NodeOutput>;
  /** Next creation sequence number. */
  seq: number;
}

export const emptyGraph = (): Graph => ({ nodes: {}, edges: [], outputs: {}, seq: 1 });

/**
 * A snapshot manifest, as in git: node and output entries point at content-addressed blobs,
 * so unchanged nodes are shared between snapshots.
 */
export interface Manifest {
  v: 1;
  nodes: Record<Id, Hash>;
  edges: Edge[];
  outputs: Record<Id, NodeOutput>;
  seq: number;
}

export interface Blob {
  hash: Hash;
  value: unknown;
}

/** Splits a graph into a manifest plus the node blobs it references. */
export function toManifest(graph: Graph): { manifest: Manifest; blobs: Blob[] } {
  const blobs: Blob[] = [];
  const nodes: Record<Id, Hash> = {};
  for (const id of Object.keys(graph.nodes).sort()) {
    const node = graph.nodes[id]!;
    const hash = hashOf(node);
    nodes[id] = hash;
    blobs.push({ hash, value: node });
  }
  const edges = [...graph.edges].sort((a, b) => a.createdSeq - b.createdSeq || a.id.localeCompare(b.id));
  return { manifest: { v: 1, nodes, edges, outputs: graph.outputs, seq: graph.seq }, blobs };
}

export function manifestHash(manifest: Manifest): Hash {
  return hashOf(manifest);
}

/** Rebuilds a graph from a manifest, reading node blobs by hash. */
export function fromManifest(manifest: Manifest, readBlob: (hash: Hash) => unknown): Graph {
  const nodes: Record<Id, GraphNode> = {};
  for (const [id, hash] of Object.entries(manifest.nodes)) {
    const node = readBlob(hash);
    if (!node) throw new Error(`Missing node blob ${hash} for ${id}`);
    nodes[id] = node as GraphNode;
  }
  return { nodes, edges: [...manifest.edges], outputs: { ...manifest.outputs }, seq: manifest.seq };
}

export type GraphChange =
  | { type: "node_added"; id: Id; seq: number }
  | { type: "node_removed"; id: Id }
  | { type: "node_changed"; id: Id; fields: string[] }
  | { type: "edge_added"; id: Id; from: Id; to: Id; seq: number }
  | { type: "edge_removed"; id: Id; from: Id; to: Id }
  | { type: "output_changed"; id: Id; runId: Id };

/**
 * Typed differences between two graphs, ordered by creation sequence so playback can rebuild
 * a canvas node by node in the order things were made.
 */
export function diffGraphs(a: Graph, b: Graph): GraphChange[] {
  const changes: GraphChange[] = [];
  for (const [id, node] of Object.entries(b.nodes)) {
    const before = a.nodes[id];
    if (!before) changes.push({ type: "node_added", id, seq: node.createdSeq });
    else {
      const fields = changedFields(before as unknown as Record<string, unknown>, node as unknown as Record<string, unknown>);
      if (fields.length) changes.push({ type: "node_changed", id, fields });
    }
  }
  for (const id of Object.keys(a.nodes)) if (!b.nodes[id]) changes.push({ type: "node_removed", id });
  const aEdges = new Map(a.edges.map((e) => [e.id, e]));
  const bEdges = new Map(b.edges.map((e) => [e.id, e]));
  for (const [id, e] of bEdges) if (!aEdges.has(id)) changes.push({ type: "edge_added", id, from: e.from, to: e.to, seq: e.createdSeq });
  for (const [id, e] of aEdges) if (!bEdges.has(id)) changes.push({ type: "edge_removed", id, from: e.from, to: e.to });
  for (const [id, out] of Object.entries(b.outputs)) {
    if (a.outputs[id]?.runId !== out.runId) changes.push({ type: "output_changed", id, runId: out.runId });
  }
  const order = (c: GraphChange) => ("seq" in c ? c.seq : Number.MAX_SAFE_INTEGER);
  return changes.sort((x, y) => order(x) - order(y));
}

function changedFields(a: Record<string, unknown>, b: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => hashOf(a[k] ?? null) !== hashOf(b[k] ?? null)).sort();
}
