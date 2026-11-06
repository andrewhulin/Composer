import { create } from "zustand";
import type { Id, Phase, TextArtifact } from "@composer/core";
import type { FoundationRow, ProposalRow, SkillRow } from "@composer/data";
import {
  applyResolution,
  briefDiff,
  briefFor,
  briefStale,
  compileRequest,
  defaultEnabled,
  defaultMode,
  describeResolution,
  digest,
  findSkills,
  inferKind,
  parseCompile,
  parseRegistry,
  parseSkillMd,
  parseSkillSource,
  reviewRequest,
  skillApplies,
  skillTokens,
  type CatalogEntry,
  type CompileSkill,
  type CraftBrief,
  type Resolution,
  type SkillFile,
  type SkillMode,
  type SkillReview,
  OPUS,
} from "@composer/engine";
import { http } from "../connectors/http";
import { llmClient, routedRequest, toast, useProject, actions } from "./project";
import { loadCraft, syncEnv, useCraft } from "./craft";

export interface PendingImport {
  source: string;
  label: string;
  /** Skills found at the source; the designer picks which to install. */
  choices: { dir: string; name: string; description: string; skill: SkillFile; refs: SkillFile[]; ref?: string; selected: boolean }[];
}

export interface NodeReview {
  skillId: string;
  skillName: string;
  runId: string;
  review: SkillReview;
  at: string;
}

interface SkillsState {
  ready: boolean;
  skills: SkillRow[];
  /** This project's on/off overrides; missing means "follow the global switch". */
  overrides: Record<string, boolean>;
  /** The approved brief in force. */
  brief: { row: FoundationRow; content: CraftBrief } | null;
  /** A compiled brief still being resolved, before it's proposed. */
  candidate: CraftBrief | null;
  resolutions: Record<string, Resolution>;
  compiling: boolean;
  pending: PendingImport | null;
  catalog: CatalogEntry[] | null;
  reviews: Record<Id, NodeReview>;
  reviewing: Id | null;
}

export const useSkills = create<SkillsState>(() => ({
  ready: false,
  skills: [],
  overrides: {},
  brief: null,
  candidate: null,
  resolutions: {},
  compiling: false,
  pending: null,
  catalog: null,
  reviews: {},
  reviewing: null,
}));

const get = useSkills.getState;
const set = useSkills.setState;
const CANDIDATE = "craft_brief_candidate";
const RESOLUTIONS = "craft_brief_resolutions";
const REGISTRY = "https://www.ui-skills.com/skills/registry.txt";
const overridesKey = () => `skills:${useProject.getState().project?.id ?? "none"}`;
const reviewKey = (nodeId: Id) => `review:${useProject.getState().project?.id ?? "none"}:${nodeId}`;

const repo = () => {
  const r = useProject.getState().repo;
  if (!r) throw new Error("Storage isn't open yet.");
  return r;
};

export async function loadSkills() {
  const r = repo();
  const [skills, overrides, brief, candidate, resolutions] = await Promise.all([
    r.listSkills(),
    r.getSetting<Record<string, boolean>>(overridesKey()),
    r.latestFoundation<CraftBrief>("craft_brief"),
    r.getSetting<CraftBrief | null>(CANDIDATE),
    r.getSetting<Record<string, Resolution>>(RESOLUTIONS),
  ]);
  set({ ready: true, skills, overrides: overrides ?? {}, brief: brief ?? null, candidate: candidate ?? null, resolutions: resolutions ?? {} });
  syncEnv();
}

// Another project has its own overrides.
useProject.subscribe((s, prev) => {
  if (s.project?.id !== prev.project?.id && s.repo) void loadSkills().catch(() => undefined);
});

// ── the library ─────────────────────────────────────────────────────────────

/** Always-on skills in force for a phase (or for any phase, without one), with this project's overrides. */
export function activeSkills(phase?: Phase): SkillRow[] {
  const { skills, overrides } = get();
  return skills.filter((s) => s.mode === "always" && skillApplies(s, overrides[s.id], phase));
}

/** The brief no longer matches the skills that are on. */
export function isStale(): boolean {
  const { brief } = get();
  return briefStale(brief?.content ?? null, activeSkills());
}

