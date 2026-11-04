import {
  PHASE_INFO,
  ulid,
  type ClaudeNode,
  type Graph,
  type GraphNode,
  type Id,
  type OutputNode,
  type Phase,
  type RecipeId,
  type SourceNode,
  type SourcePlatform,
} from "@composer/core";
import { addNode, connect, recipe } from "@composer/engine";

export const DEFAULT_MODEL = "claude-opus-5-5";
export const MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
] as const;
export const DEFAULT_BUDGET = 200_000;

type NewNode<T extends GraphNode> = Omit<T, "createdSeq">;

/** A short, unique template alias from a title: "Interviews · P04, P07" → "interviews". */
export function aliasFor(title: string, graph: Graph): string {
  const words = title
    .toLowerCase()
    .replace(/[“”"'’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !["the", "a", "an", "of", "and"].includes(w))
    .slice(0, 2);
  const base = words.join("-") || "source";
  const taken = new Set(Object.values(graph.nodes).map((n) => n.alias));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export function newClaude(graph: Graph, phase: Phase, loop: number, recipeId: RecipeId, position: { x: number; y: number }, title?: string): NewNode<ClaudeNode> {
  const r = recipe(recipeId);
  const id = ulid();
  const t = title ?? r.title;
  return {
    id,
    kind: "claude",
    phase,
    loop,
    title: t,
    alias: aliasFor(t, graph),
    position,
    lineageId: id,
    recipe: recipeId,
    templateVersionId: `${recipeId}@1`,
    instruction: r.defaultInstruction,
    model: DEFAULT_MODEL,
    effort: r.effort,
    budget: DEFAULT_BUDGET,
    disabledInputs: [],
    options: recipeId === "draft_statement" ? { frame: "hypothesis" } : {},
  };
}

export function newOutput(graph: Graph, phase: Phase, loop: number, position: { x: number; y: number }, familyId: Id = ulid()): NewNode<OutputNode> {
  const id = ulid();
  const title = PHASE_INFO[phase].output;
  return { id, kind: "output", mode: "output", phase, loop, title, alias: aliasFor(title, graph), position, lineageId: id, familyId };
}

export function newInlet(graph: Graph, phase: Phase, loop: number, from: { familyId: Id; versionId: Id; phase: Phase }, position: { x: number; y: number }): NewNode<OutputNode> {
  const id = ulid();
  const title = PHASE_INFO[from.phase].output;
  const alias = from.phase === "understand" ? "insights" : aliasFor(title, graph);
  return {
    id,
    kind: "output",
    mode: "inlet",
    phase,
    loop,
    title,
    alias,
    position,
    lineageId: id,
    familyId: from.familyId,
    versionId: from.versionId,
    weight: "heavy",
    pinned: false,
  };
}

export function newSource(graph: Graph, phase: Phase, loop: number, platform: SourcePlatform, title: string, contentHash: string, position: { x: number; y: number }): NewNode<SourceNode> {
  const id = ulid();
  return {
    id,
    kind: "source",
    phase,
    loop,
    title,
    alias: aliasFor(title, graph),
    position,
    lineageId: id,
    platform,
    contentHash,
    config: {},
    weight: "normal",
    pinned: false,
  };
}

/** The node a new source in this phase should feed, if any: the phase's first Claude node. */
export function primaryClaude(graph: Graph, phase: Phase, loop: number): ClaudeNode | undefined {
  return Object.values(graph.nodes)
    .filter((n): n is ClaudeNode => n.kind === "claude" && n.phase === phase && n.loop === loop)
    .sort((a, b) => a.createdSeq - b.createdSeq)[0];
}

/** Where the next source card goes: a column grid on the left of the phase. */
export function nextSourcePosition(graph: Graph, phase: Phase, loop: number): { x: number; y: number } {
  const n = Object.values(graph.nodes).filter((x) => x.kind === "source" && x.phase === phase && x.loop === loop).length;
  const col = Math.floor(n / 5);
  const row = n % 5;
  return { x: 72 + col * 248, y: 96 + row * 112 };
}

const RECIPE_FOR: Partial<Record<Phase, RecipeId>> = { understand: "synthesize_insights", define: "draft_statement" };

/**
 * Lays out a phase's spine: [inlet →] Claude → Output. Understand starts with no inlet (it is the
 * start of the loop); later phases start from the previous phase's locked output.
 */
export function scaffoldPhase(graph: Graph, phase: Phase, loop: number, inlet?: { familyId: Id; versionId: Id; phase: Phase }): Graph {
  const recipeId = RECIPE_FOR[phase];
  if (!recipeId) return graph;
  let g = graph;
  const claude = newClaude(g, phase, loop, recipeId, { x: 600, y: 248 });
  g = addNode(g, claude);
  const out = newOutput(g, phase, loop, { x: 920, y: 264 });
  g = addNode(g, out);
  const r1 = connect(g, claude.id, out.id, ulid);
  if (r1.ok) g = r1.graph;
  if (inlet) {
    const node = newInlet(g, phase, loop, inlet, { x: 72, y: 96 });
    g = addNode(g, node);
    const r2 = connect(g, node.id, claude.id, ulid);
    if (r2.ok) g = r2.graph;
  }
  return g;
}

export function phaseHasNodes(graph: Graph, phase: Phase, loop: number): boolean {
  return Object.values(graph.nodes).some((n) => n.phase === phase && n.loop === loop);
}
