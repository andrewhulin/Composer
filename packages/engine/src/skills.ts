import { PHASES, type Phase } from "@composer/core";
import { estimateTokens } from "./assembly/units";
import type { LlmRequest } from "./llm";
import type { Philosophy } from "./foundations";

/**
 * Design skills: Agent Skills folders (a SKILL.md with name and description frontmatter, plus
 * optional reference files) that Composer folds into one Craft Brief, or calls on demand.
 */

/** craft: visual polish, type, layout. motion. systems: tokens and implementation. audit: read-only reviewers. exploration: variant generators. router: picks other skills. */
export type SkillKind = "craft" | "motion" | "systems" | "audit" | "exploration" | "router";
/** always: its principles go into the Craft Brief. on_demand: an action you or Claude call, never in the brief. */
export type SkillMode = "always" | "on_demand";

export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
  author?: string;
}

export interface SkillFile {
  path: string;
  content: string;
}

/** Splits `---` frontmatter (simple `key: value`, quoted, or folded `>` / `|` blocks) from the body. */
export function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { meta: {}, body: text.trim() };
  const meta: Record<string, string> = {};
  const lines = m[1]!.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]!);
    if (!kv) continue;
    let value = kv[2]!.trim();
    if (value === ">" || value === "|" || value === ">-" || value === "|-") {
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]!)) block.push(lines[++i]!.trim());
      value = block.join(value.startsWith(">") ? " " : "\n");
    } else if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    meta[kv[1]!.toLowerCase()] = value;
  }
  return { meta, body: m[2]!.trim() };
}

/** A SKILL.md as Composer stores it. Without a name in the frontmatter, the first heading or the folder names it. */
export function parseSkillMd(text: string, fallbackName = "Untitled skill"): ParsedSkill {
  const { meta, body } = parseFrontmatter(text);
  const heading = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  const description = meta.description || body.split(/\n\s*\n/).find((p) => p.trim() && !p.trim().startsWith("#"))?.trim().slice(0, 240) || "";
  return { name: meta.name || heading || fallbackName, description, body, ...(meta.author ? { author: meta.author } : {}) };
}

