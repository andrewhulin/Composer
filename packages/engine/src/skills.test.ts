import { describe, expect, it } from "vitest";
import { foundationsBlock } from "./assembly/prompt";
import { withCandidateBrief, type StoredPrompt } from "./replay";
import {
  applyResolution,
  briefDiff,
  briefFor,
  briefStale,
  compileRequest,
  conflictKey,
  defaultEnabled,
  defaultMode,
  findSkills,
  inferKind,
  parseCompile,
  parseFrontmatter,
  parseRegistry,
  parseSkillMd,
  parseSkillSource,
  skillApplies,
  type CompileSkill,
} from "./skills";

const SKILL = `---
name: tight-spacing
description: >
  Dense, scannable layouts
  for pro tools.
author: Andrew
---
# Tight spacing

Use an 8px base grid. Never exceed 16px between related rows.`;

describe("importing skills", () => {
  it("reads SKILL.md frontmatter, including folded and quoted values", () => {
    expect(parseFrontmatter('---\nname: "A b"\ndescription: plain\n---\nBody').meta).toEqual({ name: "A b", description: "plain" });
    expect(parseSkillMd(SKILL)).toEqual({ name: "tight-spacing", description: "Dense, scannable layouts for pro tools.", author: "Andrew", body: expect.stringContaining("8px base grid") });
  });

  it("names a skill without frontmatter from its heading", () => {
    expect(parseSkillMd("# Motion that feels physical\n\nUse springs.").name).toBe("Motion that feels physical");
    expect(parseSkillMd("Use springs.", "folder-name").name).toBe("folder-name");
  });

  it("guesses each skill's kind and its default mode", () => {
    expect(inferKind({ name: "shift-nudge", description: "Review a screen against 16 principles: what's off" })).toBe("audit");
    expect(inferKind({ name: "springs", description: "Motion and easing for interfaces" })).toBe("motion");
    expect(inferKind({ name: "ui-skills-root", description: "Router: picks the smallest set of skills" })).toBe("router");
    expect(inferKind({ name: "baseline-ui", description: "Typography and layout polish" })).toBe("craft");
    expect([defaultMode("audit"), defaultMode("craft"), defaultMode("motion"), defaultEnabled("router")]).toEqual(["on_demand", "always", "always", false]);
  });

  it("finds every skill in a folder or repo, with its own reference files", () => {
    const found = findSkills([
      { path: "skills/spacing/SKILL.md", content: SKILL },
      { path: "skills/spacing/references/grid.md", content: "grid" },
      { path: "skills/motion/SKILL.md", content: "# Motion" },
      { path: "README.md", content: "repo readme" },
    ]);
    expect(found.map((f) => [f.dir, f.refs.map((r) => r.path)])).toEqual([
      ["skills/spacing", ["skills/spacing/references/grid.md"]],
      ["skills/motion", []],
    ]);
    expect(findSkills([{ path: "SKILL.md", content: SKILL }, { path: "notes.md", content: "x" }])[0]!.refs.map((r) => r.path)).toEqual(["notes.md"]);
  });

  it("reads `npx skills add` lines, owner/repo strings and GitHub links", () => {
    expect(parseSkillSource("npx skills add emilkowalski/skills --skill design-engineering")).toEqual({ owner: "emilkowalski", repo: "skills", skill: "design-engineering" });
    expect(parseSkillSource("vercel-labs/web-design-guidelines")).toEqual({ owner: "vercel-labs", repo: "web-design-guidelines" });
    expect(parseSkillSource("https://github.com/ibelick/ui-skills/tree/main/skills/baseline-ui")).toEqual({ owner: "ibelick", repo: "ui-skills", path: "skills/baseline-ui" });
    expect(parseSkillSource("not a source")).toBeNull();
  });

  it("parses the UI Skills registry", () => {
    const entries = parseRegistry("ibelick/baseline-ui\thttps://raw.githubusercontent.com/ibelick/ui-skills/main/skills/baseline-ui/SKILL.md\tBaseline UI polish.\nbad line\n");
    expect(entries).toEqual([{ id: "ibelick/baseline-ui", author: "ibelick", name: "baseline-ui", url: "https://raw.githubusercontent.com/ibelick/ui-skills/main/skills/baseline-ui/SKILL.md", description: "Baseline UI polish." }]);
  });
});