async function install(found: PendingImport["choices"], source: string, label: string, extra: { author?: string; ref?: string } = {}) {
  const r = repo();
  const names: string[] = [];
  for (const f of found) {
    const parsed = parseSkillMd(f.skill.content, f.dir.split("/").pop() || label);
    const kind = inferKind(parsed);
    const { skill, changed } = await r.saveSkill({
      name: parsed.name,
      description: parsed.description,
      author: parsed.author ?? extra.author ?? null,
      source: `${source}${f.dir ? `/${f.dir}` : ""}`,
      kind,
      mode: defaultMode(kind),
      enabled: defaultEnabled(kind),
      body: parsed.body,
      files: f.refs.map((x) => ({ path: f.dir ? x.path.slice(f.dir.length + 1) : x.path, content: x.content })),
      tokens: skillTokens(parsed.body),
      ref: f.ref ?? extra.ref ?? null,
    });
    names.push(changed ? (skill.version > 1 ? `${skill.name} (updated to v${skill.version})` : skill.name) : `${skill.name} (unchanged)`);
  }
  await loadSkills();
  if (names.length) toast(`Imported ${names.join(", ")}.`, "success");
}

/** A folder's files, from a drop or the picker. One skill installs; several ask which. */
export async function importFiles(files: SkillFile[], source: string, label: string) {
  const found = findSkills(files);
  if (!found.length) return toast(`No SKILL.md in ${label}. A skill is a folder with a SKILL.md at its top.`, "error");
  const choices = found.map((f) => {
    const parsed = parseSkillMd(f.skill.content, f.dir.split("/").pop() || label);
    return { ...f, name: parsed.name, description: parsed.description, selected: true };
  });
  if (choices.length === 1) return install(choices, source, label);
  set({ pending: { source, label, choices } });
}

export function toggleChoice(dir: string) {
  const p = get().pending;
  if (p) set({ pending: { ...p, choices: p.choices.map((c) => (c.dir === dir ? { ...c, selected: !c.selected } : c)) } });
}

export async function installPending() {
  const p = get().pending;
  if (!p) return;
  set({ pending: null });
  await install(p.choices.filter((c) => c.selected), p.source, p.label);
}

export const cancelPending = () => set({ pending: null });

const ghJson = async <T>(url: string): Promise<T> => {
  const res = await http(url, { headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 403) throw new Error("GitHub's rate limit for anonymous requests is used up. Try again within the hour.");
  if (!res.ok) throw new Error(res.status === 404 ? "GitHub has no such repo, or it's private." : `GitHub answered ${res.status}.`);
  return (await res.json()) as T;
};
const rawText = async (url: string): Promise<string> => {
  const res = await http(url);
  if (!res.ok) throw new Error(`Couldn't fetch ${new URL(url).pathname.split("/").pop()} (${res.status}).`);
  return res.text();
};

/**
 * `npx skills add owner/repo [--skill name]`, owner/repo, or a GitHub link: lists every SKILL.md
 * in the repo at its latest commit, pinned to that commit, and asks which to install.
 */
export async function importGit(input: string) {
  const src = parseSkillSource(input);
  if (!src) return toast("Paste owner/repo, a GitHub link, or an `npx skills add …` line.", "error");
  try {
    const meta = await ghJson<{ default_branch: string }>(`https://api.github.com/repos/${src.owner}/${src.repo}`);
    const commit = await ghJson<{ sha: string }>(`https://api.github.com/repos/${src.owner}/${src.repo}/commits/${meta.default_branch}`);
    const tree = await ghJson<{ tree: { path: string; type: string; size?: number }[] }>(`https://api.github.com/repos/${src.owner}/${src.repo}/git/trees/${commit.sha}?recursive=1`);
    const blobs = tree.tree.filter((t) => t.type === "blob");
    let roots = blobs.filter((t) => /(^|\/)SKILL\.md$/i.test(t.path)).map((t) => t.path.replace(/\/?SKILL\.md$/i, ""));
    if (src.path) roots = roots.filter((d) => d === src.path || d.startsWith(`${src.path}/`));
    if (src.skill) roots = roots.filter((d) => d.split("/").pop() === src.skill);
    if (!roots.length) return toast(`No SKILL.md found in ${src.owner}/${src.repo}${src.skill ? ` for ${src.skill}` : ""}.`, "error");
    const raw = (path: string) => `https://raw.githubusercontent.com/${src.owner}/${src.repo}/${commit.sha}/${path}`;
    const files: SkillFile[] = [];
    for (const dir of roots.slice(0, 40)) {
      files.push({ path: dir ? `${dir}/SKILL.md` : "SKILL.md", content: await rawText(raw(dir ? `${dir}/SKILL.md` : "SKILL.md")) });
      const refs = blobs.filter((b) => (dir ? b.path.startsWith(`${dir}/`) : !b.path.includes("/")) && /\.(md|txt)$/i.test(b.path) && !/SKILL\.md$/i.test(b.path) && (b.size ?? 0) < 200_000).slice(0, 12);
      for (const ref of refs) files.push({ path: ref.path, content: await rawText(raw(ref.path)) });
    }
    const found = findSkills(files).map((f) => ({ ...f, ref: commit.sha, ...parseSkillMd(f.skill.content, f.dir.split("/").pop() || src.repo), selected: true }));
    const source = `git:${src.owner}/${src.repo}`;
    if (found.length === 1) return install(found, source, `${src.owner}/${src.repo}`, { author: src.owner });
    set({ pending: { source, label: `${src.owner}/${src.repo}`, choices: found } });
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), "error");
  }
}