const KIND_WORDS: [SkillKind, RegExp][] = [
  ["router", /\b(router|routes? (to|between)|pick(s)? the (right|smallest)|which skills?)\b/i],
  ["audit", /\b(audit|review|critique|critic|lint|check(s|ing)? (for|against)|accessibility|a11y|what'?s off|fixing)\b/i],
  ["motion", /\b(motion|animat\w*|transition|easing|spring|gsap|scroll-?trigger)\b/i],
  ["exploration", /\b(explor\w*|variants?|ideat\w*|generate (options|directions)|divergent)\b/i],
  ["systems", /\b(design tokens?|tokens|component library|tailwind|css variables|implementation|codebase|design system)\b/i],
];

/** A best guess from the name and description; the panel lets you change it. */
export function inferKind(skill: Pick<ParsedSkill, "name" | "description">): SkillKind {
  const text = `${skill.name} ${skill.description}`;
  return KIND_WORDS.find(([, re]) => re.test(text))?.[0] ?? "craft";
}

/** Reviewers and generators are actions; principles ride along in the brief. */
export const defaultMode = (kind: SkillKind): SkillMode => (kind === "audit" || kind === "exploration" || kind === "router" ? "on_demand" : "always");
/** Routers come in off: Composer's compile and phase scoping already do their job. */
export const defaultEnabled = (kind: SkillKind): boolean => kind !== "router";

export const skillTokens = (body: string): number => estimateTokens(body);

/** Groups a folder's files into skills: every directory holding a SKILL.md, with the files under it. */
export function findSkills(files: SkillFile[]): { dir: string; skill: SkillFile; refs: SkillFile[] }[] {
  const norm = files.map((f) => ({ ...f, path: f.path.replace(/\\/g, "/").replace(/^\.?\//, "") }));
  const roots = norm.filter((f) => /(^|\/)SKILL\.md$/i.test(f.path)).map((f) => ({ dir: f.path.replace(/\/?SKILL\.md$/i, ""), skill: f }));
  return roots.map(({ dir, skill }) => ({
    dir,
    skill,
    refs: norm.filter((f) => f !== skill && (dir === "" ? true : f.path.startsWith(`${dir}/`)) && !roots.some((r) => r.dir !== dir && r.dir.startsWith(dir ? `${dir}/` : "") && f.path.startsWith(`${r.dir}/`))),
  }));
}

/** `npx skills add owner/repo --skill name`, `owner/repo`, or a GitHub repo or folder link. */
export function parseSkillSource(input: string): { owner: string; repo: string; skill?: string; path?: string } | null {
  const s = input.trim();
  const npx = /(?:npx\s+)?skills\s+add\s+([\w.-]+)\/([\w.-]+)(?:\s+--skill\s+([\w.-]+))?/.exec(s);
  if (npx) return { owner: npx[1]!, repo: npx[2]!, ...(npx[3] ? { skill: npx[3] } : {}) };
  const gh = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/[^/]+\/(.+?))?\/?$/.exec(s);
  if (gh) return { owner: gh[1]!, repo: gh[2]!, ...(gh[3] ? { path: gh[3] } : {}) };
  const short = /^([\w.-]+)\/([\w.-]+)$/.exec(s);
  if (short) return { owner: short[1]!, repo: short[2]! };
  return null;
}

export interface CatalogEntry {
  id: string;
  author: string;
  name: string;
  url: string;
  description: string;
}

/** The UI Skills registry: one skill per line, tab-separated `owner/name`, file URL, description. */
export function parseRegistry(text: string): CatalogEntry[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.split("\t"))
    .filter((p) => p.length >= 2 && /^[\w.-]+\/[\w.-]+$/.test(p[0]!.trim()) && /^https?:\/\//.test(p[1]!.trim()))
    .map(([id, url, ...rest]) => {
      const [author, name] = id!.trim().split("/") as [string, string];
      return { id: id!.trim(), author, name, url: url!.trim(), description: rest.join(" ").trim() };
    });
}

/** Whether a skill applies to a run: the project's override, else its global switch; then its phases. */
export function skillApplies(skill: { enabled: boolean; phases: Phase[] }, projectOverride: boolean | undefined, phase?: Phase): boolean {
  if (!(projectOverride ?? skill.enabled)) return false;
  return !phase || !skill.phases.length || skill.phases.includes(phase);
}

// ── the Craft Brief ─────────────────────────────────────────────────────────

export interface BriefPrinciple {
  text: string;
  /** Skill ids it came from. Two skills saying the same thing merge into one principle citing both. */
  sources: string[];
}

export interface BriefConflict {
  /** Stable across compiles, so a resolution is reused. */
  key: string;
  topic: string;
  a: { skill: string; says: string };
  b: { skill: string; says: string };
}

export type Resolution = { choice: "a" | "b" } | { choice: "scope"; a: Phase[]; b: Phase[] } | { choice: "both"; note: string };

/** A skill that disagrees with the philosophy. Flagged, never applied. */
export interface PhilosophyFlag {
  skill: string;
  principle: number;
  says: string;
  why: string;
}

export interface CraftBrief {
  v: 1;
  general: BriefPrinciple[];
  phases: Partial<Record<Phase, BriefPrinciple[]>>;
  conflicts: BriefConflict[];
  flagged: PhilosophyFlag[];
  /** The skills (id@version) it was compiled from, to tell when it's stale. */
  sources: string[];
}

export interface CompileSkill {
  id: string;
  version: number;
  name: string;
  kind: SkillKind;
  phases: Phase[];
  body: string;
}

const nullable = <T extends object>(s: T) => ({ anyOf: [s, { type: "null" }] });
const principleSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "sources", "phase"],
  properties: {
    text: { type: "string" },
    sources: { type: "array", items: { type: "string" } },
    phase: nullable({ type: "string", enum: [...PHASES] }),
  },
};

export const COMPILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["principles", "conflicts", "flagged"],
  properties: {
    principles: { type: "array", items: principleSchema },
    conflicts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "a_skill", "a_says", "b_skill", "b_says"],
        properties: { topic: { type: "string" }, a_skill: { type: "string" }, a_says: { type: "string" }, b_skill: { type: "string" }, b_says: { type: "string" } },
      },
    },
    flagged: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["skill", "principle", "says", "why"],
        properties: { skill: { type: "string" }, principle: { type: "integer" }, says: { type: "string" }, why: { type: "string" } },
      },
    },
  },
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

/** The same pair of skills on the same topic gets the same key, whichever way round Claude lists them. */
export const conflictKey = (a: string, b: string, topic: string): string => `${[a, b].sort().join("|")}|${slug(topic)}`;

const resolutionText = (c: BriefConflict, r: Resolution): string => {
  const bare = (s: string) => s.trim().replace(/[.\s]+$/, "");
  if (r.choice === "both") return `Tradeoff: ${bare(c.a.says)} vs ${bare(c.b.says)}.${r.note.trim() ? ` ${r.note.trim()}` : ""}`;
  return r.choice === "a" ? c.a.says : c.b.says;
};

