import {
  hashOf,
  type ClaudeNode,
  type Graph,
  type Hash,
  type HypothesisBlock,
  type Id,
  type NodeOutput,
  type SourceContent,
  type TextArtifact,
  type Unit,
} from "@composer/core";
import { assemble, type AssembledPrompt, type DocInput, type Foundations, type ProjectMemory } from "./assembly/prompt";
import type { Multipliers } from "./assembly/allocate";
import { splitUnits } from "./assembly/units";
import { incoming } from "./graph-ops";
import { envKeyFor, localKey, type KeyEnv } from "./keys";
import type { LlmClient, LlmResult } from "./llm";
import { DIRECTIONS } from "./kit";
import { FIDELITIES, FRAMES, recipe, type PrototypeData } from "./recipes";

/** Everything a run reads that isn't on the canvas. */
export interface RunDeps {
  llm: LlmClient;
  readBlob: (hash: Hash) => unknown;
  env: KeyEnv;
  foundations: Foundations;
  rules: { id: string; text: string }[];
  memory: ProjectMemory;
  block: (blockId: Id) => HypothesisBlock | undefined;
  /** Locked version content for inlets. */
  version: (versionId: Id) => { content: TextArtifact; label: string } | undefined;
  multipliers?: Multipliers;
}

export class RunError extends Error {
  constructor(
    message: string,
    readonly code: "unknown_refs" | "over_budget" | "refusal" | "max_tokens" | "bad_output" | "missing",
  ) {
    super(message);
    this.name = "RunError";
  }
}

const OPTION_TEXT: Record<string, string> = {
  ...Object.fromEntries([...Object.entries(FRAMES), ...Object.entries(FIDELITIES)].map(([k, v]) => [k, v.toLowerCase()])),
  ...DIRECTIONS,
};

/** Fills `{option}` placeholders (e.g. `{frame}`) from the node's options before references resolve. */
export function fillOptions(instruction: string, options: Record<string, string>): string {
  return instruction.replace(/\{([A-Za-z][\w-]*)\}/g, (whole, key: string) =>
    key in options ? (OPTION_TEXT[options[key]!] ?? options[key]!) : whole,
  );
}

function sourceImages(content: SourceContent): { src: string; caption: string }[] {
  return content.items.filter((i) => i.image).map((i) => ({ src: i.image!, caption: i.title }));
}

function sourceUnits(content: SourceContent): { units: Unit[]; kind: string } {
  const multi = content.items.length > 1;
  const units = content.items.flatMap((item) =>
    item.units.map((u) => ({ ...u, label: u.label ?? (multi ? item.title : undefined) })).map(({ label, ...u }) => (label ? { ...u, label } : u)),
  );
  return { units, kind: content.items[0]?.kind ?? "note" };
}

/** Collects the documents and hypothesis wired into a Claude node. */
export function gatherInputs(graph: Graph, node: ClaudeNode, deps: RunDeps) {
  const docs: DocInput[] = [];
  let hypothesis: { label: string; statement: string; vars: { key: string; value: string }[] } | undefined;
  for (const e of incoming(graph, node.id)) {
    if (node.disabledInputs.includes(e.from)) continue;
    const up = graph.nodes[e.from];
    if (!up) continue;
    if (up.kind === "hypothesis") {
      const b = deps.block(up.blockId);
      if (b) hypothesis = { label: b.label, statement: b.statement, vars: b.vars };
      continue;
    }
    if (up.kind === "source") {
      const content = up.contentHash ? (deps.readBlob(up.contentHash) as SourceContent | undefined) : undefined;
      const { units, kind } = content ? sourceUnits(content) : { units: [], kind: "note" };
      const images = content ? sourceImages(content) : [];
      docs.push({ alias: up.alias, title: up.title, source: up.platform, kind, weight: up.weight, pinned: up.pinned, ...(up.why ? { why: up.why } : {}), units, ...(images.length ? { images } : {}) });
    } else if (up.kind === "claude") {
      const out = graph.outputs[up.id];
      const art = out ? (deps.readBlob(out.hash) as TextArtifact | undefined) : undefined;
      const units = art ? splitUnits(art.text, "note") : [];
      // A forked variant reads the prototype itself, not only its summary.
      const html = art?.artifact === "prototype" ? (art.data as PrototypeData | undefined)?.html : undefined;
      if (html) units.push({ label: "HTML", text: html });
      docs.push({ alias: up.alias, title: up.title, source: "claude", kind: "note", weight: "normal", pinned: false, units });
    } else if (up.kind === "output" && up.mode === "inlet" && up.versionId) {
      const v = deps.version(up.versionId);
      docs.push({
        alias: up.alias,
        title: up.title,
        source: v?.label ?? "locked output",
        kind: "note",
        weight: up.weight ?? "heavy",
        pinned: up.pinned ?? false,
        ...(up.why ? { why: up.why } : {}),
        units: v ? splitUnits(v.content.text, "note") : [],
      });
    }
  }
  const notes = notesDoc(graph, node);
  if (notes) docs.push(notes);
  return { docs, hypothesis };
}

