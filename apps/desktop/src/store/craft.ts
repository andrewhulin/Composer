import { create } from "zustand";
import { RECIPES, pickedPhases, type PickedPair, applyDrift, detectDrift, foundationsFor, parseDesignSystem, parsePhilosophy, reflectGroups, reflectRequest, strengthFor, tokenSet, type BuildLint, type DesignSystem, type DriftProposal, type LintResult, type Philosophy, type Principle, type ReflectAnswer, type ScoredRun, type TokenSet } from "@composer/engine";
import { briefForRun, keepBrief, useSkills } from "./skills";
import { PHASES, type Phase, type TextArtifact } from "@composer/core";
import type { CraftRuleRow, FoundationRow, ProposalRow, Repo } from "@composer/data";
import { craftHooks, llmClient, toast, useProject } from "./project";

export interface RuleDiff {
  phase: Phase;
  text: string;
  why: string;
  evidence: string[];
  stats: { highAvg: number; lowAvg: number; nHigh: number; nLow: number; picks?: number };
}

export interface PrincipleDiff {
  change: "sharpened" | "added" | "retired" | "reworded";
  n: number | null;
  text: string;
  why: string;
}

interface CraftState {
  ready: boolean;
  ds: { row: FoundationRow; content: DesignSystem } | null;
  philosophy: { row: FoundationRow; content: Philosophy } | null;
  dsLog: FoundationRow[];
  philosophyLog: FoundationRow[];
  proposals: ProposalRow[];
  rules: CraftRuleRow[];
  scores: Record<string, number>;
  scoredCount: number;
  reflecting: boolean;
  onSystem: number | null;
  open: boolean;
}

export const useCraft = create<CraftState>(() => ({
  ready: false,
  ds: null,
  philosophy: null,
  dsLog: [],
  philosophyLog: [],
  proposals: [],
  rules: [],
  scores: {},
  scoredCount: 0,
  reflecting: false,
  onSystem: null,
  open: false,
}));

const get = useCraft.getState;
const set = useCraft.setState;
const repo = (): Repo => {
  const r = useProject.getState().repo;
  if (!r) throw new Error("Not ready");
  return r;
};

/** Every run's env: foundation versions (the Craft Brief's too) and its phase's rule ids. Changing any marks work stale_env. */
export function syncEnv() {
  const { ds, philosophy, rules } = get();
  const brief = useSkills.getState().brief;
  const byPhase: Partial<Record<Phase, string[]>> = {};
  for (const p of PHASES) byPhase[p] = rules.filter((r) => r.phase === p).map((r) => r.id);
  useProject.setState({ env: { foundations: [ds?.row.id, philosophy?.row.id, brief?.row.id].filter((x): x is string => !!x), rules: byPhase } });
}

export async function loadCraft() {
  const r = repo();
  const [ds, philosophy, dsLog, philosophyLog, proposals, rules, scored, lints] = await Promise.all([
    r.latestFoundation<DesignSystem>("design_system"),
    r.latestFoundation<Philosophy>("philosophy"),
    r.listFoundations("design_system"),
    r.listFoundations("philosophy"),
    r.listProposals(),
    r.listRules(),
    r.scoredRuns(),
    r.settingsWithPrefix<StoredLint>("lint:"),
  ]);
  const scores: Record<string, number> = {};
  for (const s of scored) scores[s.run.id] = s.score;
  const recent = lints.map((l) => l.value.pct).filter((x): x is number => x !== null).slice(-10);
  set({ ready: true, ds: ds ?? null, philosophy: philosophy ?? null, dsLog, philosophyLog, proposals, rules, scores, scoredCount: scored.length, onSystem: recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : null });
  syncEnv();
}

craftHooks.foundations = (phase) => {
  const brief = briefForRun(phase);
  return foundationsFor(get().ds?.content ?? null, get().philosophy?.content ?? null, brief ? { version: brief.version, principles: brief.principles } : undefined);
};
craftHooks.skillIds = (phase) => briefForRun(phase)?.skillIds ?? [];
craftHooks.rules = (phase) => get().rules.filter((r) => r.phase === phase).map((r) => ({ id: `R${r.id.slice(-4)}`, text: r.body }));
craftHooks.afterVerdict = () => void reflect({ auto: true });

export const currentTokens = (): TokenSet | null => (get().ds ? tokenSet(get().ds!.content) : null);

// ── slots ──────────────────────────────────────────────────────────────────