/** The UI Skills catalog, read from its public registry. */
export async function loadCatalog() {
  try {
    set({ catalog: parseRegistry(await rawText(REGISTRY)) });
  } catch (e) {
    toast(`Couldn't load the UI Skills catalog: ${e instanceof Error ? e.message : String(e)}`, "error");
  }
}

export async function installFromCatalog(entry: CatalogEntry) {
  try {
    const text = await rawText(entry.url);
    await install([{ dir: "", name: entry.name, description: entry.description, skill: { path: "SKILL.md", content: text }, refs: [], selected: true }], `catalog:${entry.id}`, entry.id, { author: entry.author, ref: entry.url });
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), "error");
  }
}

/**
 * Third-party skills are pinned. This fetches the source again; if the text changed, it comes
 * back as a diff to look at before updating.
 */
export async function checkForUpdate(skill: SkillRow): Promise<{ before: string; after: string } | null> {
  const before = (await repo().skillBody(skill.id)) ?? "";
  let afterText: string;
  if (skill.source.startsWith("catalog:") && skill.ref) afterText = await rawText(skill.ref);
  else if (skill.source.startsWith("git:")) {
    const [owner, repoName, ...dir] = skill.source.slice(4).split("/");
    const meta = await ghJson<{ default_branch: string }>(`https://api.github.com/repos/${owner}/${repoName}`);
    afterText = await rawText(`https://raw.githubusercontent.com/${owner}/${repoName}/${meta.default_branch}/${[...dir, "SKILL.md"].join("/")}`);
  } else return null;
  const after = parseSkillMd(afterText).body;
  return after.trim() === before.trim() ? null : { before, after };
}

export async function applyUpdate(skill: SkillRow, body: string) {
  const parsed = parseSkillMd(body);
  await repo().saveSkill({ name: skill.name, description: skill.description, author: skill.author, source: skill.source, kind: skill.kind, mode: skill.mode, body: parsed.body || body, tokens: skillTokens(body), ref: skill.ref });
  await loadSkills();
}

// ── switches ────────────────────────────────────────────────────────────────

export async function setGlobal(id: string, enabled: boolean) {
  await repo().updateSkill(id, { enabled });
  await loadSkills();
}

/** true/false overrides the global switch for this project; undefined goes back to following it. */
export async function setOverride(id: string, value: boolean | undefined) {
  const overrides = { ...get().overrides };
  if (value === undefined) delete overrides[id];
  else overrides[id] = value;
  set({ overrides });
  await repo().setSetting(overridesKey(), overrides);
}

export async function setPhases(id: string, phases: Phase[]) {
  await repo().updateSkill(id, { phases });
  await loadSkills();
}

export async function setMode(id: string, mode: SkillMode) {
  await repo().updateSkill(id, { mode });
  await loadSkills();
}

export async function removeSkill(id: string) {
  await repo().removeSkill(id);
  await setOverride(id, undefined);
  await loadSkills();
}

