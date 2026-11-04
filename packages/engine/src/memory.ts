import type { Graph, HypothesisBlock, Id, SourceContent } from "@composer/core";
import { terms } from "./assembly/salience";

/**
 * The block a swap creates: same chain, one variable changed, the statement rewritten where the
 * old value appears. The old block is retired, never edited (Figma 05 · Swap a variable).
 */
export function swapVariable(block: HypothesisBlock, key: string, value: string, label: string): Omit<HypothesisBlock, "id"> {
  const old = block.vars.find((v) => v.key === key)?.value ?? "";
  const statement = old && block.statement.toLowerCase().includes(old.toLowerCase())
    ? block.statement.replace(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), value)
    : block.statement;
  return {
    projectId: block.projectId,
    label,
    statement,
    vars: block.vars.map((v) => (v.key === key ? { ...v, value } : v)),
    status: "testing",
    confidence: block.confidence,
    parentId: block.id,
  };
}

/** Next free chain label: H1, H2, … */
export function nextLabel(blocks: HypothesisBlock[]): string {
  const n = Math.max(0, ...blocks.map((b) => Number(/^H(\d+)$/.exec(b.label)?.[1] ?? 0)));
  return `H${n + 1}`;
}

export interface Candidate {
  value: string;
  /** How many source items back it: they mention its terms. */
  evidence: number;
  /** Where it came from: another block in the chain, or typed by the designer. */
  from: "chain" | "typed";
}

/** How many context items mention every content word of `value`. */
export function evidenceFor(value: string, contents: SourceContent[]): number {
  const want = terms(value);
  if (!want.length) return 0;
  let n = 0;
  for (const c of contents) {
    for (const item of c.items) {
      const have = new Set(terms([item.title, ...item.units.map((u) => u.text)].join(" ")));
      if (want.every((t) => have.has(t))) n++;
    }
  }
  return n;
}

/**
 * Swap candidates for one variable: values other blocks in the chain have used, plus anything
 * typed, ranked by how much evidence in the project's sources backs them.
 */
export function swapCandidates(block: HypothesisBlock, key: string, chain: HypothesisBlock[], contents: SourceContent[], typed: string[] = []): Candidate[] {
  const current = block.vars.find((v) => v.key === key)?.value.trim().toLowerCase();
  const seen = new Map<string, Candidate>();
  const add = (value: string, from: Candidate["from"]) => {
    const v = value.trim();
    if (!v || v.toLowerCase() === current || seen.has(v.toLowerCase())) return;
    seen.set(v.toLowerCase(), { value: v, evidence: evidenceFor(v, contents), from });
  };
  for (const b of chain) for (const v of b.vars) if (v.key === key) add(v.value, "chain");
  for (const t of typed) add(t, "typed");
  return [...seen.values()].sort((a, b) => b.evidence - a.evidence || a.value.localeCompare(b.value));
}

/** Points the graph's hypothesis nodes that hold `fromBlock` at `toBlock`. */
export function repointHypothesis(graph: Graph, fromBlock: Id, toBlock: Id): Graph {
  let changed = false;
  const nodes = { ...graph.nodes };
  for (const n of Object.values(graph.nodes)) {
    if (n.kind === "hypothesis" && n.blockId === fromBlock) {
      nodes[n.id] = { ...n, blockId: toBlock };
      changed = true;
    }
  }
  return changed ? { ...graph, nodes } : graph;
}
