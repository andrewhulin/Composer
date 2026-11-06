import type { RecipeId } from "@composer/core";
import type { LlmRequest, LlmUsage } from "./llm";

/**
 * Model and resource routing. Opus 5.5 keeps every call that decides something; routine work
 * moves to Sonnet 5.5 or Haiku 5.5, which consult Opus through the advisor tool. The table is
 * versioned like a foundation, and a change replays the golden set before it goes live.
 */

export const OPUS = "claude-opus-5-5";
export const SONNET = "claude-sonnet-5-5";
export const HAIKU = "claude-haiku-5-5";
export type ModelId = typeof OPUS | typeof SONNET | typeof HAIKU;
export const MODEL_IDS: ModelId[] = [HAIKU, SONNET, OPUS];
export const MODEL_LABEL: Record<ModelId, string> = { [OPUS]: "Opus 5.5", [SONNET]: "Sonnet 5.5", [HAIKU]: "Haiku 5.5" };

/** Every kind of Claude call Composer makes: the seven recipes and the craft jobs around them. */
export type Task = RecipeId | "compile" | "review" | "reflect" | "judge";
export const RECIPE_TASKS: RecipeId[] = ["synthesize_insights", "draft_statement", "prototype", "test_strategy", "verdict", "release_story", "pr_description"];
export const TASKS: Task[] = [...RECIPE_TASKS, "compile", "review", "reflect", "judge"];

export const TASK_LABEL: Record<Task, string> = {
  synthesize_insights: "Understand · synthesize insights",
  draft_statement: "Define · draft the statement",
  prototype: "Build · prototype variants",
  test_strategy: "Validate · test strategy",
  verdict: "Validate · verdict",
  release_story: "Share · release story",
  pr_description: "Share · PR description",
  compile: "Skills · compile the Craft Brief",
  review: "Skills · on-demand reviews",
  reflect: "Foundations · reflect on scored runs",
  judge: "Evals · judge replays",
};

export interface Route {
  model: ModelId;
  /** Sonnet and Haiku runs may consult Opus 5.5 through the advisor tool. */
  advisor: boolean;
}

export interface RouterTable {
  v: 1;
  routes: Record<Task, Route>;
}

/** Judgment stays on Opus; drafts and generation move to Sonnet with Opus as advisor. */
export const DEFAULT_ROUTES: Record<Task, Route> = {
  synthesize_insights: { model: SONNET, advisor: true },
  draft_statement: { model: OPUS, advisor: false },
  prototype: { model: SONNET, advisor: true },
  test_strategy: { model: OPUS, advisor: false },
  verdict: { model: OPUS, advisor: false },
  release_story: { model: SONNET, advisor: true },
  pr_description: { model: HAIKU, advisor: true },
  compile: { model: OPUS, advisor: false },
  review: { model: OPUS, advisor: false },
  reflect: { model: OPUS, advisor: false },
  judge: { model: OPUS, advisor: false },
};

export const defaultTable = (): RouterTable => ({ v: 1, routes: { ...DEFAULT_ROUTES } });

/** The route for a task. Opus never gets an advisor: nothing outranks it in this lineup. */
export function routeFor(table: RouterTable | null, task: Task): Route {
  const r = table?.routes[task] ?? DEFAULT_ROUTES[task];
  return { model: r.model, advisor: r.model !== OPUS && r.advisor };
}

/** A node without a pin follows the router. Nodes from before routing that chose a model kept it. */
export const isPinned = (node: { model: string; modelPinned?: boolean }): boolean => node.modelPinned ?? node.model !== OPUS;

/**
 * The route one node runs on: its pin, else the tier a low score moved it to, else the table.
 * A pinned Sonnet or Haiku still consults Opus, as every run below Opus does.
 */
export function effectiveRoute(table: RouterTable | null, node: { recipe: RecipeId; model: string; modelPinned?: boolean; escalation?: { model: string } }): Route & { source: "pinned" | "escalated" | "router" } {
  if (isPinned(node)) {
    const model = isModelId(node.model) ? node.model : OPUS;
    return { model, advisor: model !== OPUS, source: "pinned" };
  }
  if (node.escalation && isModelId(node.escalation.model)) return { model: node.escalation.model, advisor: node.escalation.model !== OPUS, source: "escalated" };
  return { ...routeFor(table, node.recipe), source: "router" };
}

/**
 * What the router adds to a recipe's environment key. Plain Opus adds nothing, so keys from
 * before routing still match; a recipe moved to Sonnet or Haiku reads as a changed environment.
 */
export function routeTags(table: RouterTable | null): Partial<Record<RecipeId, string>> {
  const out: Partial<Record<RecipeId, string>> = {};
  for (const t of RECIPE_TASKS) {
    const r = routeFor(table, t);
    if (r.model !== OPUS) out[t] = `${r.model}${r.advisor ? "+advisor" : ""}`;
  }
  return out;
}