export async function importDesignSystem(tokensMd: string, guideMd: string, source: string) {
  const ds = parseDesignSystem(tokensMd, guideMd, source);
  if (!ds.tokens.length) throw new Error("No token tables found. Pick the tokens reference (markdown tables with hex values).");
  const prev = get().ds;
  const row = await repo().saveFoundation("design_system", ds.version, ds, { kind: "import", title: `Slotted ${ds.name}`, text: `${ds.tokens.length} tokens, ${ds.type.length} type styles, ${ds.components.length} components from ${source}` }, prev?.row.id ?? null);
  await loadCraft();
  toast(`${ds.name} slotted · runs now build on it`, "success");
  return row;
}

export async function importPhilosophy(md: string, source: string) {
  const parsed = parsePhilosophy(md, source);
  if (!parsed.principles.length) throw new Error("No principles found. The file needs a 'How to apply' or 'Principles' list.");
  const prev = get().philosophy;
  const rev = (prev?.content.rev ?? 0) + 1;
  const content: Philosophy = { ...parsed, rev };
  await repo().saveFoundation("philosophy", `rev ${rev}`, content, { kind: "import", title: prev ? "Reimported" : "Slotted", text: `${content.principles.length} principles from ${source}` }, prev?.row.id ?? null);
  await loadCraft();
  toast(`Philosophy rev ${rev} slotted`, "success");
}

// ── drift: detect → propose ───────────────────────────────────────────────

interface StoredLint {
  title: string;
  pct: number | null;
  offenders: LintResult["offenders"];
}

/** Called whenever a prototype is checked against the system. Stores the result and looks for drift. */
export async function recordLint(artifactHash: string, title: string, lint: LintResult) {
  const r = repo();
  await r.setSetting(`lint:${artifactHash}`, { title, pct: lint.pct, offenders: lint.offenders } satisfies StoredLint);
  await detectAndPropose();
  await loadCraft();
}

export async function detectAndPropose() {
  const ds = get().ds;
  if (!ds) return;
  const r = repo();
  const lints = await r.settingsWithPrefix<StoredLint>("lint:");
  const builds: BuildLint[] = lints.map((l) => ({ buildId: l.key.slice(5), title: l.value.title, offenders: l.value.offenders }));
  const pending = (await r.listProposals()).filter((p) => p.targetKind === "design_system" && p.status !== "accepted");
  for (const d of detectDrift(ds.content, builds)) {
    const seen = pending.some((p) => {
      const x = p.diff as DriftProposal;
      return x.token === d.token && x.to === d.to;
    });
    if (seen) continue;
    await r.createProposal({ targetKind: "design_system", baseVersion: ds.content.version, diff: d, rationale: `${d.overrides} overrides across ${d.builds.length} builds`, evidence: d.builds.map((b) => b.id) });
  }
}

// ── review ────────────────────────────────────────────────────────────────

const principleLabel = (n: number) => String(n).padStart(2, "0");

export async function accept(p: ProposalRow, editedValue?: string) {
  const r = repo();
  if (p.targetKind === "craft_brief") return keepBrief(p);
  if (p.targetKind === "design_system") {
    const ds = get().ds;
    if (!ds) return;
    const d = p.diff as DriftProposal;
    const to = editedValue?.trim() || d.to;
    const next = applyDrift(ds.content, { ...d, to });
    const title = d.kind === "add" ? `New token ${d.token}` : `${d.token} ${d.from} → ${to}`;
    const row = await r.saveFoundation("design_system", next.version, next, { kind: d.kind, title, text: p.rationale }, ds.row.id);
    await r.resolveProposal(p.id, "accepted", `${title}${editedValue ? " (edited)" : ""}`, row.id);
    toast(`${next.name} v${next.version} · next Build runs pull it`, "success");
  } else if (p.targetKind === "philosophy") {
    const ph = get().philosophy;
    if (!ph) return;
    const d = p.diff as PrincipleDiff;
    let principles: Principle[] = ph.content.principles.map((x) => ({ ...x }));
    const target = d.n ? principles.find((x) => x.n === d.n) : undefined;
    let title = "";
    if (d.change === "added") {
      principles.push({ n: principles.length + 1, text: editedValue?.trim() || d.text, strength: "forming", decisions: 1 });
      title = `Added ${principleLabel(principles.length)}`;
    } else if (target && d.change === "retired") {
      principles = principles.filter((x) => x.n !== target.n).map((x, i) => ({ ...x, n: i + 1 }));
      title = `Retired “${target.text}”`;
    } else if (target) {
      const decisions = (target.decisions ?? 0) + 1;
      Object.assign(target, { text: editedValue?.trim() || d.text, decisions, strength: target.strength === "locked" ? "locked" : maxStrength(target.strength, strengthFor(decisions)) });
      title = `${d.change === "sharpened" ? "Sharpened" : "Reworded"} ${principleLabel(target.n)}`;
    }
    const rev = ph.content.rev + 1;
    const row = await r.saveFoundation("philosophy", `rev ${rev}`, { ...ph.content, rev, principles }, { kind: d.change, title, text: d.why }, ph.row.id);
    await r.resolveProposal(p.id, "accepted", title, row.id);
    toast(`Philosophy rev ${rev} · ${title}`, "success");
  } else {
    const d = p.diff as RuleDiff;
    await r.addRule(d.phase, editedValue?.trim() || d.text, p.id);
    await r.resolveProposal(p.id, "accepted", `Kept rule: ${d.text}`);
    toast("Rule kept · it rides along in every run of that phase", "success");
  }
  await loadCraft();
}

