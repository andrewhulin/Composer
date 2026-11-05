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

/**
 * A short template alias from a title: "Interviews · P04, P07" → "interviews". Unique within its
 * phase and loop, which is as far as any instruction can see.
 */
export function aliasFor(title: string, graph: Graph, scope: { phase: Phase; loop: number }): string {
  const words = title
    .toLowerCase()
    .replace(/[“”"'’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !["the", "a", "an", "of", "and"].includes(w))
    .slice(0, 2);
  const base = words.join("-") || "source";
  const taken = new Set(Object.values(graph.nodes).filter((n) => n.phase === scope.phase && n.loop === scope.loop).map((n) => n.alias));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Names other recipes' instructions use to refer to this one, e.g. the verdict's {strategy}. */
const RECIPE_ALIAS: Partial<Record<RecipeId, string>> = { test_strategy: "strategy", release_story: "story", pr_description: "pr" };

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
    alias: aliasFor(RECIPE_ALIAS[recipeId] ?? t, graph, { phase, loop }),
    position,
    lineageId: id,
    recipe: recipeId,
    templateVersionId: `${recipeId}@1`,
    instruction: r.defaultInstruction,
    model: DEFAULT_MODEL,
    effort: r.effort,
    budget: DEFAULT_BUDGET,
    disabledInputs: [],
    options: recipeId === "draft_statement" ? { frame: "hypothesis" } : recipeId === "prototype" ? { fidelity: "wireframe" } : {},
  };
}

export function newOutput(graph: Graph, phase: Phase, loop: number, position: { x: number; y: number }, familyId: Id = ulid()): NewNode<OutputNode> {
  const id = ulid();
  const title = PHASE_INFO[phase].output;
  return { id, kind: "output", mode: "output", phase, loop, title, alias: aliasFor(title, graph, { phase, loop }), position, lineageId: id, familyId };
}

export function newInlet(graph: Graph, phase: Phase, loop: number, from: { familyId: Id; versionId: Id; phase: Phase }, position: { x: number; y: number }): NewNode<OutputNode> {
  const id = ulid();
  const title = PHASE_INFO[from.phase].output;
  const ALIAS: Partial<Record<Phase, string>> = { understand: "insights", define: "statement", build: "prototype", validate: "verdict" };
  const alias = ALIAS[from.phase] ?? aliasFor(title, graph, { phase, loop });
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
    alias: aliasFor(title, graph, { phase, loop }),
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

const RECIPE_FOR: Partial<Record<Phase, RecipeId>> = { understand: "synthesize_insights", define: "draft_statement", build: "prototype", validate: "test_strategy", share: "release_story" };

/** Where evidence dropped into a phase is wired: Validate's verdict step, else the phase's first step. */
export function evidenceTarget(graph: Graph, phase: Phase, loop: number): ClaudeNode | undefined {
  if (phase === "validate") {
    const verdict = Object.values(graph.nodes).find((n): n is ClaudeNode => n.kind === "claude" && n.recipe === "verdict" && n.phase === phase && n.loop === loop);
    if (verdict) return verdict;
  }
  return primaryClaude(graph, phase, loop);
}

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
  let last: { id: Id } = claude;
  if (phase === "validate") {
    // Validate has two steps: the strategy, then the verdict it's judged by.
    const verdict = newClaude(g, phase, loop, "verdict", { x: 920, y: 248 });
    g = addNode(g, verdict);
    const r = connect(g, claude.id, verdict.id, ulid);
    if (r.ok) g = r.graph;
    last = verdict;
  }
  if (phase === "share") {
    // The PR is a sibling of the story: same facts, different reader, rerun on its own.
    const pr = newClaude(g, phase, loop, "pr_description", { x: 920, y: 520 });
    g = addNode(g, pr);
    const r = connect(g, claude.id, pr.id, ulid);
    if (r.ok) g = r.graph;
  }
  const out = newOutput(g, phase, loop, { x: phase === "validate" ? 1240 : 920, y: 264 });
  g = addNode(g, out);
  const r1 = connect(g, last.id, out.id, ulid);
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