/** Folds one resolved conflict into the brief's principles and takes it off the list. */
export function applyResolution(brief: CraftBrief, key: string, r: Resolution): CraftBrief {
  const c = brief.conflicts.find((x) => x.key === key);
  if (!c) return brief;
  const next: CraftBrief = { ...brief, general: [...brief.general], phases: { ...brief.phases }, conflicts: brief.conflicts.filter((x) => x.key !== key) };
  const add = (p: BriefPrinciple, phase?: Phase) => {
    if (phase) next.phases[phase] = [...(next.phases[phase] ?? []), p];
    else next.general.push(p);
  };
  if (r.choice === "scope") {
    for (const ph of r.a) add({ text: c.a.says, sources: [c.a.skill] }, ph);
    for (const ph of r.b) add({ text: c.b.says, sources: [c.b.skill] }, ph);
  } else {
    add({ text: resolutionText(c, r), sources: r.choice === "both" ? [c.a.skill, c.b.skill] : [r.choice === "a" ? c.a.skill : c.b.skill] });
  }
  return next;
}

/**
 * The compile request: every always-on skill that applies, under the philosophy and design
 * system, folded into one brief. Known resolutions are passed in so they aren't asked again.
 */
export function compileRequest(input: { skills: CompileSkill[]; philosophy: Philosophy | null; designSystem: string | null; resolved: { key: string; topic: string; outcome: string }[]; model: string; maxPerSkill?: number }): LlmRequest {
  const cap = (input.maxPerSkill ?? 6000) * 4;
  const skills = input.skills
    .map((s) => `<skill id="${s.id}" name="${s.name}" kind="${s.kind}" phases="${s.phases.length ? s.phases.join(",") : "all"}">\n${s.body.length > cap ? `${s.body.slice(0, cap)}\n[… trimmed]` : s.body}\n</skill>`)
    .join("\n\n");
  const philosophy = input.philosophy ? input.philosophy.principles.map((p) => `${String(p.n).padStart(2, "0")}. ${p.text}`).join("\n") : "None slotted.";
  const resolved = input.resolved.length ? input.resolved.map((r) => `- ${r.topic}: ${r.outcome}`).join("\n") : "None yet.";
  const system = `You compile a designer's design skills into one Craft Brief: the short list of principles every Claude step in Composer follows.

Precedence, highest first: the designer's philosophy, then the design system, then skills. A skill never overrides either.

Write principles, not instructions about skills:
- One rule of craft per principle, in plain words, under 30 words. Keep the skill's concrete numbers and terms.
- Merge duplicates: when two skills say the same thing, write it once and cite both in "sources".
- Cite skills by their id, exactly as given. Every principle cites at least one.
- "phase" is null for a principle that holds everywhere; otherwise the one phase it's for (understand, define, build, validate, share). A skill scoped to some phases only produces principles for those.
- Leave out procedure (how to run the skill, file layouts, install steps) and anything only one product could use.

Conflicts: when two skills disagree (for example dense vs airy spacing), list the conflict instead of choosing, with each side in that skill's words. Don't list a disagreement the designer already resolved; apply their resolution as a principle instead.

Flags: when a skill contradicts a philosophy principle, list it under "flagged" with the principle's number. Don't turn it into a principle.`;
  const user = `<philosophy>\n${philosophy}\n</philosophy>\n\n<design_system>\n${input.designSystem ?? "None slotted."}\n</design_system>\n\n<resolved>\n${resolved}\n</resolved>\n\n${skills}\n\nCompile the Craft Brief.`;
  return { model: input.model, maxTokens: 16_000, effort: "high", system: [{ type: "text", text: system }], messages: [{ role: "user", content: user }], schema: COMPILE_SCHEMA };
}

interface RawCompile {
  principles: { text: string; sources: string[]; phase: Phase | null }[];
  conflicts: { topic: string; a_skill: string; a_says: string; b_skill: string; b_says: string }[];
  flagged: { skill: string; principle: number; says: string; why: string }[];
}

/**
 * Turns Claude's compile into a brief: drops citations of skills that weren't given, merges
 * principles that came back twice, and applies any conflict the designer already resolved.
 */