/** Where a note sits, in words Claude can find on its own output. */
export function anchorLabel(a: NonNullable<ClaudeNode["notes"]>[number]["anchor"]): string {
  if (a.kind === "field") return a.quote ? `${a.field}: “${a.quote}”` : a.field;
  const where = [a.screen && `screen ${a.screen}`, `at ${a.x},${a.y}`].filter(Boolean).join(" ");
  return a.element ? `${where} on ${a.element}` : where;
}

/** The designer's notes on the current output, as a heavy document for the next run. */
export function notesDoc(graph: Graph, node: ClaudeNode): DocInput | undefined {
  const runId = graph.outputs[node.id]?.runId;
  const live = (node.notes ?? []).filter((n) => n.runId === runId);
  if (!live.length) return undefined;
  return {
    alias: "notes",
    title: "Designer's notes on the last output",
    source: "notes",
    kind: "note",
    weight: "heavy",
    pinned: false,
    why: "Feedback pinned to specific spots on the output. Address each one.",
    units: live.map((n) => ({ label: anchorLabel(n.anchor), text: n.text })),
  };
}

/** The exact prompt a Claude node would send now. The inspector uses this for its live budget. */
export function buildPrompt(graph: Graph, nodeId: Id, deps: RunDeps): AssembledPrompt {
  const node = graph.nodes[nodeId];
  if (!node || node.kind !== "claude") throw new RunError("Only Claude nodes run.", "missing");
  const r = recipe(node.recipe);
  const { docs, hypothesis } = gatherInputs(graph, node, deps);
  return assemble({
    phase: node.phase,
    charter: r.charter,
    foundations: deps.foundations,
    rules: deps.rules,
    memory: deps.memory,
    ...(hypothesis ? { hypothesis } : {}),
    docs,
    instruction: fillOptions(node.instruction, node.options),
    budget: node.budget,
    ...(deps.multipliers ? { multipliers: deps.multipliers } : {}),
  });
}

export interface RunOutcome {
  artifact: TextArtifact;
  artifactHash: Hash;
  output: NodeOutput;
  prompt: AssembledPrompt;
  promptHash: Hash;
  result: LlmResult;
}

/**
 * Runs one Claude node: assemble, stream, parse. Keys are taken from the graph the run started
 * with, so edits made while it streams correctly leave the node stale afterwards.
 */
export async function runClaudeNode(
  graph: Graph,
  nodeId: Id,
  runId: Id,
  deps: RunDeps,
  io: { signal: AbortSignal; onText?: (d: string) => void; onThinking?: (d: string) => void },
): Promise<RunOutcome> {
  const node = graph.nodes[nodeId] as ClaudeNode;
  const prompt = buildPrompt(graph, nodeId, deps);
  if (prompt.unknownRefs.length) {
    throw new RunError(`The instruction mentions ${prompt.unknownRefs.map((n) => `{${n}}`).join(", ")}, which nothing wired in is called.`, "unknown_refs");
  }
  if (prompt.report.overBudget) {
    throw new RunError("Heavy and pinned context alone don't fit the budget. Lighten a weight or raise the budget.", "over_budget");
  }
  const r = recipe(node.recipe);
  const keys = { localKey: localKey(graph, nodeId), envKey: envKeyFor(deps.env, node.phase) };
  const result = await deps.llm.stream(
    { model: node.model, maxTokens: 64_000, effort: node.effort, system: prompt.system, messages: prompt.messages, ...(r.schema ? { schema: r.schema } : {}) },
    { signal: io.signal, ...(io.onText ? { onText: io.onText } : {}), ...(io.onThinking ? { onThinking: io.onThinking } : {}) },
  );
  if (result.stopReason === "refusal") throw new RunError(result.refusal ?? "Claude declined this request.", "refusal");
  if (result.stopReason === "max_tokens") throw new RunError("The answer hit the output limit before it finished.", "max_tokens");

  let data: unknown;
  let text = result.text;
  if (r.schema) {
    try {
      data = JSON.parse(result.text);
    } catch {
      throw new RunError("Claude's structured answer didn't parse.", "bad_output");
    }
    text = r.render ? r.render(data) : result.text;
  }
  const artifact: TextArtifact = { v: 1, kind: "text", artifact: r.artifact, text, ...(data !== undefined ? { data } : {}) };
  const artifactHash = hashOf(artifact);
  return {
    artifact,
    artifactHash,
    output: { runId, hash: artifactHash, ...keys },
    prompt,
    promptHash: hashOf({ system: prompt.system, messages: prompt.messages }),
    result,
  };
}