/** One tier up: Haiku → Sonnet → Opus. Opus has nowhere to go. */
export const nextTier = (m: ModelId): ModelId | null => (m === HAIKU ? SONNET : m === SONNET ? OPUS : null);
export const isModelId = (m: string): m is ModelId => (MODEL_IDS as string[]).includes(m);

/** Tasks whose route differs between two tables: the ones a change has to replay. */
export function changedTasks(a: RouterTable | null, b: RouterTable): Task[] {
  return TASKS.filter((t) => {
    const x = routeFor(a, t);
    const y = routeFor(b, t);
    return x.model !== y.model || x.advisor !== y.advisor;
  });
}

// ── cost ────────────────────────────────────────────────────────────────────

/** USD per million tokens, from platform.claude.com/docs/en/about-claude/pricing (Nov 2026). */
export interface Rates {
  input: number;
  write5m: number;
  write1h: number;
  read: number;
  output: number;
}
export const RATES: Record<ModelId, Rates> = {
  [OPUS]: { input: 4, write5m: 5, write1h: 8, read: 0.2, output: 20 },
  [SONNET]: { input: 2, write5m: 2.5, write1h: 4, read: 0.1, output: 10 },
  [HAIKU]: { input: 0.1, write5m: 0.125, write1h: 0.2, read: 0.01, output: 0.5 },
};
/** Haiku 5.5 bills a long prompt (over 100K tokens) at higher rates. */
const HAIKU_LONG: Rates = { input: 0.5, write5m: 0.625, write1h: 1, read: 0.05, output: 2.5 };

export function ratesFor(model: string, promptTokens: number): Rates {
  const m = isModelId(model) ? model : OPUS;
  return m === HAIKU && promptTokens > 100_000 ? HAIKU_LONG : RATES[m];
}

/**
 * What a call cost, in USD. Cache writes are priced at the 1-hour rate, since Composer's
 * foundations block caches for an hour: an upper bound when some writes were 5-minute.
 */
export function costOf(model: string, u: LlmUsage): number {
  const prompt = u.input + u.cacheRead + u.cacheWrite;
  const r = ratesFor(model, prompt);
  return (u.input * r.input + u.cacheWrite * r.write1h + u.cacheRead * r.read + u.output * r.output) / 1_000_000;
}

/** Output a task usually needs, for estimates before a run. Generous on purpose. */
const TYPICAL_OUTPUT: Partial<Record<Task, number>> = { prototype: 24_000, release_story: 8_000, synthesize_insights: 6_000, draft_statement: 4_000, test_strategy: 4_000, verdict: 4_000, pr_description: 2_000 };

/** A run's likely cost before it starts: its prompt at full input price, plus a typical answer. */
export function estimateCost(model: string, promptTokens: number, task: Task): number {
  const r = ratesFor(model, promptTokens);
  return (promptTokens * r.input + (TYPICAL_OUTPUT[task] ?? 6_000) * r.output) / 1_000_000;
}

/** A call's cost as if nothing were cached, so two runs compare like for like. */
export function uncachedCost(model: string, u: LlmUsage): number {
  const prompt = u.input + u.cacheRead + u.cacheWrite;
  const r = ratesFor(model, prompt);
  return (prompt * r.input + u.output * r.output) / 1_000_000;
}

export const sumUsage = (a: LlmUsage, b: Partial<LlmUsage> | null | undefined): LlmUsage => ({
  input: a.input + (b?.input ?? 0),
  output: a.output + (b?.output ?? 0),
  cacheRead: a.cacheRead + (b?.cacheRead ?? 0),
  cacheWrite: a.cacheWrite + (b?.cacheWrite ?? 0),
});
export const ZERO_USAGE: LlmUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
export const totalTokens = (u: Partial<LlmUsage> | null | undefined): number => (u?.input ?? 0) + (u?.output ?? 0) + (u?.cacheRead ?? 0) + (u?.cacheWrite ?? 0);

/** Share of prompt tokens read from the cache. */
export function cacheHitRate(u: Partial<LlmUsage> | null | undefined): number | null {
  const prompt = (u?.input ?? 0) + (u?.cacheRead ?? 0) + (u?.cacheWrite ?? 0);
  return prompt ? (u?.cacheRead ?? 0) / prompt : null;
}

export interface Spend {
  usd: number;
  tokens: number;
  runs: number;
  usage: LlmUsage;
  byModel: Partial<Record<string, { usd: number; tokens: number; runs: number }>>;
  /** Share of prompt tokens served from the cache, or null before any run. */
  cacheHitRate: number | null;
}

