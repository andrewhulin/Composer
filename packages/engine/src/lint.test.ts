import { describe, expect, it } from "vitest";
import { lintAgainstTokens, normalizeColor } from "./lint";
import { prMarkdown, recipe } from "./recipes";

describe("normalizeColor", () => {
  it("reads hex and rgb the same way, and skips transparent", () => {
    expect(normalizeColor("rgb(224, 90, 78)")).toBe("#e05a4e");
    expect(normalizeColor("#E05A4E")).toBe("#e05a4e");
    expect(normalizeColor("#fff")).toBe("#ffffff");
    expect(normalizeColor("rgba(0, 0, 0, 0)")).toBeNull();
    expect(normalizeColor("transparent")).toBeNull();
  });
});

describe("lintAgainstTokens", () => {
  const tokens = { colors: ["#19191c", "#eeedea"], radii: [4, 8], fontSizes: [12, 16] };

  it("scores how much of the prototype uses tokens and lists the rest, most used first", () => {
    const r = lintAgainstTokens({ colors: ["rgb(25, 25, 28)", "#eeedea", "#123456", "#123456"], radii: [8, 12, 12], fontSizes: [12, 15] }, tokens);
    expect(r.pct).toBe(44);
    expect(r.offenders[0]).toEqual({ kind: "color", value: "#123456", count: 2 });
    expect(r.offenders.map((o) => o.value)).toEqual(["#123456", "12px", "15px"]);
  });

  it("has no score until a design system is slotted", () => {
    expect(lintAgainstTokens({ colors: ["#000"], radii: [], fontSizes: [] }, null)).toEqual({ pct: null, offenders: [] });
  });
});

describe("prototype recipe", () => {
  it("asks for one self-contained document at the chosen fidelity", () => {
    const r = recipe("prototype");
    expect(r.phase).toBe("build");
    expect(r.charter).toContain("self-contained HTML");
    expect(r.defaultInstruction).toContain("{fidelity}");
    expect(r.render!({ title: "Recap", fidelity: "wireframe", html: "<html/>", screens: [{ name: "Home", purpose: "show change" }], rationale: "r", tests: "t" })).toContain("Prototype (Wireframe): Recap");
  });
});

describe("validate recipes", () => {
  it("renders a verdict that keeps misses honest and lists findings for the next loop", () => {
    const text = recipe("verdict").render!({
      verdict: "misses",
      summary: "Opens rose 12%, short of 40%.",
      metrics: [{ kind: "success", text: "Recap opened within 24h +40%", observed: "+12%", met: "no" }],
      findings: [{ text: "People skim past the card", source: "Slack · 4 replies" }],
      next: "Back to Understand: why is the card skimmed?",
    });
    expect(text).toContain("Verdict: misses.");
    expect(text).toContain("→ +12% (not met)");
    expect(text).toContain("Finding: People skim past the card (Slack · 4 replies)");
  });

  it("asks the strategy for metrics of all three kinds and one plan per method", () => {
    const schema = JSON.stringify(recipe("test_strategy").schema);
    for (const k of ["success", "guardrail", "kill", "slack", "360", "statsig", "survey"]) expect(schema).toContain(k);
  });
});

describe("share recipes", () => {
  it("scripts four chapters with one voiceover line each, and keeps quotes verbatim", () => {
    const r = recipe("release_story");
    expect(r.phase).toBe("share");
    expect(r.charter).toContain("never invent a number or a quote");
    const schema = JSON.stringify(r.schema);
    for (const k of ["problem", "process", "ui", "proof", "voiceover", "beats"]) expect(schema).toContain(`"${k}"`);
    const text = r.render!({
      title: "Recap",
      logline: "A recap after each session",
      problem: { quote: "What changed since last time?", who: "P04", context: "Context is lost." },
      process: { caption: "Two loops." },
      ui: { caption: "Top of the session.", beats: [{ part: "behavior", note: "They open it" }] },
      proof: { caption: "Opens rose.", metrics: [{ label: "Opens", value: "+44%", target: "+40%", met: "yes" }] },
      voiceover: ["a", "b", "c", "d"],
    });
    expect(text).toContain('Problem: "What changed since last time?" (P04)');
    expect(text).toContain("1. [behavior] They open it");
    expect(text).toContain("Opens: +44% (target +40%, met)");
  });

  it("asks for chartable numbers and the video's motion, with null wherever Claude would have to guess", () => {
    const r = recipe("release_story");
    const schema = r.schema as { required: string[]; properties: Record<string, { properties: Record<string, unknown>; required: string[] }> };
    expect(schema.required).toContain("motion");
    const motion = schema.properties.motion!;
    expect(motion.required).toEqual(["transition", "pacing"]);
    expect(JSON.stringify(motion.properties.transition)).toContain('["fade","slide","wipe","cut"]');
    expect(motion.properties.pacing).toMatchObject({ anyOf: [{ type: "object" }, { type: "null" }] });
    const metric = (schema.properties.proof!.properties.metrics as { items: { properties: Record<string, unknown> } }).items;
    expect(metric.properties.chart).toMatchObject({ anyOf: [{ type: "object", required: ["unit", "observed", "low", "high", "target"] }, { type: "null" }] });
    expect(r.charter).toContain("rather than estimate");
    expect(r.charter).toContain("reference video");
  });

  it("writes the PR as GitHub markdown with before, after, why and what to watch", () => {
    const md = prMarkdown({ title: "Add a recap", summary: "Adds a recap.", before: "Empty chat.", after: "A recap card.", why: "4 of 6 asked.", metric: "Opens within 24h.", testing: ["A/B 14 days"] });
    expect(md).toContain("- **Before:** Empty chat.");
    expect(md).toContain("## Why\n4 of 6 asked.");
    expect(md).toContain("## Tested\n- A/B 14 days");
    expect(prMarkdown({ title: "t", summary: "s", before: "b", after: "a", why: "w", metric: "m", testing: [] })).not.toContain("## Tested");
    expect(recipe("pr_description").defaultInstruction).toContain("{story}");
  });
});