export function parseCompile(raw: RawCompile | string, skills: CompileSkill[], resolutions: Record<string, Resolution> = {}): CraftBrief {
  const data = (typeof raw === "string" ? JSON.parse(raw) : raw) as RawCompile;
  const known = new Set(skills.map((s) => s.id));
  let brief: CraftBrief = { v: 1, general: [], phases: {}, conflicts: [], flagged: [], sources: skills.map((s) => `${s.id}@${s.version}`).sort() };
  const seen = new Map<string, BriefPrinciple>();
  for (const p of data.principles ?? []) {
    const sources = [...new Set(p.sources.filter((s) => known.has(s)))];
    const text = p.text.trim();
    if (!sources.length || !text) continue;
    const phase = p.phase && PHASES.includes(p.phase) ? p.phase : null;
    const k = `${phase ?? "all"}|${text.toLowerCase().replace(/\W+/g, " ").trim()}`;
    const dup = seen.get(k);
    if (dup) {
      dup.sources = [...new Set([...dup.sources, ...sources])];
      continue;
    }
    const principle = { text, sources };
    seen.set(k, principle);
    if (phase) brief.phases[phase] = [...(brief.phases[phase] ?? []), principle];
    else brief.general.push(principle);
  }
  for (const c of data.conflicts ?? []) {
    if (!known.has(c.a_skill) || !known.has(c.b_skill) || c.a_skill === c.b_skill) continue;
    const key = conflictKey(c.a_skill, c.b_skill, c.topic);
    if (brief.conflicts.some((x) => x.key === key)) continue;
    brief.conflicts.push({ key, topic: c.topic, a: { skill: c.a_skill, says: c.a_says }, b: { skill: c.b_skill, says: c.b_says } });
  }
  brief.flagged = (data.flagged ?? []).filter((f) => known.has(f.skill));
  for (const [key, r] of Object.entries(resolutions)) brief = applyResolution(brief, key, r);
  return brief;
}

/** What a resolution chose, in words, for the next compile's <resolved> list. */
export function describeResolution(c: Pick<BriefConflict, "a" | "b">, r: Resolution): string {
  if (r.choice === "scope") return `${c.a.says} in ${r.a.join(", ") || "no phase"}; ${c.b.says} in ${r.b.join(", ") || "no phase"}`;
  return resolutionText({ key: "", topic: "", ...c }, r);
}

/** The principles a phase's runs get: everything general, then that phase's own. */
export function briefFor(brief: CraftBrief, phase: Phase): BriefPrinciple[] {
  return [...brief.general, ...(brief.phases[phase] ?? [])];
}

/** Added and removed principle texts, for the proposal's diff. */
export function briefDiff(prev: CraftBrief | null, next: CraftBrief): { added: string[]; removed: string[] } {
  const all = (b: CraftBrief | null) => (b ? [...b.general, ...PHASES.flatMap((p) => b.phases[p] ?? [])].map((x) => x.text) : []);
  const before = new Set(all(prev));
  const after = new Set(all(next));
  return { added: [...after].filter((t) => !before.has(t)), removed: [...before].filter((t) => !after.has(t)) };
}

/** Stale when the always-on skills (or their versions) differ from what the brief was compiled from. */
export const briefStale = (brief: CraftBrief | null, active: { id: string; version: number }[]): boolean =>
  !!brief && brief.sources.join(",") !== active.map((s) => `${s.id}@${s.version}`).sort().join(",");

// ── on-demand reviews ───────────────────────────────────────────────────────

/** The shape review skills such as Shift Nudge's answer in; rendered as a card on the node. */
export interface SkillReview {
  summary: string;
  whats_off: string[];
  questions: string[];
  one_thing: string;
  working_well: string[];
}

export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "whats_off", "questions", "one_thing", "working_well"],
  properties: {
    summary: { type: "string" },
    whats_off: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    one_thing: { type: "string" },
    working_well: { type: "array", items: { type: "string" } },
  },
};

/** Runs one on-demand skill, whole, against a node's output. */
export function reviewRequest(skill: { name: string; body: string }, output: { title: string; text: string; html?: string }, model: string): LlmRequest {
  const system = `You are running the design skill "${skill.name}" as a review. Follow it exactly, and answer in its shape: a one-paragraph summary, what's off (specific, each one a thing to fix), questions to push the work, the one thing to try next, and what's working well.\n\n<skill>\n${skill.body}\n</skill>`;
  const body = output.html ? `${output.text}\n\nThe prototype's HTML:\n${output.html.slice(0, 60_000)}` : output.text;
  return { model, maxTokens: 8000, effort: "high", system: [{ type: "text", text: system }], messages: [{ role: "user", content: `Review "${output.title}".\n\n${body}` }], schema: REVIEW_SCHEMA };
}
