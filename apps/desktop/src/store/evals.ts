import { create } from "zustand";
import { hashOf, type Phase, type RecipeId, type TextArtifact } from "@composer/core";
import { RECIPES, replayOne, tallyReplay, withCandidate, type ReplayCandidate, type ReplayTally, type StoredPrompt } from "@composer/engine";
import type { ProposalRow, ReplayCaseRow, ReplayResultRow, Repo } from "@composer/data";
import { llmClient, toast, useProject } from "./project";
import type { PrincipleDiff, RuleDiff } from "./craft";

/**
 * Replay: before a proposed rule or principle is kept, rerun past briefs with it and show the
 * outputs side by side. The stored prompt changes in exactly one block, so the comparison is fair.
 */

export interface ReplayRow {
  case: ReplayCaseRow;
  result?: ReplayResultRow;
  baseline?: TextArtifact;
  candidate?: TextArtifact;
}

interface ReplayState {
  rows: ReplayRow[];
  running: boolean;
  done: number;
  total: number;
  tally: ReplayTally;
}

interface EvalsState {
  byProposal: Record<string, ReplayState>;
}

export const useEvals = create<EvalsState>(() => ({ byProposal: {} }));

const MAX_CASES = 4;

const repo = (): Repo => {
  const r = useProject.getState().repo;
  if (!r) throw new Error("Not ready");
  return r;
};

function patch(id: string, p: Partial<ReplayState>) {
  useEvals.setState((s) => {
    const prev = s.byProposal[id] ?? { rows: [], running: false, done: 0, total: 0, tally: tallyReplay([]) };
    const next = { ...prev, ...p };
    return { byProposal: { ...s.byProposal, [id]: { ...next, tally: tallyReplay(next.rows.filter((r) => r.result?.status === "done").map((r) => r.result!.pick)) } } };
  });
}

/** The change a proposal would make, as replay applies it. Design-system proposals lint instead. */
export function candidateOf(p: ProposalRow): ReplayCandidate | undefined {
  if (p.targetKind === "rule") {
    const d = p.diff as RuleDiff;
    return { kind: "rule", phase: d.phase, id: "R-new", text: d.text };
  }
  if (p.targetKind === "philosophy") {
    const d = p.diff as PrincipleDiff;
    return { kind: "principle", change: d.change, n: d.n, text: d.text };
  }
  return undefined;
}

const phaseOf = (p: ProposalRow): Phase | undefined => (p.targetKind === "rule" ? (p.diff as RuleDiff).phase : undefined);

/**
 * The briefs a proposal replays: the ones kept by hand for its phase, else the best evidence the
 * loop already has (high-scored and picked runs with a stored prompt), kept automatically.
 */
export async function replayCases(p: ProposalRow): Promise<ReplayCaseRow[]> {
  const r = repo();
  const phase = phaseOf(p);
  const kept = await r.listReplayCases(phase);
  if (kept.length) return kept.slice(-MAX_CASES);
  const scored = (await r.scoredRuns()).filter((s) => s.run.promptHash && s.run.outputHash && (!phase || RECIPES[s.run.recipe as RecipeId]?.phase === phase));
  const picked = new Set((await r.listPicks(phase)).map((x) => x.winnerRunId));
  const ranked = scored.sort((a, b) => Number(picked.has(b.run.id)) - Number(picked.has(a.run.id)) || b.score - a.score).slice(0, MAX_CASES);
  const { graph } = useProject.getState();
  const out: ReplayCaseRow[] = [];
  for (const s of ranked) {
    const recipePhase = RECIPES[s.run.recipe as RecipeId]?.phase;
    if (!recipePhase) continue;
    out.push(
      await r.keepReplayCase({
        projectId: s.run.projectId,
        phase: recipePhase,
        recipe: s.run.recipe,
        runId: s.run.id,
        name: `${graph.nodes[s.run.nodeId]?.title ?? RECIPES[s.run.recipe as RecipeId]?.title ?? s.run.recipe} · scored ${s.score}`,
        promptHash: s.run.promptHash!,
        outputHash: s.run.outputHash!,
      }),
    );
  }
  return out;
}

/** Loads a proposal's stored replay results, so the side by side survives reopening Foundations. */
export async function loadReplay(p: ProposalRow) {
  const r = repo();
  const results = await r.replayResults(p.id);
  if (!results.length) return;
  const cases = (await r.listReplayCases()).filter((c) => results.some((x) => x.caseId === c.id));
  const blobs = await r.getBlobs([...cases.map((c) => c.outputHash), ...results.flatMap((x) => (x.outputHash ? [x.outputHash] : []))]);
  const rows = cases.map((c) => {
    const result = results.find((x) => x.caseId === c.id);
    return { case: c, ...(result ? { result } : {}), baseline: blobs.get(c.outputHash) as TextArtifact | undefined, candidate: result?.outputHash ? (blobs.get(result.outputHash) as TextArtifact | undefined) : undefined } as ReplayRow;
  });
  patch(p.id, { rows, done: rows.length, total: rows.length });
}

/** Reruns each brief with the candidate change and stores what it produced. */
export async function runReplay(p: ProposalRow) {
  const candidate = candidateOf(p);
  if (!candidate || useEvals.getState().byProposal[p.id]?.running) return;
  const r = repo();
  const cases = await replayCases(p);
  if (!cases.length) {
    toast("No briefs to replay yet. Keep a run as a replay brief from the inspector, or score some runs in this phase.", "error");
    return;
  }
  const blobs = await r.getBlobs(cases.flatMap((c) => [c.promptHash, c.outputHash]));
  const rows: ReplayRow[] = cases.map((c) => ({ case: c, baseline: blobs.get(c.outputHash) as TextArtifact | undefined }));
  patch(p.id, { rows, running: true, done: 0, total: cases.length });
  const signal = new AbortController().signal;
  for (const [i, c] of cases.entries()) {
    const prompt = blobs.get(c.promptHash) as StoredPrompt | undefined;
    let row: ReplayRow = rows[i]!;
    try {
      if (!prompt?.system) throw new Error("The stored prompt is missing.");
      const model = (await r.getRun(c.runId))?.model ?? "claude-opus-5-5";
      const art = await replayOne(llmClient(), withCandidate(prompt, candidate), c.recipe as RecipeId, model, signal);
      const hash = hashOf(art);
      const result = await r.saveReplayResult({ proposalId: p.id, caseId: c.id, outputHash: hash, status: "done" }, [{ hash, value: art, kind: "artifact" }]);
      row = { ...row, result, candidate: art };
    } catch (e) {
      const result = await r.saveReplayResult({ proposalId: p.id, caseId: c.id, status: "error", error: e instanceof Error ? e.message : String(e) });
      row = { ...row, result };
    }
    rows[i] = row;
    patch(p.id, { rows: [...rows], done: i + 1 });
  }
  patch(p.id, { running: false });
  await r.decide(null, "replay", `Replayed ${cases.length} brief${cases.length === 1 ? "" : "s"} against a proposed ${p.targetKind}: ${(p.diff as { text?: string }).text ?? ""}`, { proposalId: p.id });
}

/** The designer's read of one replayed brief: which output is better. */
export async function judgeReplay(p: ProposalRow, resultId: string, pick: NonNullable<ReplayResultRow["pick"]>) {
  await repo().setReplayPick(resultId, pick);
  const state = useEvals.getState().byProposal[p.id];
  if (!state) return;
  patch(p.id, { rows: state.rows.map((row) => (row.result?.id === resultId ? { ...row, result: { ...row.result, pick } } : row)) });
}
