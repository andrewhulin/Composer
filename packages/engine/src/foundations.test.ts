import { describe, expect, it } from "vitest";
import { applyDrift, bumpVersion, detectDrift, digest, foundationsFor, parseDesignSystem, parseMarkdownTables, parsePhilosophy, reflectGroups, reflectRequest, strengthFor, tokenSet, type ScoredRun } from "./foundations";
import { lintAgainstTokens } from "./lint";
import { assemble } from "./assembly/prompt";

const TOKENS = `# Pebble 3.2 Design Tokens — Reference

### Stone — light

| Step | Hex | Role |
|------|-----|------|
| 1 | #FFFDFA | App background |
| 12 | #23201B | Primary text |

### Surface

| Token | Step | Light | Dark |
|-------|------|-------|------|
| \`surface/bg\` (\`surfaceBg\`) | stone 1 | #FFFDFA | #12110E |
| \`surface/card\` | stone 3 | #F2F0ED | #232220 |

## Typography

| Token (Flutter) | Family | Weight | Size | Line height | Letter spacing |
|-----------------|--------|--------|------|-------------|----------------|
| \`title/large\` (\`titleLarge\`) | Inter | 600 | 23 | 1.2 (27.6) | -0.25 |
| \`body/medium\` (\`bodyMedium\`) | Inter | 425 | 14 | 1.5 (21) | -0.25 |

## Spacing

| Token | Value |
|-------|-------|
| \`spacing/01\` | 4px |
| \`spacing/02\` | 8px |

## Border Radius

| Value | Use |
|-------|-----|
| 8px | Menus |
| 12px | Cards |
`;

const GUIDE = `# Pebble

## Components

### Button
### Card

## Rules
Use tokens only.`;

const PHILOSOPHY = `# Design philosophy

## Core belief
Time is precious.

## How to Apply This

1. Start from the design system — use existing components first
2. **Essentialism:** every element justifies itself
3. Choose the simpler, warmer option

## Influences
Rams.`;

describe("parseMarkdownTables", () => {
  it("finds every table with the heading above it", () => {
    const t = parseMarkdownTables(TOKENS);
    expect(t.map((x) => x.heading)).toEqual(["Stone — light", "Surface", "Typography", "Spacing", "Border Radius"]);
    expect(t[1]!.rows[0]![0]).toBe("`surface/bg` (`surfaceBg`)");
  });
});

describe("parseDesignSystem", () => {
  const ds = parseDesignSystem(TOKENS, GUIDE, "tokens.md");

  it("reads name, version, colors in both modes, type, spacing, radii and components", () => {
    expect(ds.name).toBe("Pebble 3.2");
    expect(ds.version).toBe("3.2");
    expect(ds.tokens.find((t) => t.name === "surface/card")).toMatchObject({ kind: "color", value: "#f2f0ed", dark: "#232220" });
    expect(ds.tokens.find((t) => t.name === "stone-light/1")?.value).toBe("#fffdfa");
    expect(ds.type.map((t) => [t.name, t.size, t.weight])).toEqual([["title/large", 23, 600], ["body/medium", 14, 425]]);
    expect(ds.tokens.filter((t) => t.kind === "space").map((t) => t.value)).toEqual(["4px", "8px"]);
    expect(ds.tokens.filter((t) => t.kind === "radius").map((t) => t.value)).toEqual(["8px", "12px"]);
    expect(ds.components).toEqual(["Button", "Card"]);
  });

  it("gives the lint every color in either mode, every radius and type size", () => {
    const set = tokenSet(ds);
    expect(set.colors).toContain("#232220");
    expect(set.radii).toEqual([8, 12]);
    expect(lintAgainstTokens({ colors: ["rgb(242, 240, 237)", "#ff0000"], radii: [12], fontSizes: [14] }, set).pct).toBe(75);
  });

  it("puts the guide and exact values in the prompt", () => {
    const d = digest(ds);
    expect(d).toContain("Use tokens only.");
    expect(d).toContain("surface/card: #f2f0ed (dark #232220)");
    expect(d).toContain("body/medium: Inter 425 14px");
  });
});

