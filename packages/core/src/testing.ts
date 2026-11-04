/** Builders for tests across packages. Not used by app code. */
import type { Phase } from "./phases";
import type { ClaudeNode, Edge, GraphNode, HypothesisNode, OutputNode, SourceNode } from "./types";
import { emptyGraph, type Graph } from "./graph";

let seq = 0;
const nextSeq = () => ++seq;

const base = (id: string, phase: Phase) => ({
  id,
  phase,
  loop: 1,
  title: id,
  alias: id,
  position: { x: 0, y: 0 },
  createdSeq: nextSeq(),
  lineageId: id,
});

export function source(id: string, over: Partial<SourceNode> = {}): SourceNode {
  return {
    ...base(id, over.phase ?? "understand"),
    kind: "source",
    platform: "paste",
    contentHash: `content-${id}`,
    config: {},
    weight: "normal",
    pinned: false,
    ...over,
  };
}

export function claude(id: string, over: Partial<ClaudeNode> = {}): ClaudeNode {
  return {
    ...base(id, over.phase ?? "understand"),
    kind: "claude",
    recipe: "synthesize_insights",
    templateVersionId: "tpl-1",
    instruction: "Synthesize.",
    model: "claude-opus-5-5",
    effort: "high",
    budget: 200_000,
    disabledInputs: [],
    options: {},
    ...over,
  };
}

export function hypothesis(id: string, over: Partial<HypothesisNode> = {}): HypothesisNode {
  return { ...base(id, over.phase ?? "define"), kind: "hypothesis", blockId: `block-${id}`, ...over };
}

export function output(id: string, over: Partial<OutputNode> = {}): OutputNode {
  return { ...base(id, over.phase ?? "understand"), kind: "output", mode: "output", familyId: `fam-${id}`, ...over };
}

export function wire(from: string, to: string, toPort: string, fromPort = "out"): Edge {
  return { id: `${from}->${to}:${toPort}`, from, fromPort, to, toPort, createdSeq: nextSeq() };
}

export function graphOf(nodes: GraphNode[], edges: Edge[] = []): Graph {
  const g = emptyGraph();
  for (const n of nodes) g.nodes[n.id] = n;
  g.edges = edges;
  g.seq = seq + 1;
  return g;
}
