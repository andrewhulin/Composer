import type { BetaMessageParam, BetaTextBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Effort, Phase, RecipeId, TextArtifact } from "@composer/core";
import { briefBlock, rulesBlock } from "./assembly/prompt";
import type { LlmClient, LlmRequest } from "./llm";
import { recipe } from "./recipes";

/**
 * Replay: before a proposed rule or principle goes live, rerun past briefs with it and compare.
 * A run's prompt is stored whole ({system, messages}), so a replay changes exactly one block and
 * keeps everything else the designer saw, which makes the side by side a fair test.
 */

export interface StoredPrompt {
  system: BetaTextBlockParam[];
  messages: BetaMessageParam[];
}

/** A past brief kept for replay: the prompt that ran and the output it produced. */
export interface ReplayCase {
  id: string;
  phase: Phase;
  recipe: RecipeId;
  runId: string;
  name: string;
  promptHash: string;
  outputHash: string;
}

export type ReplayPick = "baseline" | "candidate" | "same";

/** The candidate change a replay tests. Design system proposals don't replay; they lint instead. */
export type ReplayCandidate =
  | { kind: "rule"; phase: Phase; id: string; text: string }
  | { kind: "principle"; change: "sharpened" | "added" | "retired" | "reworded"; n: number | null; text: string }
  | { kind: "brief"; version: string; principles: { text: string; sources: string[] }[] };

const RULES_INDEX = 2;
const FOUNDATIONS_INDEX = 1;

function replaceBlock(p: StoredPrompt, index: number, text: string): StoredPrompt {
  const system = p.system.map((b, i) => (i === index ? { ...b, text } : b));
  return { system, messages: p.messages };
}

/** The same prompt with one more learned rule, as it would read once the rule is kept. */
export function withCandidateRule(p: StoredPrompt, phase: Phase, rule: { id: string; text: string }): StoredPrompt {
  const block = p.system[RULES_INDEX]?.text ?? "";
  const existing = [...block.matchAll(/^\[([^\]]+)\] (.*)$/gm)].map((m) => ({ id: m[1]!, text: m[2]! })).filter((r) => r.id !== rule.id);
  return replaceBlock(p, RULES_INDEX, rulesBlock(phase, [...existing, rule]));
}

/** The same prompt with one principle added, rewritten or retired in the philosophy block. */
export function withCandidatePrinciple(p: StoredPrompt, change: Extract<ReplayCandidate, { kind: "principle" }>): StoredPrompt {
  const block = p.system[FOUNDATIONS_INDEX]?.text ?? "";
  const m = /<philosophy rev="(\d+)">\n([\s\S]*?)(\n\nIn the designer's words:[\s\S]*?)?\n<\/philosophy>/.exec(block);
  if (!m) {
    if (change.change === "retired") return p;
    const philosophy = `<philosophy rev="candidate">\n01. ${change.text} (forming)\n</philosophy>`;
    const text = block.includes("<design_system")
      ? block.replace("<design_system", `${philosophy}\n\n<design_system`)
      : `Always-on foundations. Follow the design philosophy; build only with the design system.\n\n${philosophy}`;
    return replaceBlock(p, FOUNDATIONS_INDEX, text);
  }
  const lines = m[2]!.split("\n");
  const at = (n: number | null) => lines.findIndex((l) => n !== null && Number.parseInt(l, 10) === n);
  const idx = at(change.n);
  if (change.change === "retired") {
    if (idx >= 0) lines.splice(idx, 1);
  } else if ((change.change === "sharpened" || change.change === "reworded") && idx >= 0) {
    const strength = /\(([^)]+)\)\s*$/.exec(lines[idx]!)?.[1] ?? "forming";
    lines[idx] = `${String(change.n).padStart(2, "0")}. ${change.text} (${strength})`;
  } else {
    const next = lines.reduce((mx, l) => Math.max(mx, Number.parseInt(l, 10) || 0), 0) + 1;
    lines.push(`${String(next).padStart(2, "0")}. ${change.text} (forming)`);
  }
  const replaced = `<philosophy rev="${m[1]}">\n${lines.join("\n")}${m[3] ?? ""}\n</philosophy>`;
  return replaceBlock(p, FOUNDATIONS_INDEX, block.replace(m[0], replaced));
}