// ── the Craft Brief ─────────────────────────────────────────────────────────

/** Asks Claude to fold every always-on skill into one brief, with what's been resolved already. */
export async function compileBrief() {
  if (get().compiling) return;
  const r = repo();
  const active = activeSkills();
  if (!active.length) return toast("Turn on at least one Always-on skill to compile a brief.", "error");
  set({ compiling: true });
  try {
    const skills: CompileSkill[] = [];
    for (const s of active) skills.push({ id: s.id, version: s.version, name: s.name, kind: s.kind, phases: s.phases, body: (await r.skillBody(s.id)) ?? "" });
    const { philosophy, ds } = useCraft.getState();
    const { resolutions, candidate, brief } = get();
    const past = [...(candidate?.conflicts ?? []), ...(brief?.content.conflicts ?? [])];
    const resolved = Object.entries(resolutions).map(([key, res]) => {
      const c = past.find((x) => x.key === key);
      return { key, topic: c?.topic ?? key.split("|").pop()!.replace(/-/g, " "), outcome: c ? describeResolution(c, res) : "resolved earlier" };
    });
    const req = routedRequest("compile", compileRequest({ skills, philosophy: philosophy?.content ?? null, designSystem: ds ? digest(ds.content) : null, resolved, model: OPUS }));
    const res = await llmClient().stream(req, { signal: new AbortController().signal });
    if (res.stopReason === "refusal") throw new Error(res.refusal ?? "Claude declined to compile.");
    const next = parseCompile(res.text, skills, resolutions);
    set({ candidate: next });
    await r.setSetting(CANDIDATE, next);
    await r.decide(useProject.getState().project?.id ?? null, "compile", `Compiled a Craft Brief from ${skills.length} skill${skills.length === 1 ? "" : "s"}: ${next.conflicts.length} conflict${next.conflicts.length === 1 ? "" : "s"} to resolve, ${next.flagged.length} flagged.`);
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), "error");
  } finally {
    set({ compiling: false });
  }
}

/** Resolves one conflict: the brief changes now, and the next compile reuses the choice. */
export async function resolveConflict(key: string, resolution: Resolution) {
  const r = repo();
  const { candidate } = get();
  const resolutions = { ...get().resolutions, [key]: resolution };
  const next = candidate ? applyResolution(candidate, key, resolution) : null;
  set({ resolutions, candidate: next });
  await r.setSetting(RESOLUTIONS, resolutions);
  await r.setSetting(CANDIDATE, next);
}

export async function discardCandidate() {
  set({ candidate: null });
  await repo().setSetting(CANDIDATE, null);
}

const versionAfter = (v: string | undefined) => `v${(Number.parseInt(v?.replace(/^v/, "") ?? "0", 10) || 0) + 1}`;

/** Sends a fully resolved candidate into the proposal flow, where it replays before it can go live. */
export async function proposeBrief(): Promise<ProposalRow | undefined> {
  const { candidate, brief } = get();
  if (!candidate || candidate.conflicts.length) return;
  const r = repo();
  const version = versionAfter(brief?.row.version);
  const { added, removed } = briefDiff(brief?.content ?? null, candidate);
  const p = await r.createProposal({
    targetKind: "craft_brief",
    baseVersion: brief?.row.version ?? null,
    diff: { version, brief: candidate, added, removed },
    rationale: `Compiled from ${candidate.sources.length} skill${candidate.sources.length === 1 ? "" : "s"}: ${added.length} principle${added.length === 1 ? "" : "s"} added, ${removed.length} removed.`,
  });
  await discardCandidate();
  await loadCraft();
  toast(`Brief ${version} proposed. Replay it on past briefs, then keep it.`, "success");
  return p;
}

/** Called by Foundations' accept: the brief goes live and every run's foundations pick it up. */
export async function keepBrief(p: ProposalRow) {
  const r = repo();
  const d = p.diff as { version: string; brief: CraftBrief; added: string[]; removed: string[] };
  const prev = get().brief;
  const row = await r.saveFoundation("craft_brief", d.version, d.brief, { kind: "compiled", title: `Craft Brief ${d.version}`, text: p.rationale }, prev?.row.id ?? null);
  await r.resolveProposal(p.id, "accepted", `Kept Craft Brief ${d.version}`, row.id);
  await loadSkills();
  await loadCraft();
  toast(`Craft Brief ${d.version} is live. Every run's foundations carry it.`, "success");
}