describe("parsePhilosophy", () => {
  it("turns the how-to-apply list into numbered principles and keeps the words", () => {
    const ph = parsePhilosophy(PHILOSOPHY, "SKILL.md");
    expect(ph.principles.map((p) => [p.n, p.text])).toEqual([
      [1, "Start from the design system — use existing components first"],
      [2, "Essentialism: every element justifies itself"],
      [3, "Choose the simpler, warmer option"],
    ]);
    expect(ph.doc).toContain("Time is precious.");
  });

  it("rides in the cached foundations block of every prompt", () => {
    const f = foundationsFor(parseDesignSystem(TOKENS, GUIDE), parsePhilosophy(PHILOSOPHY));
    const p = assemble({ phase: "define", charter: "c", foundations: f, rules: [], memory: { outputs: [], chain: [] }, docs: [], instruction: "Do it", budget: 10_000 });
    const text = JSON.stringify(p.system);
    expect(text).toContain("01. Start from the design system");
    expect(text).toContain("Pebble 3.2 v3.2");
  });
});

describe("versions and strength", () => {
  it("bumps the last part", () => {
    expect(bumpVersion("3.2")).toBe("3.3");
    expect(bumpVersion("2")).toBe("2.1");
  });
  it("grows with decisions unless locked", () => {
    expect([0, 3, 8].map((n) => strengthFor(n))).toEqual(["forming", "steady", "strong"]);
    expect(strengthFor(0, true)).toBe("locked");
  });
});

describe("detectDrift", () => {
  const ds = parseDesignSystem(TOKENS, GUIDE);
  const lint = (id: string, offenders: { kind: "color" | "radius" | "fontSize"; value: string; count: number }[]) => ({ buildId: id, title: `Build ${id}`, offenders });

  it("turns the same override across three builds into a change to the nearest token", () => {
    const out = detectDrift(ds, [lint("a", [{ kind: "radius", value: "10px", count: 3 }]), lint("b", [{ kind: "radius", value: "10px", count: 2 }]), lint("c", [{ kind: "radius", value: "10px", count: 2 }])]);
    expect(out).toEqual([expect.objectContaining({ kind: "change", token: "radius/8", from: "8px", to: "10px", overrides: 7 })]);
    expect(out[0]!.builds.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores one-offs and proposes a new token when nothing is close", () => {
    expect(detectDrift(ds, [lint("a", [{ kind: "radius", value: "10px", count: 9 }])])).toEqual([]);
    const far = detectDrift(ds, ["a", "b", "c"].map((id) => lint(id, [{ kind: "color", value: "#00ff00", count: 1 }])));
    expect(far[0]).toMatchObject({ kind: "add", tokenKind: "color", to: "#00ff00" });
    // #fffdfb sits next to stone-light/1 too, but only the semantic token is a candidate.
    const near = detectDrift(ds, ["a", "b", "c"].map((id) => lint(id, [{ kind: "color", value: "#fffdfb", count: 1 }])));
    expect(near[0]).toMatchObject({ kind: "change", token: "surface/bg" });
  });

  it("applies an accepted proposal as a new version and leaves the old one alone", () => {
    const next = applyDrift(ds, { kind: "change", tokenKind: "radius", token: "radius/12", to: "8px" });
    expect(next.version).toBe("3.3");
    expect(next.tokens.find((t) => t.name === "radius/12")?.value).toBe("8px");
    expect(ds.tokens.find((t) => t.name === "radius/12")?.value).toBe("12px");
    expect(applyDrift(ds, { kind: "change", tokenKind: "fontSize", token: "body/medium", to: "15px" }).type[1]!.size).toBe(15);
  });
});

describe("reflect", () => {
  const run = (i: number, score: number, phase: ScoredRun["phase"] = "define"): ScoredRun => ({ runId: `r${i}`, phase, recipe: "draft_statement", score, instruction: "Draft", output: "x", ruleIds: [] });

  it("needs five high and five low runs in a phase before it proposes anything", () => {
    const four = [...[1, 2, 3, 4].map((i) => run(i, 5)), ...[5, 6, 7, 8, 9].map((i) => run(i, 1))];
    expect(reflectGroups(four)).toEqual([]);
    const enough = [...four, run(10, 4), run(11, 3), run(12, 5, "build")];
    const [g] = reflectGroups(enough);
    expect(g).toMatchObject({ phase: "define", highAvg: 4.8, lowAvg: 1 });
    expect(g!.high).toHaveLength(5);
  });

  it("asks for structured rules and principle changes, citing the runs", () => {
    const groups = reflectGroups([...[1, 2, 3, 4, 5].map((i) => run(i, 5)), ...[6, 7, 8, 9, 10].map((i) => run(i, 2))]);
    const req = reflectRequest(groups, null, ["verdict_override: Called it holds"], "claude-opus-5-5");
    expect(req.schema).toBeDefined();
    expect(JSON.stringify(req.messages)).toContain('<run id=\\"r6\\" score=\\"2\\">');
    expect(JSON.stringify(req.messages)).toContain("verdict_override");
  });
});