/** The same prompt with the Craft Brief swapped for a candidate (or added, if it had none). */
export function withCandidateBrief(p: StoredPrompt, c: Extract<ReplayCandidate, { kind: "brief" }>): StoredPrompt {
  const block = p.system[FOUNDATIONS_INDEX]?.text ?? "";
  const next = briefBlock({ version: c.version, principles: c.principles });
  const existing = /<craft_brief[^>]*>[\s\S]*?<\/craft_brief>/.exec(block);
  if (existing) return replaceBlock(p, FOUNDATIONS_INDEX, block.replace(existing[0], next));
  const text = block.startsWith("No design system") ? `Always-on foundations. Follow the design philosophy; build only with the design system.\n\n${next}` : `${block}\n\n${next}`;
  return replaceBlock(p, FOUNDATIONS_INDEX, text);
}

export function withCandidate(p: StoredPrompt, c: ReplayCandidate): StoredPrompt {
  return c.kind === "rule" ? withCandidateRule(p, c.phase, c) : c.kind === "brief" ? withCandidateBrief(p, c) : withCandidatePrinciple(p, c);
}

/** The request that reruns a stored prompt, with the recipe's schema so the output renders the same way. */
export function replayRequest(p: StoredPrompt, recipeId: RecipeId, model: string, effort: Effort = "high"): LlmRequest {
  const r = recipe(recipeId);
  return { model, maxTokens: 64_000, effort, system: p.system, messages: p.messages, ...(r.schema ? { schema: r.schema } : {}) };
}

/** Runs one replay and returns the artifact it would have produced. */
export async function replayOne(llm: LlmClient, p: StoredPrompt, recipeId: RecipeId, model: string, signal: AbortSignal): Promise<TextArtifact> {
  const r = recipe(recipeId);
  const res = await llm.stream(replayRequest(p, recipeId, model), { signal });
  if (res.stopReason === "refusal") throw new Error(res.refusal ?? "Claude declined the replay.");
  if (!r.schema) return { v: 1, kind: "text", artifact: r.artifact, text: res.text };
  const data = JSON.parse(res.text) as unknown;
  return { v: 1, kind: "text", artifact: r.artifact, text: r.render ? r.render(data) : res.text, data };
}

export interface ReplayTally {
  candidate: number;
  baseline: number;
  same: number;
  pending: number;
  /** One line for the proposal card, e.g. "Candidate preferred on 3 of 4 briefs". */
  line: string;
  /** True when the candidate won more briefs than it lost and nothing is left to judge. */
  favours: boolean;
}

export function tallyReplay(picks: (ReplayPick | null | undefined)[]): ReplayTally {
  const t = { candidate: 0, baseline: 0, same: 0, pending: 0 };
  for (const p of picks) {
    if (p) t[p]++;
    else t.pending++;
  }
  const judged = t.candidate + t.baseline + t.same;
  const line = !picks.length
    ? "No briefs replayed yet"
    : t.pending === picks.length
      ? `${picks.length} brief${picks.length === 1 ? "" : "s"} replayed, none judged yet`
      : `Candidate preferred on ${t.candidate} of ${judged}${t.same ? `, ${t.same} the same` : ""}${t.pending ? `, ${t.pending} to judge` : ""}`;
  return { ...t, line, favours: t.pending === 0 && t.candidate > t.baseline };
}

// ── Pairwise picks as Reflect evidence ──────────────────────────────────────

/** One pairwise pick between two runs of the same phase: the designer preferred `winner`. */
export interface PickedPair {
  phase: Phase;
  winner: { runId: string; instruction: string; output: string };
  loser: { runId: string; instruction: string; output: string };
  note?: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** Picks rendered for the Reflect prompt: preferences are sharper evidence than absolute scores. */
export function pairsBlock(pairs: PickedPair[]): string {
  if (!pairs.length) return "";
  const byPhase = new Map<Phase, PickedPair[]>();
  for (const p of pairs) byPhase.set(p.phase, [...(byPhase.get(p.phase) ?? []), p]);
  return [...byPhase]
    .map(
      ([phase, ps]) =>
        `<pairs phase="${phase}" n="${ps.length}">\n${ps
          .slice(-20)
          .map((p) => `<pair${p.note ? ` note="${p.note.replace(/"/g, "'")}"` : ""}>\n<preferred run="${p.winner.runId}">${clip(p.winner.output, 900)}</preferred>\n<over run="${p.loser.runId}">${clip(p.loser.output, 900)}</over>\n</pair>`)
          .join("\n")}\n</pairs>`,
    )
    .join("\n\n");
}

/** Phases with enough picks to learn from on their own, even without scored runs. */
export function pickedPhases(pairs: PickedPair[], min = 5): Phase[] {
  const counts = new Map<Phase, number>();
  for (const p of pairs) counts.set(p.phase, (counts.get(p.phase) ?? 0) + 1);
  return [...counts].filter(([, n]) => n >= min).map(([phase]) => phase);
}
