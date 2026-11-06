import { create } from "zustand";
import { hashOf, type Effort, type RecipeId, type TextArtifact } from "@composer/core";
import {
  DEFAULT_BUDGET,
  MODEL_LABEL,
  OPUS,
  recipe,
  RECIPE_TASKS,
  TASK_LABEL,
  changedTasks,
  defaultTable,
  judgeRequest,
  parseJudgment,
  replayRun,
  routeFor,
  routeTags,
  summarizeRouterReplay,
  uncachedCost,
  type Budget,
  type Route,
  type RouterReplaySummary,
  type RouterTable,
  type StoredPrompt,
  type Task,
} from "@composer/engine";
import type { FoundationRow, ProposalRow, ReplayCaseRow, Repo } from "@composer/data";
import { llmClient, routedRequest, routerHooks, toast, useProject } from "./project";

/**
 * The router: which model runs each kind of call, and the budgets runs are held to. The table is
 * versioned like a foundation; a change to a recipe's model goes live only after a golden-set
 * replay shows its cost and score next to what ran before.
 */

export interface RouterDiff {
  version: string;
  table: RouterTable;
  tasks: Task[];
}

/** One past brief rerun on the candidate route, judged by Opus beside the output it replaces. */
export interface RouterReplayCase {
  caseId: string;
  name: string;
  task: RecipeId;
  from: string;
  to: Route;
  status: "pending" | "done" | "error";
  error?: string;
  baselineHash: string;
  candidateHash?: string;
  baselineScore: number | null;
  candidateScore: number | null;
  baselineCost: number | null;
  candidateCost: number | null;
  reasons?: { baseline: string; candidate: string };
  /** How many times the candidate consulted the advisor. */
  consulted?: number;
}

interface ReplayState {
  cases: RouterReplayCase[];
  running: boolean;
  summary: RouterReplaySummary;
}

interface RouterState {
  ready: boolean;
  table: RouterTable;
  row: FoundationRow | null;
  history: FoundationRow[];
  /** Edits in Settings that haven't been proposed yet. */
  draft: RouterTable | null;
  proposal: ProposalRow<RouterDiff> | null;
  replay: ReplayState | null;
  budget: Budget;
}

export const useRouter = create<RouterState>(() => ({
  ready: false,
  table: defaultTable(),
  row: null,
  history: [],
  draft: null,
  proposal: null,
  replay: null,
  budget: DEFAULT_BUDGET,
}));

const get = useRouter.getState;
const set = useRouter.setState;
const BUDGET_KEY = "budget";
const replayKey = (proposalId: string) => `router_replay:${proposalId}`;
const PER_RECIPE = 3;
const MAX_CASES = 6;

const repo = (): Repo => {
  const r = useProject.getState().repo;
  if (!r) throw new Error("Not ready");
  return r;
};

routerHooks.table = () => get().table;
routerHooks.budget = () => get().budget;

/** Puts the live table's routes into the environment, so nodes it moves read as changed. */
function syncRoutes() {
  const routes = routeTags(get().table);
  useProject.setState((s) => ({ env: { ...s.env, routes } }));
}

// Opening another project resets the environment; the router's routes go straight back in.
useProject.subscribe((s) => {
  if (get().ready && s.env.routes === undefined) syncRoutes();
});

/** Upgrades a stored table: tasks added since it was saved take their defaults. */
const withDefaults = (t: RouterTable | undefined): RouterTable => ({ v: 1, routes: { ...defaultTable().routes, ...(t?.routes ?? {}) } });

export async function loadRouter() {
  const r = repo();
  const [latest, history, budget, proposals] = await Promise.all([r.latestFoundation<RouterTable>("router"), r.listFoundations("router"), r.getSetting<Budget>(BUDGET_KEY), r.listProposals("pending")]);
  const proposal = (proposals.find((p) => p.targetKind === "router") as ProposalRow<RouterDiff> | undefined) ?? null;
  set({ ready: true, table: withDefaults(latest?.content), row: latest?.row ?? null, history, budget: { ...DEFAULT_BUDGET, ...budget }, proposal, draft: null, replay: null });
  syncRoutes();
  if (proposal) await loadRouterReplay(proposal);
}

// ── editing ─────────────────────────────────────────────────────────────────