const ORDER: Principle["strength"][] = ["forming", "steady", "strong", "locked"];
const maxStrength = (a: Principle["strength"], b: Principle["strength"]) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

/** Reject asks one question for design-system changes: wrong value, or wrong idea? Both are recorded. */
export async function reject(p: ProposalRow, why: "value" | "idea" | "no") {
  const r = repo();
  const d = p.diff as Partial<DriftProposal & RuleDiff & PrincipleDiff>;
  const what = p.targetKind === "design_system" ? `${d.token} → ${d.to}` : (d.text ?? "proposal");
  const reason = why === "value" ? `Wrong value: ${what}` : why === "idea" ? `Wrong idea: ${what}` : `Rejected: ${what}`;
  await r.resolveProposal(p.id, "rejected", reason);
  if (why === "idea") await r.decide(null, "taste", `Doesn't want ${what}. ${p.rationale}`);
  await loadCraft();
}

export async function notYet(p: ProposalRow) {
  await repo().resolveProposal(p.id, "deferred", `Not yet: ${(p.diff as { text?: string; token?: string }).text ?? (p.diff as { token?: string }).token ?? ""}`);
  await loadCraft();
}

export async function retire(rule: CraftRuleRow) {
  await repo().retireRule(rule.id, `Retired: ${rule.body}`);
  await loadCraft();
}

export async function lockPrinciple(n: number) {
  const ph = get().philosophy;
  if (!ph) return;
  const principles = ph.content.principles.map((x) => (x.n === n ? { ...x, strength: "locked" as const } : x));
  const rev = ph.content.rev + 1;
  await repo().saveFoundation("philosophy", `rev ${rev}`, { ...ph.content, rev, principles }, { kind: "locked", title: `Locked ${principleLabel(n)}`, text: "Held as-is; Composer won't propose changes to it." }, ph.row.id);
  await loadCraft();
}

// ── score → reflect ──────────────────────────────────────────────────────

export async function score(runId: string, value: number, note?: string) {
  await repo().score(runId, value, note);
  set((s) => ({ scores: { ...s.scores, [runId]: value }, scoredCount: s.scoredCount + (s.scores[runId] ? 0 : 1) }));
}

/** How far each phase is from enough evidence to learn from: 5 high and 5 low, or 5 pairwise picks. */
export async function evidence(): Promise<{ phase: Phase; high: number; low: number; picks: number }[]> {
  const runs = await scoredRunsForReflect();
  const picks = await repo().listPicks();
  return PHASES.map((phase) => ({
    phase,
    high: runs.filter((r) => r.phase === phase && r.score >= 4).length,
    low: runs.filter((r) => r.phase === phase && r.score <= 2).length,
    picks: picks.filter((p) => p.phase === phase).length,
  })).filter((e) => e.high + e.low + e.picks > 0);
}

/** Every pairwise pick, with both runs' instruction and output, for Reflect. */
async function pickedPairs(): Promise<PickedPair[]> {
  const r = repo();
  const picks = await r.listPicks();
  if (!picks.length) return [];
  const runs = new Map((await Promise.all([...new Set(picks.flatMap((p) => [p.winnerRunId, p.loserRunId]))].map((id) => r.getRun(id)))).flatMap((x) => (x ? [[x.id, x] as const] : [])));
  const blobs = await r.getBlobs([...runs.values()].flatMap((x) => (x.outputHash ? [x.outputHash] : [])));
  const { graph } = useProject.getState();
  const side = (id: string) => {
    const run = runs.get(id);
    if (!run?.outputHash) return undefined;
    const node = graph.nodes[run.nodeId];
    return { runId: id, instruction: node?.kind === "claude" ? node.instruction : "", output: (blobs.get(run.outputHash) as TextArtifact | undefined)?.text ?? "" };
  };
  return picks.flatMap((p) => {
    const winner = side(p.winnerRunId);
    const loser = side(p.loserRunId);
    return winner && loser ? [{ phase: p.phase, winner, loser, ...(p.note ? { note: p.note } : {}) }] : [];
  });
}

