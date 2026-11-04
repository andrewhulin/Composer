import type { Edge, Graph, GraphNode, Id, IdFactory } from "@composer/core";
import { inputPorts, matchPort, outputType } from "./ports";

export type ConnectResult = { ok: true; graph: Graph; edge: Edge } | { ok: false; reason: string };

export function incoming(graph: Graph, id: Id): Edge[] {
  return graph.edges.filter((e) => e.to === id);
}

export function outgoing(graph: Graph, id: Id): Edge[] {
  return graph.edges.filter((e) => e.from === id);
}

/** True when `to` can already reach `from`, so a from→to wire would close a loop. */
export function wouldCycle(graph: Graph, from: Id, to: Id): boolean {
  const stack = [to];
  const seen = new Set<Id>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === from) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of outgoing(graph, id)) stack.push(e.to);
  }
  return false;
}

/**
 * Checks whether `from` can be wired into `to`. When `toPort` is omitted the matching port is
 * picked, the way dropping a node near another snaps to whichever port takes it.
 */
export function canConnect(
  graph: Graph,
  fromId: Id,
  toId: Id,
  toPort?: string,
): { ok: true; port: string } | { ok: false; reason: string } {
  const from = graph.nodes[fromId];
  const to = graph.nodes[toId];
  if (!from || !to) return { ok: false, reason: "That node no longer exists." };
  if (fromId === toId) return { ok: false, reason: "A node can't feed itself." };
  if (from.phase !== to.phase || from.loop !== to.loop) {
    return { ok: false, reason: "Wires stay inside a phase. Lock the output to hand it to the next phase." };
  }
  const type = outputType(from);
  let portId: string;
  if (toPort) {
    const port = inputPorts(to).find((p) => p.id === toPort);
    if (!port || !port.accepts.includes(type)) {
      const match = matchPort(type, to);
      return { ok: false, reason: "reason" in match ? match.reason : `Use the ${match.port.label} port.` };
    }
    portId = port.id;
  } else {
    const match = matchPort(type, to);
    if ("reason" in match) return { ok: false, reason: match.reason };
    portId = match.port.id;
  }
  const port = inputPorts(to).find((p) => p.id === portId)!;
  const existing = incoming(graph, toId).filter((e) => e.toPort === portId);
  if (existing.some((e) => e.from === fromId)) return { ok: false, reason: "Already wired." };
  if (!port.many && existing.length) return { ok: false, reason: `The ${port.label} port takes one input. Remove the existing wire first.` };
  if (wouldCycle(graph, fromId, toId)) {
    return { ok: false, reason: "That wire would make a loop. Validate loops back through a new Understand, not a wire." };
  }
  return { ok: true, port: portId };
}

export function connect(graph: Graph, fromId: Id, toId: Id, ids: IdFactory, toPort?: string): ConnectResult {
  const check = canConnect(graph, fromId, toId, toPort);
  if (!check.ok) return check;
  const edge: Edge = { id: ids(), from: fromId, fromPort: "out", to: toId, toPort: check.port, createdSeq: graph.seq };
  return { ok: true, edge, graph: { ...graph, edges: [...graph.edges, edge], seq: graph.seq + 1 } };
}

export function disconnect(graph: Graph, edgeId: Id): Graph {
  return { ...graph, edges: graph.edges.filter((e) => e.id !== edgeId) };
}

/** Adds a node, stamping its creation sequence. */
export function addNode<T extends GraphNode>(graph: Graph, node: Omit<T, "createdSeq">): Graph {
  const stamped = { ...node, createdSeq: graph.seq } as T;
  return { ...graph, nodes: { ...graph.nodes, [stamped.id]: stamped }, seq: graph.seq + 1 };
}

export function updateNode<T extends GraphNode>(graph: Graph, id: Id, patch: Partial<T>): Graph {
  const node = graph.nodes[id];
  if (!node) return graph;
  return { ...graph, nodes: { ...graph.nodes, [id]: { ...node, ...patch } as GraphNode } };
}

export function removeNode(graph: Graph, id: Id): Graph {
  const { [id]: _removed, ...nodes } = graph.nodes;
  const { [id]: _out, ...outputs } = graph.outputs;
  return { ...graph, nodes, outputs, edges: graph.edges.filter((e) => e.from !== id && e.to !== id) };
}

/** Nodes that feed `id`, transitively. */
export function ancestors(graph: Graph, id: Id): Set<Id> {
  const out = new Set<Id>();
  const stack = incoming(graph, id).map((e) => e.from);
  while (stack.length) {
    const n = stack.pop()!;
    if (out.has(n)) continue;
    out.add(n);
    for (const e of incoming(graph, n)) stack.push(e.from);
  }
  return out;
}

/** Nodes fed by `id`, transitively. */
export function descendants(graph: Graph, id: Id): Set<Id> {
  const out = new Set<Id>();
  const stack = outgoing(graph, id).map((e) => e.to);
  while (stack.length) {
    const n = stack.pop()!;
    if (out.has(n)) continue;
    out.add(n);
    for (const e of outgoing(graph, n)) stack.push(e.to);
  }
  return out;
}

/** Topological order of the given ids (all nodes when omitted), ties broken by creation order. */
export function topoOrder(graph: Graph, only?: Iterable<Id>): Id[] {
  const ids = new Set(only ?? Object.keys(graph.nodes));
  const indeg = new Map<Id, number>();
  for (const id of ids) indeg.set(id, 0);
  for (const e of graph.edges) if (ids.has(e.from) && ids.has(e.to)) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const bySeq = (a: Id, b: Id) => (graph.nodes[a]?.createdSeq ?? 0) - (graph.nodes[b]?.createdSeq ?? 0);
  const ready = [...ids].filter((id) => indeg.get(id) === 0).sort(bySeq);
  const order: Id[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const e of outgoing(graph, id)) {
      if (!ids.has(e.to)) continue;
      const d = (indeg.get(e.to) ?? 0) - 1;
      indeg.set(e.to, d);
      if (d === 0) {
        ready.push(e.to);
        ready.sort(bySeq);
      }
    }
  }
  return order;
}