export function setDraftRoute(task: Task, route: Route) {
  const base = get().draft ?? get().table;
  const draft: RouterTable = { v: 1, routes: { ...base.routes, [task]: { model: route.model, advisor: route.model !== OPUS && route.advisor } } };
  set({ draft: changedTasks(get().table, draft).length ? draft : null });
}

export const discardDraft = () => set({ draft: null });

export async function setBudget(b: Budget) {
  set({ budget: b });
  await repo().setSetting(BUDGET_KEY, b);
}

/** Recipes are what the golden set can replay; craft jobs have no stored briefs to rerun. */
const replayable = (tasks: Task[]): RecipeId[] => tasks.filter((t): t is RecipeId => (RECIPE_TASKS as Task[]).includes(t));

/** Turns the draft into a proposal and replays the golden set on it straight away. */
export async function proposeRouter(): Promise<ProposalRow<RouterDiff> | undefined> {
  const { draft, table, row, history, proposal } = get();
  if (!draft) return;
  const r = repo();
  if (proposal) await r.resolveProposal(proposal.id, "rejected", "Replaced by a newer router change");
  const tasks = changedTasks(table, draft);
  const version = `v${history.length + 1}`;
  const p = await r.createProposal<RouterDiff>({
    targetKind: "router",
    baseVersion: row?.version ?? "default",
    diff: { version, table: draft, tasks },
    rationale: tasks.map((t) => `${TASK_LABEL[t]}: ${describe(routeFor(table, t))} → ${describe(routeFor(draft, t))}`).join("; "),
    evidence: [],
  });
  set({ proposal: p, draft: null, replay: null });
  if (replayable(tasks).length) await runRouterReplay(p);
  return p;
}

const describe = (r: Route) => `${MODEL_LABEL[r.model]}${r.advisor ? " + advisor" : ""}`;

export async function discardProposal() {
  const p = get().proposal;
  if (!p) return;
  await repo().resolveProposal(p.id, "rejected", "Router change discarded");
  set({ proposal: null, replay: null });
}

/** A router change can go live once its replay passes; one that only moves craft jobs has nothing to replay. */
export function canKeep(p: ProposalRow<RouterDiff> | null, replay: ReplayState | null): boolean {
  if (!p) return false;
  if (!replayable(p.diff.tasks).length) return true;
  return !!replay && !replay.running && replay.summary.passes;
}

export async function keepRouter() {
  const { proposal: p, replay, row } = get();
  if (!p || !canKeep(p, replay)) return;
  const r = repo();
  const saved = await r.saveFoundation(
    "router",
    p.diff.version,
    p.diff.table,
    { kind: "change", title: p.diff.tasks.map((t) => TASK_LABEL[t]).join(", "), text: replay ? `${p.rationale}. ${replay.summary.line}` : p.rationale },
    row?.id ?? null,
  );
  await r.resolveProposal(p.id, "accepted", `Router ${p.diff.version}: ${p.rationale}`, saved.id);
  set({ table: withDefaults(p.diff.table), row: saved, history: [...get().history, saved], proposal: null, replay: null });
  syncRoutes();
  toast(`Router ${p.diff.version} is live. Nodes it moves show as changed until they rerun.`, "success");
}

// ── golden-set replay ───────────────────────────────────────────────────────

/** The briefs a router change replays: kept briefs for each recipe it moves, else its best-scored runs. */
async function routerCases(tasks: RecipeId[]): Promise<ReplayCaseRow[]> {
  const r = repo();
  const kept = await r.listReplayCases();
  const scored = await r.scoredRuns();
  const out: ReplayCaseRow[] = [];
  for (const task of tasks) {
    const mine = kept.filter((c) => c.recipe === task).slice(-PER_RECIPE);
    if (mine.length) {
      out.push(...mine);
      continue;
    }
    const best = scored.filter((s) => s.run.recipe === task && s.run.promptHash && s.run.outputHash).sort((a, b) => b.score - a.score).slice(0, PER_RECIPE);
    for (const s of best) {
      out.push(
        await r.keepReplayCase({
          projectId: s.run.projectId,
          phase: recipe(task).phase,
          recipe: task,
          runId: s.run.id,
          name: `${recipe(task).title} · scored ${s.score}`,
          promptHash: s.run.promptHash!,
          outputHash: s.run.outputHash!,
        }),
      );
    }
  }
  return out.slice(0, MAX_CASES);
}

function patchReplay(cases: RouterReplayCase[], running: boolean) {
  set({ replay: { cases, running, summary: summarizeRouterReplay(cases) } });
}