describe("turning skills on and off", () => {
  const skill = { enabled: true, phases: [] as ("build" | "validate")[] };
  it("follows the project's override over the global switch, then the skill's phases", () => {
    expect(skillApplies(skill, undefined, "define")).toBe(true);
    expect(skillApplies(skill, false, "define")).toBe(false);
    expect(skillApplies({ ...skill, enabled: false }, true, "define")).toBe(true);
    expect(skillApplies({ ...skill, phases: ["build"] }, undefined, "define")).toBe(false);
    expect(skillApplies({ ...skill, phases: ["build"] }, undefined, "build")).toBe(true);
    expect(skillApplies({ ...skill, phases: ["build"] }, undefined)).toBe(true);
  });
});

const skills: CompileSkill[] = [
  { id: "dense", version: 1, name: "Dense", kind: "craft", phases: [], body: "Tight." },
  { id: "airy", version: 2, name: "Airy", kind: "craft", phases: [], body: "Loose." },
  { id: "springs", version: 1, name: "Springs", kind: "motion", phases: ["build"], body: "Springs." },
];

const raw = {
  principles: [
    { text: "Use an 8px grid.", sources: ["dense"], phase: null },
    { text: "Use an 8px grid", sources: ["airy"], phase: null },
    { text: "Animate with springs, 200–300ms.", sources: ["springs"], phase: "build" as const },
    { text: "Cite a skill that doesn't exist.", sources: ["ghost"], phase: null },
  ],
  conflicts: [{ topic: "Row spacing", a_skill: "dense", a_says: "Keep rows 4px apart.", b_skill: "airy", b_says: "Give rows 16px." }],
  flagged: [{ skill: "airy", principle: 2, says: "Decorate freely.", why: "The philosophy says remove until it breaks." }],
};

