import { hashParts, type ClaudeNode, type Graph, type Hash, type Id, type Phase } from "@composer/core";
import { descendants, incoming } from "./graph-ops";

/** Things outside the graph that every prompt depends on: foundations and learned rules. */
export interface KeyEnv {
  /** Foundation version ids in force (design system, philosophy). */
  foundations: string[];
  /** Active craft rule ids per phase. */
  rules: Partial<Record<Phase, string[]>>;
}

export const emptyEnv: KeyEnv = { foundations: [], rules: {} };

export function envKeyFor(env: KeyEnv, phase: Phase): Hash {
  return hashParts("env", [...env.foundations].sort(), [...(env.rules[phase] ?? [])].sort());
}

type Memo = Map<Id, Hash>;

/** What a node hands to whatever it is wired into. */
function contribution(graph: Graph, id: Id, memo: Memo): Hash {
  const node = graph.nodes[id];
  if (!node) return "missing";
  switch (node.kind) {
    case "source":
      return hashParts("source", node.contentHash, node.weight, node.pinned, node.why ?? null);
    case "hypothesis":
      return hashParts("hypothesis", node.blockId);
    case "output":
      return node.mode === "inlet"
        ? hashParts("inlet", node.versionId ?? null, node.weight ?? "normal", node.pinned ?? false, node.why ?? null)
        : hashParts("output", node.familyId);
    case "claude": {
      const out = graph.outputs[id];
      return out ? out.hash : hashParts("pending", localKey(graph, id, memo));
    }
  }
}

function claudeEntry(node: ClaudeNode) {
  return {
    recipe: node.recipe,
    template: node.templateVersionId,
    instruction: node.instruction,
    model: node.model,
    effort: node.effort,
    budget: node.budget,
    disabled: [...node.disabledInputs].sort(),
    options: node.options,
  };
}

/**
 * The cache key of a node's own inputs, without foundations or rules. If it differs from the key
 * of the last successful run, the node is stale.
 */
export function localKey(graph: Graph, id: Id, memo: Memo = new Map()): Hash {
  const cached = memo.get(id);
  if (cached) return cached;
  const node = graph.nodes[id];
  if (!node) return "missing";
  let key: Hash;
  if (node.kind === "claude") {
    const inputs = incoming(graph, id)
      .filter((e) => !node.disabledInputs.includes(e.from))
      .map((e) => ({ port: e.toPort, alias: graph.nodes[e.from]?.alias ?? "", from: e.from, c: contribution(graph, e.from, memo) }))
      .sort((a, b) => a.port.localeCompare(b.port) || a.alias.localeCompare(b.alias) || a.from.localeCompare(b.from))
      .map(({ port, alias, c }) => [port, alias, c]);
    key = hashParts("claude", claudeEntry(node), inputs);
  } else {
    key = contribution(graph, id, memo);
  }
  memo.set(id, key);
  return key;
}

export type NodeStatus = "never_run" | "fresh" | "stale" | "stale_env";

/**
 * Status of a Claude node. Stale when its inputs changed since the last run or anything upstream
 * is stale; stale_env when only foundations or rules changed (a softer badge).
 */
export function claudeStatus(graph: Graph, id: Id, env: KeyEnv, memo: Memo = new Map(), seen = new Map<Id, NodeStatus>()): NodeStatus {
  const prior = seen.get(id);
  if (prior) return prior;
  const node = graph.nodes[id];
  if (!node || node.kind !== "claude") return "fresh";
  const out = graph.outputs[id];
  let status: NodeStatus;
  if (!out) status = "never_run";
  else if (out.localKey !== localKey(graph, id, memo)) status = "stale";
  else {
    const upstreamStale = incoming(graph, id).some((e) => {
      const up = graph.nodes[e.from];
      if (!up || up.kind !== "claude" || node.disabledInputs.includes(e.from)) return false;
      const s = claudeStatus(graph, e.from, env, memo, seen);
      return s === "stale" || s === "never_run";
    });
    status = upstreamStale ? "stale" : out.envKey !== envKeyFor(env, node.phase) ? "stale_env" : "fresh";
  }
  seen.set(id, status);
  return status;
}

/** Statuses for every Claude node, sharing one memo. */
export function allStatuses(graph: Graph, env: KeyEnv): Record<Id, NodeStatus> {
  const memo: Memo = new Map();
  const seen = new Map<Id, NodeStatus>();
  const out: Record<Id, NodeStatus> = {};
  for (const node of Object.values(graph.nodes)) if (node.kind === "claude") out[node.id] = claudeStatus(graph, node.id, env, memo, seen);
  return out;
}

export interface BlastRadius {
  /** Claude nodes that would need to rerun. */
  stale: Id[];
  /** Output nodes whose locked version would be superseded. */
  relock: Id[];
}

/**
 * What a change would touch, computed before anything runs, so the canvas can paint the blast
 * radius amber first (Figma 05 · Swap a variable).
 */
export function blastRadius(before: Graph, after: Graph): BlastRadius {
  const m1: Memo = new Map();
  const m2: Memo = new Map();
  const changed = new Set<Id>();
  for (const [id, node] of Object.entries(after.nodes)) {
    if (!before.nodes[id] || localKey(before, id, m1) !== localKey(after, id, m2)) changed.add(id);
    else if (node.kind !== "claude" && contribution(before, id, m1) !== contribution(after, id, m2)) changed.add(id);
  }
  const touched = new Set<Id>();
  for (const id of changed) {
    touched.add(id);
    for (const d of descendants(after, id)) touched.add(d);
  }
  const stale: Id[] = [];
  const relock: Id[] = [];
  for (const id of touched) {
    const node = after.nodes[id];
    if (node?.kind === "claude") stale.push(id);
    if (node?.kind === "output" && node.mode === "output") relock.push(id);
  }
  return { stale: stale.sort(), relock: relock.sort() };
}

/** Lock state of an Output node, given the content hash of its latest locked version. */
export function outputLockState(graph: Graph, id: Id, lockedHash: Hash | undefined): "empty" | "draft" | "locked" | "newer_available" {
  const edge = incoming(graph, id)[0];
  const text = edge ? graph.outputs[edge.from]?.hash : undefined;
  if (!lockedHash) return text ? "draft" : "empty";
  return text && text !== lockedHash ? "newer_available" : "locked";
}
