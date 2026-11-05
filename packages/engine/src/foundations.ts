/**
 * The two always-on slots. The design system is read only to Composer and changes only through an
 * accepted proposal; the philosophy sharpens from the designer's decisions. Both are imported from
 * markdown (the designer's own skill files) and stored as versioned blobs.
 */
import type { Phase } from "@composer/core";
import type { Foundations } from "./assembly/prompt";
import { pairsBlock, type PickedPair } from "./replay";
import { normalizeColor, type LintResult, type TokenSet } from "./lint";
import type { LlmRequest } from "./llm";

export interface DsToken {
  name: string;
  kind: "color" | "space" | "radius";
  value: string;
  dark?: string;
  group: string;
}

export interface TypeStyle {
  name: string;
  family: string;
  weight: number;
  size: number;
  lineHeight: string;
}

export interface DesignSystem {
  v: 1;
  kind: "design_system";
  name: string;
  version: string;
  source: string;
  tokens: DsToken[];
  type: TypeStyle[];
  components: string[];
  /** The usage guide, verbatim: the rules for choosing tokens ride along in every prompt. */
  doc: string;
}

export type Strength = "forming" | "steady" | "strong" | "locked";

export interface Principle {
  n: number;
  text: string;
  strength: Strength;
  scope?: string;
  /** Decisions that sharpened or confirmed it; seeded principles start from the designer's own writing. */
  decisions?: number;
}

export interface Philosophy {
  v: 1;
  kind: "philosophy";
  rev: number;
  source: string;
  principles: Principle[];
  doc: string;
}

export interface MdTable {
  heading: string;
  header: string[];
  rows: string[][];
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/** Every markdown table with the nearest heading above it. */
export function parseMarkdownTables(md: string): MdTable[] {
  const lines = md.split(/\r?\n/);
  const out: MdTable[] = [];
  let heading = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      heading = h[1]!.trim();
      continue;
    }
    if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      const header = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim().startsWith("|")) rows.push(cells(lines[i++]!));
      i--;
      out.push({ heading, header, rows });
    }
  }
  return out;
}