describe("compiling the Craft Brief", () => {
  it("merges duplicates, keeps citations honest, and groups by phase", () => {
    const brief = parseCompile(raw, skills);
    expect(brief.general).toEqual([{ text: "Use an 8px grid.", sources: ["dense", "airy"] }]);
    expect(brief.phases.build).toEqual([{ text: "Animate with springs, 200–300ms.", sources: ["springs"] }]);
    expect(brief.sources).toEqual(["airy@2", "dense@1", "springs@1"]);
    expect(briefFor(brief, "build").map((p) => p.text)).toEqual(["Use an 8px grid.", "Animate with springs, 200–300ms."]);
    expect(briefFor(brief, "define")).toHaveLength(1);
  });

  it("lists conflicts with a key that stays the same whichever way round they come back", () => {
    const brief = parseCompile(raw, skills);
    expect(brief.conflicts).toEqual([{ key: "airy|dense|row-spacing", topic: "Row spacing", a: { skill: "dense", says: "Keep rows 4px apart." }, b: { skill: "airy", says: "Give rows 16px." } }]);
    expect(conflictKey("dense", "airy", "Row spacing")).toBe(conflictKey("airy", "dense", "Row spacing!"));
  });

  it("flags a skill that contradicts the philosophy instead of applying it", () => {
    const brief = parseCompile(raw, skills);
    expect(brief.flagged).toEqual([raw.flagged[0]]);
    expect(JSON.stringify(brief.general)).not.toContain("Decorate freely");
  });

  it("folds a resolution into the brief, and reuses it on the next compile", () => {
    const key = "airy|dense|row-spacing";
    const once = applyResolution(parseCompile(raw, skills), key, { choice: "a" });
    expect(once.conflicts).toEqual([]);
    expect(once.general.at(-1)).toEqual({ text: "Keep rows 4px apart.", sources: ["dense"] });
    const again = parseCompile(raw, skills, { [key]: { choice: "a" } });
    expect(again).toEqual(once);
  });

  it("can scope each side to phases, or keep both as a stated tradeoff", () => {
    const key = "airy|dense|row-spacing";
    const scoped = applyResolution(parseCompile(raw, skills), key, { choice: "scope", a: ["build"], b: ["define"] });
    expect(scoped.phases.build?.at(-1)?.text).toBe("Keep rows 4px apart.");
    expect(scoped.phases.define).toEqual([{ text: "Give rows 16px.", sources: ["airy"] }]);
    const both = applyResolution(parseCompile(raw, skills), key, { choice: "both", note: "Dense in tools, airy in onboarding." });
    expect(both.general.at(-1)).toEqual({ text: "Tradeoff: Keep rows 4px apart vs Give rows 16px. Dense in tools, airy in onboarding.", sources: ["dense", "airy"] });
  });

  it("says what changed between briefs, and when a brief is stale", () => {
    const a = parseCompile(raw, skills);
    const b = applyResolution(a, "airy|dense|row-spacing", { choice: "b" });
    expect(briefDiff(a, b)).toEqual({ added: ["Give rows 16px."], removed: [] });
    expect(briefStale(a, [{ id: "dense", version: 1 }, { id: "airy", version: 2 }, { id: "springs", version: 1 }])).toBe(false);
    expect(briefStale(a, [{ id: "dense", version: 1 }, { id: "airy", version: 3 }, { id: "springs", version: 1 }])).toBe(true);
    expect(briefStale(null, [])).toBe(false);
  });

  it("asks Claude with the philosophy first and past resolutions passed in", () => {
    const req = compileRequest({ skills, philosophy: { v: 1, kind: "philosophy", rev: 1, source: "", doc: "", principles: [{ n: 1, text: "Remove until it breaks.", strength: "steady", decisions: 0 }] }, designSystem: null, resolved: [{ key: "k", topic: "Row spacing", outcome: "Keep rows 4px apart." }], model: "claude-opus-5-5" });
    const user = String(req.messages[0]!.content);
    expect(user.indexOf("<philosophy>")).toBeLessThan(user.indexOf("<skill"));
    expect(user).toContain("Row spacing: Keep rows 4px apart.");
    expect(user).toContain('<skill id="springs" name="Springs" kind="motion" phases="build">');
    expect(req.schema).toBeDefined();
  });
});

describe("the brief in the prompt", () => {
  it("goes into the foundations block as principles, never as raw skill text", () => {
    const block = foundationsBlock({ brief: { version: "v3", principles: [{ text: "Use an 8px grid.", sources: ["dense", "airy"] }] } });
    expect(block).toContain('<craft_brief version="v3">');
    expect(block).toContain("01. Use an 8px grid. [dense, airy]");
    expect(block).not.toContain("Tight.");
  });

  it("swaps in a candidate brief for replay", () => {
    const p: StoredPrompt = { system: [{ type: "text", text: "charter" }, { type: "text", text: foundationsBlock({ brief: { version: "v1", principles: [{ text: "Old.", sources: ["a"] }] } }) }], messages: [] };
    const next = withCandidateBrief(p, { kind: "brief", version: "candidate", principles: [{ text: "New.", sources: ["b"] }] });
    expect(next.system[1]!.text).toContain("01. New. [b]");
    expect(next.system[1]!.text).not.toContain("Old.");
    const fresh = withCandidateBrief({ system: [{ type: "text", text: "c" }, { type: "text", text: foundationsBlock({}) }], messages: [] }, { kind: "brief", version: "candidate", principles: [{ text: "New.", sources: ["b"] }] });
    expect(fresh.system[1]!.text).toContain("<craft_brief");
  });
});