async function scoredRunsForReflect(): Promise<ScoredRun[]> {
  const r = repo();
  const scored = await r.scoredRuns();
  const blobs = await r.getBlobs(scored.flatMap((s) => (s.run.outputHash ? [s.run.outputHash] : [])));
  const { graph } = useProject.getState();
  return scored.flatMap((s) => {
    const recipe = RECIPES[s.run.recipe as keyof typeof RECIPES];
    if (!recipe) return [];
    const node = graph.nodes[s.run.nodeId];
    const out = s.run.outputHash ? (blobs.get(s.run.outputHash) as TextArtifact | undefined) : undefined;
    return [{ runId: s.run.id, phase: recipe.phase, recipe: s.run.recipe, score: s.score, ...(s.note ? { note: s.note } : {}), instruction: node?.kind === "claude" ? node.instruction : "", output: out?.text ?? "", ruleIds: s.run.ruleIds }];
  });
}

/**
 * Compares high- and low-scored runs and drafts rules and philosophy changes for review. Runs
 * after each verdict when some phase has enough evidence; nothing applies until approved.
 */
export async function reflect(opts: { auto?: boolean } = {}) {
  if (get().reflecting) return;
  const r = repo();
  const runs = await scoredRunsForReflect();
  const groups = reflectGroups(runs);
  const pairs = await pickedPairs();
  const pickPhases = pickedPhases(pairs);
  const decisions = (await r.allDecisions()).filter((d) => ["verdict_override", "taste", "proposal_rejected", "proposal_accepted", "rule_kept", "swap", "lock"].some((k) => d.kind.startsWith(k)));
  if (!groups.length && !pickPhases.length && (opts.auto || decisions.length < 8)) {
    if (!opts.auto) toast("Not enough evidence yet. Score 5 runs high (4–5) and 5 low (1–2) in a phase, or make 5 pairwise picks.");
    return;
  }
  set({ reflecting: true });
  try {
    const res = await llmClient().stream(reflectRequest(groups, get().philosophy?.content ?? null, decisions.map((d) => `${d.kind}: ${d.statement}`), "claude-opus-5-5", pairs), { signal: new AbortController().signal });
    const answer = JSON.parse(res.text) as ReflectAnswer;
    const pending = await r.listProposals("pending");
    const has = (text: string) => pending.some((p) => (p.diff as { text?: string }).text === text);
    let n = 0;
    for (const rule of answer.rules) {
      const g = groups.find((x) => x.phase === rule.phase);
      const picks = pairs.filter((x) => x.phase === rule.phase).length;
      if ((!g && !pickPhases.includes(rule.phase)) || has(rule.text)) continue;
      const diff: RuleDiff = { ...rule, stats: { highAvg: g?.highAvg ?? 0, lowAvg: g?.lowAvg ?? 0, nHigh: g?.high.length ?? 0, nLow: g?.low.length ?? 0, ...(picks ? { picks } : {}) } };
      await r.createProposal({ targetKind: "rule", diff, rationale: rule.why, evidence: rule.evidence });
      n++;
    }
    const locked = new Set(get().philosophy?.content.principles.filter((p) => p.strength === "locked").map((p) => p.n));
    for (const pr of answer.principles) {
      if ((pr.n && locked.has(pr.n)) || has(pr.text)) continue;
      await r.createProposal({ targetKind: "philosophy", baseVersion: get().philosophy?.row.version ?? null, diff: pr satisfies PrincipleDiff, rationale: pr.why });
      n++;
    }
    await loadCraft();
    toast(n ? `${n} ${n === 1 ? "proposal" : "proposals"} from your scored runs · review in Foundations` : "Reflected · nothing new to propose");
  } catch (e) {
    if (!opts.auto) toast(e instanceof Error ? e.message : String(e), "error");
  } finally {
    set({ reflecting: false });
  }
}

export const openFoundations = (open = true) => set({ open });