const HEX = /#[0-9a-fA-F]{6}\b/g;
const tick = (cell: string) => /`([^`]+)`/.exec(cell)?.[1];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** A design system from a token reference (tables) plus its usage guide. */
export function parseDesignSystem(tokensMd: string, guideMd = "", source = ""): DesignSystem {
  const tokens: DsToken[] = [];
  const type: TypeStyle[] = [];
  const seen = new Set<string>();
  const add = (t: DsToken) => {
    if (seen.has(t.name)) return;
    seen.add(t.name);
    tokens.push(t);
  };
  for (const t of parseMarkdownTables(tokensMd)) {
    const head = t.header.map((h) => h.toLowerCase());
    const heading = t.heading.toLowerCase();
    if (head.includes("size") && head.includes("weight")) {
      const at = (k: string) => head.indexOf(k);
      for (const r of t.rows) {
        const size = Number.parseFloat(r[at("size")] ?? "");
        if (!Number.isFinite(size)) continue;
        type.push({ name: tick(r[0]!) ?? r[0]!, family: r[at("family")] ?? "", weight: Number.parseFloat(r[at("weight")] ?? "400") || 400, size, lineHeight: r[at("line height")] ?? "" });
      }
      continue;
    }
    if (heading.includes("radius")) {
      for (const r of t.rows) {
        const px = /(\d+(?:\.\d+)?)px/.exec(r.join(" "));
        if (px) add({ name: tick(r[0]!) ?? `radius/${px[1]}`, kind: "radius", value: `${px[1]}px`, group: "Radius" });
      }
      continue;
    }
    if (heading.includes("spacing")) {
      for (const r of t.rows) {
        const px = /(\d+(?:\.\d+)?)px/.exec(r.join(" "));
        if (px) add({ name: tick(r[0]!) ?? `spacing/${px[1]}`, kind: "space", value: `${px[1]}px`, group: "Spacing" });
      }
      continue;
    }
    for (const r of t.rows) {
      const hexes = r.join(" ").match(HEX);
      if (!hexes) continue;
      const name = tick(r[0]!) ?? `${slug(t.heading)}/${slug(r[0]!)}`;
      const group = t.heading.replace(/\s*\(.*\)\s*$/, "").replace(/\*/g, "").trim();
      add({ name, kind: "color", value: hexes[0]!.toLowerCase(), ...(hexes[1] && head.includes("dark") ? { dark: hexes[1].toLowerCase() } : {}), group });
    }
  }
  const title = /^#\s+(.*)$/m.exec(tokensMd)?.[1] ?? /^#\s+(.*)$/m.exec(guideMd)?.[1] ?? "Design system";
  const name = title.replace(/\s*(design tokens|—|-).*$/i, "").trim() || "Design system";
  const version = /(\d+(?:\.\d+)+)/.exec(title)?.[1] ?? "1.0";
  const components = componentsIn(guideMd);
  return { v: 1, kind: "design_system", name, version, source, tokens, type, components, doc: guideMd.trim() };
}

/** Component names: the ### headings under a "Components" section of the guide. */
function componentsIn(md: string): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of md.split(/\r?\n/)) {
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) inside = /component/i.test(h2[1]!);
    const h3 = inside ? /^###\s+(.*)$/.exec(line) : null;
    if (h3) out.push(h3[1]!.trim());
  }
  return out;
}

/** A philosophy from the designer's own writing: the "How to apply" list becomes the principles. */
export function parsePhilosophy(md: string, source = ""): Philosophy {
  const lines = md.split(/\r?\n/);
  let start = lines.findIndex((l) => /^#{2,3}\s+how to apply/i.test(l));
  if (start < 0) start = lines.findIndex((l) => /^#{2,3}\s+principles/i.test(l));
  const principles: Principle[] = [];
  if (start >= 0) {
    for (let i = start + 1; i < lines.length && !/^#{1,3}\s/.test(lines[i]!); i++) {
      const m = /^\s*(?:\d+\.|[-*])\s+(.*)$/.exec(lines[i]!);
      if (m) principles.push({ n: principles.length + 1, text: m[1]!.replace(/\*\*/g, "").trim(), strength: "steady" });
    }
  }
  return { v: 1, kind: "philosophy", rev: 1, source, principles, doc: md.trim() };
}

/** What the on-system lint checks against: every color in either mode, every radius and type size. */
export function tokenSet(ds: DesignSystem): TokenSet {
  return {
    colors: ds.tokens.filter((t) => t.kind === "color").flatMap((t) => [t.value, ...(t.dark ? [t.dark] : [])]),
    radii: ds.tokens.filter((t) => t.kind === "radius").map((t) => Number.parseFloat(t.value)),
    fontSizes: [...new Set(ds.type.map((t) => t.size))],
  };
}

/** The design system as Claude reads it: the usage guide, then the exact values. */
export function digest(ds: DesignSystem): string {
  const colors = ds.tokens.filter((t) => t.kind === "color" && isSemantic(t.name));
  const lines = [
    ds.doc,
    "",
    "Token values:",
    ...colors.map((t) => `${t.name}: ${t.value}${t.dark ? ` (dark ${t.dark})` : ""}`),
    ...ds.type.map((t) => `${t.name}: ${t.family} ${t.weight} ${t.size}px / ${t.lineHeight}`),
    `spacing: ${ds.tokens.filter((t) => t.kind === "space").map((t) => t.value).join(", ")}`,
    `radius: ${ds.tokens.filter((t) => t.kind === "radius").map((t) => `${t.name} ${t.value}`).join(", ")}`,
  ];
  return lines.join("\n").trim();
}

export function foundationsFor(ds: DesignSystem | null, ph: Philosophy | null): Foundations {
  return {
    ...(ds ? { designSystem: { version: `${ds.name} v${ds.version}`, digest: digest(ds) } } : {}),
    ...(ph ? { philosophy: { rev: ph.rev, principles: ph.principles.map((p) => ({ n: p.n, text: p.text, strength: p.strength })), doc: ph.doc } } : {}),
  };
}

/** "3.2" → "3.3"; "2" → "2.1". */
export function bumpVersion(v: string): string {
  const parts = v.split(".").map((p) => Number.parseInt(p, 10) || 0);
  if (parts.length < 2) parts.push(0);
  parts[parts.length - 1]! += 1;
  return parts.join(".");
}

/** Strength follows the evidence: decisions that cite a principle, unless the designer locked it. */
export function strengthFor(decisions: number, locked = false): Strength {
  if (locked) return "locked";
  return decisions >= 8 ? "strong" : decisions >= 3 ? "steady" : "forming";
}

// ── Drift: detect → propose ────────────────────────────────────────────────────

export interface BuildLint {
  buildId: string;
  title: string;
  offenders: LintResult["offenders"];
}

export interface DriftProposal {
  kind: "change" | "add";
  tokenKind: "color" | "radius" | "fontSize";
  /** The token to change, or the suggested name of the new one. */
  token: string;
  from?: string;
  to: string;
  overrides: number;
  builds: { id: string; title: string; value: string }[];
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const isSemantic = (name: string) => name.includes("/") && !/\/\d+$/.test(name);

const colorDistance = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
};

/**
 * The same off-system value showing up across builds is a pattern, not a one-off. A value used at
 * least `count` times across at least `builds` builds becomes a proposal: change the nearest token
 * when it's close, otherwise add a new one.
 */
export function detectDrift(ds: DesignSystem, lints: BuildLint[], min = { count: 3, builds: 3 }): DriftProposal[] {
  const byValue = new Map<string, { kind: DriftProposal["tokenKind"]; value: string; count: number; builds: Map<string, string> }>();
  for (const l of lints) {
    for (const o of l.offenders) {
      const key = `${o.kind}:${o.value}`;
      const hit = byValue.get(key) ?? { kind: o.kind, value: o.value, count: 0, builds: new Map() };
      hit.count += o.count;
      hit.builds.set(l.buildId, l.title);
      byValue.set(key, hit);
    }
  }
  const out: DriftProposal[] = [];
  for (const d of byValue.values()) {
    if (d.count < min.count || d.builds.size < min.builds) continue;
    const builds = [...d.builds].map(([id, title]) => ({ id, title, value: d.value }));
    if (d.kind === "color") {
      const value = normalizeColor(d.value) ?? d.value;
      // Semantic tokens only: a ramp step ("sand-light/3") is a palette entry, not something to retune.
      const near = ds.tokens.filter((t) => t.kind === "color" && isSemantic(t.name)).map((t) => ({ t, dist: colorDistance(t.value, value) })).sort((a, b) => a.dist - b.dist)[0];
      if (near && near.dist < 24) out.push({ kind: "change", tokenKind: "color", token: near.t.name, from: near.t.value, to: value, overrides: d.count, builds });
      else out.push({ kind: "add", tokenKind: "color", token: `surface/custom-${value.slice(1)}`, to: value, overrides: d.count, builds });
      continue;
    }
    const px = Number.parseFloat(d.value);
    if (d.kind === "radius") {
      const near = ds.tokens.filter((t) => t.kind === "radius").map((t) => ({ t, dist: Math.abs(Number.parseFloat(t.value) - px) })).sort((a, b) => a.dist - b.dist)[0];
      if (near && near.dist <= 6) out.push({ kind: "change", tokenKind: "radius", token: near.t.name, from: near.t.value, to: `${px}px`, overrides: d.count, builds });
      else out.push({ kind: "add", tokenKind: "radius", token: `radius/${px}`, to: `${px}px`, overrides: d.count, builds });
      continue;
    }
    const near = ds.type.map((t) => ({ t, dist: Math.abs(t.size - px) })).sort((a, b) => a.dist - b.dist)[0];
    if (near && near.dist <= 3) out.push({ kind: "change", tokenKind: "fontSize", token: near.t.name, from: `${near.t.size}px`, to: `${px}px`, overrides: d.count, builds });
  }
  return out.sort((a, b) => b.overrides - a.overrides);
}

/** A new version with one token changed or added. The old version stays as it was. */
export function applyDrift(ds: DesignSystem, p: Pick<DriftProposal, "kind" | "tokenKind" | "token" | "to">): DesignSystem {
  const next: DesignSystem = { ...ds, version: bumpVersion(ds.version), tokens: ds.tokens.map((t) => ({ ...t })), type: ds.type.map((t) => ({ ...t })) };
  if (p.tokenKind === "fontSize") {
    const t = next.type.find((x) => x.name === p.token);
    if (t) t.size = Number.parseFloat(p.to);
    return next;
  }
  const existing = next.tokens.find((t) => t.name === p.token);
  if (existing) existing.value = p.to;
  else next.tokens.push({ name: p.token, kind: p.tokenKind === "radius" ? "radius" : "color", value: p.to, group: "Added by proposal" });
  return next;
}

// ── Reflect: the improvement loop ─────────────────────────────────────────────

export interface ScoredRun {
  runId: string;
  phase: Phase;
  recipe: string;
  score: number;
  note?: string;
  instruction: string;
  output: string;
  ruleIds: string[];
}

export interface ReflectGroup {
  phase: Phase;
  high: ScoredRun[];
  low: ScoredRun[];
  highAvg: number;
  lowAvg: number;
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

/**
 * Phases with enough evidence to learn from: at least `min` runs scored 4–5 and `min` scored 1–2.
 * Below that, Composer doesn't propose anything; small samples overfit.
 */
export function reflectGroups(runs: ScoredRun[], min = 5): ReflectGroup[] {
  const phases = [...new Set(runs.map((r) => r.phase))];
  return phases.flatMap((phase) => {
    const high = runs.filter((r) => r.phase === phase && r.score >= 4);
    const low = runs.filter((r) => r.phase === phase && r.score <= 2);
    if (high.length < min || low.length < min) return [];
    return [{ phase, high, low, highAvg: avg(high.map((r) => r.score)), lowAvg: avg(low.map((r) => r.score)) }];
  });
}

export interface ReflectAnswer {
  rules: { phase: Phase; text: string; why: string; evidence: string[] }[];
  principles: { change: "sharpened" | "added" | "retired" | "reworded"; n: number | null; text: string; why: string }[];
}

export const REFLECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rules", "principles"],
  properties: {
    rules: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["phase", "text", "why", "evidence"], properties: { phase: { type: "string", enum: ["understand", "define", "build", "validate", "share"] }, text: { type: "string" }, why: { type: "string" }, evidence: { type: "array", items: { type: "string" } } } },
    },
    principles: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["change", "n", "text", "why"], properties: { change: { type: "string", enum: ["sharpened", "added", "retired", "reworded"] }, n: { type: ["integer", "null"] }, text: { type: "string" }, why: { type: "string" } } },
    },
  },
} as const;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** One call that compares what scored high with what scored low and drafts rules and principle changes. */
export function reflectRequest(groups: ReflectGroup[], philosophy: Philosophy | null, decisions: string[], model: string, pairs: PickedPair[] = []): LlmRequest {
  const runText = (r: ScoredRun) => `<run id="${r.runId}" score="${r.score}"${r.note ? ` note="${r.note.replace(/"/g, "'")}"` : ""}>\nInstruction: ${clip(r.instruction, 600)}\nOutput: ${clip(r.output, 1500)}\n</run>`;
  const body = groups
    .map((g) => `<phase name="${g.phase}" high_avg="${g.highAvg}" n_high="${g.high.length}" low_avg="${g.lowAvg}" n_low="${g.low.length}">\n<high>\n${g.high.map(runText).join("\n")}\n</high>\n<low>\n${g.low.map(runText).join("\n")}\n</low>\n</phase>`)
    .join("\n\n");
  return {
    model,
    maxTokens: 16_000,
    effort: "high",
    system: [
      {
        type: "text",
        text: "You are the improvement loop inside Design Composer. You compare a designer's high-scored and low-scored Claude runs and draft craft rules that would have made the low runs more like the high ones. Pairwise picks are the sharpest evidence: the designer saw two outputs of the same brief side by side and preferred one, so a rule that explains a consistent preference is worth more than one inferred from absolute scores. Each rule is one imperative sentence a future run can follow, specific to its phase, and must cite the run ids that show it. Only propose what the evidence clearly supports; an empty list is a good answer. Separately, read the designer's recorded decisions and propose philosophy changes: sharpen or reword a principle the decisions keep citing, add one they imply, or retire one they keep overriding. Nothing you propose applies until the designer approves it.",
      },
    ],
    messages: [
      {
        role: "user",
        content: `${philosophy ? `<philosophy rev="${philosophy.rev}">\n${philosophy.principles.map((p) => `${p.n}. ${p.text} (${p.strength})`).join("\n")}\n</philosophy>\n\n` : ""}<decisions>\n${decisions.slice(-60).join("\n") || "none yet"}\n</decisions>\n\n${body || (pairs.length ? "No phase has enough scored runs yet; learn from the picks below." : "No phase has enough scored runs yet; propose rules only if the decisions alone justify them, else none.")}${pairs.length ? `\n\n${pairsBlock(pairs)}` : ""}`,
      },
    ],
    schema: REFLECT_SCHEMA as unknown as Record<string, unknown>,
  };
}