/** What a set of runs spent. Runs from before routing carry no cost, so it's worked out from their usage. */
export function spendOf(runs: { model: string; usage: Partial<LlmUsage> | null; cost: number | null }[]): Spend {
  let usage = ZERO_USAGE;
  let usd = 0;
  const byModel: Spend["byModel"] = {};
  let n = 0;
  for (const r of runs) {
    if (!r.usage && r.cost == null) continue;
    const u = sumUsage(ZERO_USAGE, r.usage);
    const c = r.cost ?? costOf(r.model, u);
    usage = sumUsage(usage, u);
    usd += c;
    n++;
    const m = (byModel[r.model] ??= { usd: 0, tokens: 0, runs: 0 });
    m.usd += c;
    m.tokens += totalTokens(u);
    m.runs++;
  }
  return { usd, tokens: totalTokens(usage), runs: n, usage, byModel, cacheHitRate: cacheHitRate(usage) };
}

export const formatTokens = (n: number): string => (n < 1000 ? `${n}` : n < 1_000_000 ? `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k` : `${(n / 1_000_000).toFixed(1)}M`);

export const formatUsd = (usd: number): string => (usd === 0 ? "$0" : usd < 0.01 ? "<$0.01" : usd < 10 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(0)}`);

// ── budgets ─────────────────────────────────────────────────────────────────

export interface Budget {
  /** Most a single run should cost, in USD, or null for no limit. */
  perRunUsd: number | null;
  /** Most a single run's prompt should be, in tokens. */
  perRunTokens: number | null;
  /** Most the whole project should cost, in USD. */
  perProjectUsd: number | null;
  /** Most the whole project should use, in tokens. */
  perProjectTokens: number | null;
}
export const DEFAULT_BUDGET: Budget = { perRunUsd: 2, perRunTokens: null, perProjectUsd: 50, perProjectTokens: null };

/** A run's expected size before it starts. */
export interface RunEstimate {
  estimateUsd: number;
  promptTokens: number;
  /** Prompt plus a typical answer. */
  tokens: number;
}

/** Why a run (or a batch of them) would go over budget, in words, or null when it fits. */
export function overBudget(b: Budget, run: RunEstimate, spent: { usd: number; tokens: number }): string | null {
  if (b.perRunUsd !== null && run.estimateUsd > b.perRunUsd) return `This run is estimated at ${formatUsd(run.estimateUsd)}, over the ${formatUsd(b.perRunUsd)} per-run budget.`;
  if (b.perRunTokens !== null && run.promptTokens > b.perRunTokens) return `This run's prompt is ${formatTokens(run.promptTokens)} tokens, over the ${formatTokens(b.perRunTokens)}-token per-run budget.`;
  if (b.perProjectUsd !== null && spent.usd + run.estimateUsd > b.perProjectUsd)
    return `This project has spent ${formatUsd(spent.usd)} of its ${formatUsd(b.perProjectUsd)} budget; this would take it to about ${formatUsd(spent.usd + run.estimateUsd)}.`;
  if (b.perProjectTokens !== null && spent.tokens + run.tokens > b.perProjectTokens)
    return `This project has used ${formatTokens(spent.tokens)} of its ${formatTokens(b.perProjectTokens)}-token budget; this would take it to about ${formatTokens(spent.tokens + run.tokens)}.`;
  return null;
}

/** Estimates a run before it starts: its assembled prompt on the model it will run on. */
export function estimateRun(model: string, promptTokens: number, task: Task): RunEstimate {
  return { estimateUsd: estimateCost(model, promptTokens, task), promptTokens, tokens: promptTokens + (TYPICAL_OUTPUT[task] ?? 6_000) };
}

export const addEstimates = (a: RunEstimate, b: RunEstimate): RunEstimate => ({ estimateUsd: a.estimateUsd + b.estimateUsd, promptTokens: Math.max(a.promptTokens, b.promptTokens), tokens: a.tokens + b.tokens });

// ── escalation ──────────────────────────────────────────────────────────────

/** A run's output failed checks this many times on one tier before it moves up. */
export const RETRIES_PER_TIER = 2;
/** A score at or below this marks the node for the next tier up. */
export const ESCALATE_AT_SCORE = 2;

export type EscalationReason = "invalid_output" | "low_score" | "marked_wrong" | "advisor_unavailable";

export const ESCALATION_TEXT: Record<EscalationReason, string> = {
  invalid_output: "its answer failed validation twice",
  low_score: "a run scored low",
  marked_wrong: "a run was marked wrong",
  advisor_unavailable: "the advisor was unavailable",
};

// ── the advisor ─────────────────────────────────────────────────────────────