/** For a run: the brief's principles for its phase, and the skills behind them (id@version). */
export function briefForRun(phase: Phase): { version: string; principles: { text: string; sources: string[] }[]; skillIds: string[] } | null {
  const { brief, skills, overrides } = get();
  if (!brief) return null;
  const on = new Set(skills.filter((s) => s.mode === "always" && skillApplies(s, overrides[s.id], phase)).map((s) => s.id));
  const principles = briefFor(brief.content, phase).filter((p) => p.sources.some((s) => on.has(s)));
  // Only skills that are on here are recorded, even when an off one also backed a principle.
  const ids = [...new Set(principles.flatMap((p) => p.sources.filter((s) => on.has(s))))];
  const version = (id: string) => skills.find((s) => s.id === id)?.version ?? 0;
  return { version: brief.row.version, principles, skillIds: ids.map((id) => `skill:${id}@${version(id)}`) };
}

// ── on-demand reviews ───────────────────────────────────────────────────────

/** Runs an on-demand skill whole against a Claude node's latest output, and keeps the card. */
export async function reviewNode(nodeId: Id, skillId: string) {
  const r = repo();
  const { graph, blobs } = useProject.getState();
  const node = graph.nodes[nodeId];
  const out = graph.outputs[nodeId];
  const skill = get().skills.find((s) => s.id === skillId);
  if (!node || !out || !skill) return;
  const art = blobs.get(out.hash) as TextArtifact | undefined;
  if (!art) return;
  set({ reviewing: nodeId });
  try {
    const body = (await r.skillBody(skillId)) ?? "";
    const html = (art.data as { html?: string } | undefined)?.html;
    const res = await llmClient().stream(routedRequest("review", reviewRequest({ name: skill.name, body }, { title: node.title, text: art.text, ...(html ? { html } : {}) }, OPUS)), { signal: new AbortController().signal });
    if (res.stopReason === "refusal") throw new Error(res.refusal ?? "Claude declined the review.");
    const review: NodeReview = { skillId, skillName: skill.name, runId: out.runId, review: JSON.parse(res.text) as SkillReview, at: new Date().toISOString() };
    await r.setSetting(reviewKey(nodeId), review);
    set((s) => ({ reviews: { ...s.reviews, [nodeId]: review } }));
  } catch (e) {
    toast(e instanceof Error ? e.message : String(e), "error");
  } finally {
    set({ reviewing: null });
  }
}

export async function loadReview(nodeId: Id) {
  const review = await repo().getSetting<NodeReview>(reviewKey(nodeId));
  if (review) set((s) => ({ reviews: { ...s.reviews, [nodeId]: review } }));
}

/** Each "what's off" becomes a note pinned to the output, so the next run answers it and evals keep it. */
export function pinReview(nodeId: Id) {
  const review = get().reviews[nodeId];
  if (!review) return;
  for (const item of review.review.whats_off) actions.addNote(nodeId, { kind: "field", field: "review", quote: review.skillName }, item);
  toast(`Pinned ${review.review.whats_off.length} note${review.review.whats_off.length === 1 ? "" : "s"} from ${review.skillName}. The next run answers them.`, "success");
}

// ── evidence ────────────────────────────────────────────────────────────────

/** Average score of scored runs that used a skill, beside those that didn't. */
export async function skillScores(): Promise<Record<string, { with: number; withN: number; without: number; withoutN: number }>> {
  const scored = await repo().scoredRuns();
  const out: Record<string, { with: number; withN: number; without: number; withoutN: number }> = {};
  for (const s of get().skills) {
    const used = (ids: string[]) => ids.some((x) => x.startsWith(`skill:${s.id}@`));
    const yes = scored.filter((x) => used(x.run.foundationIds));
    const no = scored.filter((x) => !used(x.run.foundationIds));
    const avg = (xs: typeof scored) => (xs.length ? xs.reduce((a, x) => a + x.score, 0) / xs.length : 0);
    out[s.id] = { with: avg(yes), withN: yes.length, without: avg(no), withoutN: no.length };
  }
  return out;
}