async function loadRouterReplay(p: ProposalRow<RouterDiff>) {
  const cases = await repo().getSetting<RouterReplayCase[]>(replayKey(p.id));
  if (cases?.length) patchReplay(cases, false);
}

/** The artifacts behind a replay row, for the side by side. */
export async function replayOutputs(c: RouterReplayCase): Promise<{ baseline?: TextArtifact; candidate?: TextArtifact }> {
  const blobs = await repo().getBlobs([c.baselineHash, ...(c.candidateHash ? [c.candidateHash] : [])]);
  return { baseline: blobs.get(c.baselineHash) as TextArtifact | undefined, candidate: c.candidateHash ? (blobs.get(c.candidateHash) as TextArtifact | undefined) : undefined };
}

/**
 * Reruns each brief on the candidate route and has Opus score the new output and the old one,
 * blind. Costs compare at uncached prices, so a warm cache on the original run doesn't skew it.
 */
export async function runRouterReplay(p: ProposalRow<RouterDiff>) {
  if (get().replay?.running) return;
  const r = repo();
  const tasks = replayable(p.diff.tasks);
  const rows = await routerCases(tasks);
  const blobs = await r.getBlobs(rows.flatMap((c) => [c.promptHash, c.outputHash]));
  const cases: RouterReplayCase[] = [];
  const efforts: (Effort | undefined)[] = [];
  for (const c of rows) {
    const run = await r.getRun(c.runId);
    const from = run?.model ?? OPUS;
    efforts.push(run?.effort as Effort | undefined);
    cases.push({
      caseId: c.id,
      name: c.name,
      task: c.recipe as RecipeId,
      from,
      to: routeFor(p.diff.table, c.recipe as RecipeId),
      status: "pending",
      baselineHash: c.outputHash,
      baselineScore: null,
      candidateScore: null,
      baselineCost: run?.usage ? uncachedCost(from, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, ...run.usage }) : null,
      candidateCost: null,
    });
  }
  patchReplay(cases, true);
  if (!cases.length) {
    patchReplay(cases, false);
    toast(`No briefs to replay for ${tasks.map((t) => recipe(t).title).join(", ")} yet. Score a few of their runs, then replay.`, "error");
    return;
  }
  const signal = new AbortController().signal;
  for (const [i, c] of cases.entries()) {
    let next: RouterReplayCase;
    try {
      const prompt = blobs.get(rows[i]!.promptHash) as StoredPrompt | undefined;
      const baseline = blobs.get(c.baselineHash) as TextArtifact | undefined;
      if (!prompt?.system || !baseline) throw new Error("The stored brief is missing.");
      const effort = efforts[i];
      const out = await replayRun(llmClient(), prompt, c.task, c.to.model, signal, { advisor: c.to.advisor, ...(effort ? { effort } : {}) });
      const hash = hashOf(out.artifact);
      await r.saveReplayResult({ proposalId: p.id, caseId: c.caseId, outputHash: hash, status: "done", usage: { ...out.usage }, model: c.to.model }, [{ hash, value: out.artifact, kind: "artifact" }]);
      const flip = Number.parseInt(hashOf([c.caseId, p.id]).slice(-1), 16) % 2 === 1;
      const res = await llmClient().stream(routedRequest("judge", judgeRequest(prompt, recipe(c.task).phase, baseline.text, out.artifact.text, OPUS, flip)), { signal });
      const judged = parseJudgment(res.text, flip);
      next = {
        ...c,
        status: "done",
        candidateHash: hash,
        candidateCost: uncachedCost(c.to.model, out.usage),
        baselineScore: judged.baseline.score,
        candidateScore: judged.candidate.score,
        reasons: { baseline: judged.baseline.reason, candidate: judged.candidate.reason },
        consulted: out.advisor.length,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await r.saveReplayResult({ proposalId: p.id, caseId: c.caseId, status: "error", error, model: c.to.model });
      next = { ...c, status: "error", error };
    }
    cases[i] = next;
    patchReplay([...cases], true);
  }
  patchReplay(cases, false);
  await r.setSetting(replayKey(p.id), cases);
  await r.decide(useProject.getState().project?.id ?? null, "replay", `Replayed ${cases.length} brief${cases.length === 1 ? "" : "s"} against router ${p.diff.version}: ${get().replay!.summary.line}`, { proposalId: p.id });
}