export interface AdvisorConsultation {
  /** text: readable advice. redacted: Opus 5.5 returns its advice encrypted, so only the fact of it shows. */
  kind: "text" | "redacted" | "error";
  text?: string;
  errorCode?: string;
  stopReason?: string | null;
}

/** Reads the advisor_tool_result blocks out of a response's content. */
export function readAdvisor(content: unknown[]): AdvisorConsultation[] {
  const out: AdvisorConsultation[] = [];
  for (const block of content) {
    const b = block as { type?: string; content?: { type?: string; text?: string; error_code?: string; stop_reason?: string | null } };
    if (b?.type !== "advisor_tool_result" || !b.content) continue;
    const c = b.content;
    if (c.type === "advisor_result") out.push({ kind: "text", text: c.text ?? "", stopReason: c.stop_reason ?? null });
    else if (c.type === "advisor_redacted_result") out.push({ kind: "redacted", stopReason: c.stop_reason ?? null });
    else if (c.type === "advisor_tool_result_error") out.push({ kind: "error", errorCode: c.error_code ?? "unknown" });
  }
  return out;
}

/** A request sent on a route: its model, plus the advisor and the nudge when the route has one. */
export function applyRoute(route: Route, req: LlmRequest): LlmRequest {
  const advisor = route.advisor && route.model !== OPUS;
  return { ...req, model: route.model, ...(advisor ? { advisor: { model: OPUS, maxUses: 3 }, system: [...req.system, { type: "text" as const, text: ADVISOR_NUDGE }] } : {}) };
}

/** Error codes that mean the advisor itself wasn't there, so the step escalates to Opus instead. */
export const ADVISOR_UNAVAILABLE = new Set(["unavailable", "overloaded", "too_many_requests", "model_not_found", "execution_time_exceeded"]);

/** The nudge on Sonnet and Haiku runs: when to consult. Forced tool_choice is rejected, so the prompt asks. */
export const ADVISOR_NUDGE =
  "You can consult a stronger model through the advisor tool. Consult it once before you commit to a plan or a direction, again if the same problem keeps coming up, and before you give your final answer if anything is uncertain. Then answer in the required format.";

// ── golden-set replay for a router change ───────────────────────────────────

/** A judged replay: the past output and the candidate model's output, both scored 1–5 by Opus. */
export interface RouterReplayRow {
  baselineScore: number | null;
  candidateScore: number | null;
  baselineCost: number | null;
  candidateCost: number | null;
  status: "done" | "error" | "pending";
}

export interface RouterReplaySummary {
  briefs: number;
  done: number;
  errors: number;
  baselineScore: number | null;
  candidateScore: number | null;
  scoreDelta: number | null;
  baselineCost: number | null;
  candidateCost: number | null;
  costDelta: number | null;
  /** Every brief replayed and judged, and the score held within MAX_SCORE_DROP. */
  passes: boolean;
  line: string;
}

/** How far the judged average may fall before a router change is refused. */
export const MAX_SCORE_DROP = 0.25;

const mean = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function summarizeRouterReplay(rows: RouterReplayRow[]): RouterReplaySummary {
  const done = rows.filter((r) => r.status === "done" && r.baselineScore !== null && r.candidateScore !== null);
  const errors = rows.filter((r) => r.status === "error").length;
  const baselineScore = mean(done.map((r) => r.baselineScore));
  const candidateScore = mean(done.map((r) => r.candidateScore));
  const baselineCost = mean(done.map((r) => r.baselineCost));
  const candidateCost = mean(done.map((r) => r.candidateCost));
  const scoreDelta = baselineScore !== null && candidateScore !== null ? candidateScore - baselineScore : null;
  const costDelta = baselineCost !== null && candidateCost !== null ? candidateCost - baselineCost : null;
  const passes = rows.length > 0 && done.length === rows.length && scoreDelta !== null && scoreDelta >= -MAX_SCORE_DROP;
  const sign = (n: number) => (n >= 0 ? "+" : "−");
  const line = !rows.length
    ? "No briefs to replay for these steps yet"
    : done.length < rows.length
      ? `${done.length} of ${rows.length} brief${rows.length === 1 ? "" : "s"} replayed${errors ? `, ${errors} failed` : ""}`
      : `Score ${baselineScore!.toFixed(1)} → ${candidateScore!.toFixed(1)} (${sign(scoreDelta!)}${Math.abs(scoreDelta!).toFixed(1)}) · cost per run ${formatUsd(baselineCost ?? 0)} → ${formatUsd(candidateCost ?? 0)}${costDelta !== null && baselineCost ? ` (${sign(costDelta)}${Math.abs(Math.round((costDelta / baselineCost) * 100))}%)` : ""}`;
  return { briefs: rows.length, done: done.length, errors, baselineScore, candidateScore, scoreDelta, baselineCost, candidateCost, costDelta, passes, line };
}
