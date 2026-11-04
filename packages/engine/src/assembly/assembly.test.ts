import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Weight } from "@composer/core";
import { allocate, waterFill, type Demand } from "./allocate";
import { assemble, type AssemblyInput } from "./prompt";
import { renderTemplate, templateRefs } from "./template";
import { renderTrimmed, trimUnits } from "./trim";
import { splitUnits } from "./units";

const W: Weight[] = ["mute", "light", "normal", "heavy"];
const demandArb = fc.array(
  fc.record({ weight: fc.constantFrom(...W), pinned: fc.boolean(), demand: fc.integer({ min: 0, max: 50_000 }) }),
  { minLength: 1, maxLength: 12 },
).map((ds) => ds.map((d, i) => ({ ...d, id: `d${i}` })) as Demand[]);

describe("allocate (weighted water-filling)", () => {
  it("never exceeds the budget and gives muted items nothing", () => {
    fc.assert(
      fc.property(demandArb, fc.integer({ min: 0, max: 200_000 }), (ds, budget) => {
        const a = allocate(ds, budget);
        const total = [...a.values()].reduce((s, v) => s + v, 0);
        expect(total).toBeLessThanOrEqual(budget);
        for (const d of ds) {
          if (d.weight === "mute" && !d.pinned) expect(a.get(d.id)).toBe(0);
          expect(a.get(d.id)!).toBeLessThanOrEqual(d.demand);
        }
      }),
    );
  });

  it("never shrinks an item's share when its weight goes up", () => {
    fc.assert(
      fc.property(demandArb, fc.integer({ min: 1_000, max: 100_000 }), fc.nat(), (ds, budget, pick) => {
        const i = pick % ds.length;
        const d = ds[i]!;
        const idx = W.indexOf(d.weight);
        if (idx === W.length - 1 || d.pinned) return;
        const raised = ds.map((x, j) => (j === i ? { ...x, weight: W[idx + 1]! } : x));
        expect(allocate(raised, budget).get(d.id)!).toBeGreaterThanOrEqual(allocate(ds, budget).get(d.id)!);
      }),
    );
  });

  it("gives everything whole when it fits, and shares the surplus", () => {
    const a = waterFill([{ id: "a", w: 4, demand: 100 }, { id: "b", w: 1, demand: 5_000 }], 1_000);
    expect(a.get("a")).toBe(100);
    expect(a.get("b")).toBe(900);
  });

  it("caps pins at 15% of the budget", () => {
    const a = allocate([{ id: "p", weight: "heavy", pinned: true, demand: 50_000 }, { id: "x", weight: "normal", pinned: false, demand: 50_000 }], 10_000);
    expect(a.get("p")).toBe(1_500);
    expect(a.get("x")).toBe(8_500);
  });
});

describe("units and trimming", () => {
  const transcript = [
    "[12:03] P04: I open the app and I have no idea what we talked about.",
    "[13:10] Interviewer: What would help?",
    "[14:22] P07: I forget where we left off.",
    "and it keeps happening.",
    "[18:40] P11: A recap would be nice but not a wall of text.",
  ].join("\n");

  it("splits transcripts per utterance, keeping speaker and time", () => {
    const units = splitUnits(transcript, "transcript");
    expect(units).toHaveLength(4);
    expect(units[2]).toEqual({ text: "I forget where we left off. and it keeps happening.", label: "P07 · 14:22" });
  });

  it("keeps whole units, most relevant first, and marks what was left out", () => {
    const units = splitUnits(transcript, "transcript");
    const r = trimUnits(units, 22, ["recap", "left", "off"]);
    for (const u of r.kept) expect(units[u.index]!.text).toBe(u.text);
    expect(r.used).toBeLessThanOrEqual(22);
    const text = renderTrimmed(r, "transcript");
    expect(text).toMatch(/omitted/);
    expect(text).toContain("P07 · 14:22: I forget where we left off.");
  });

  it("is deterministic", () => {
    const units = splitUnits(transcript, "transcript");
    expect(trimUnits(units, 25, ["recap"])).toEqual(trimUnits(units, 25, ["recap"]));
  });

  it("cuts a lone oversized unit at a sentence boundary instead of dropping everything", () => {
    const r = trimUnits([{ text: "First sentence here. Second sentence is long and goes on. Third." }], 6, []);
    expect(r.kept[0]!.cut).toBe(true);
    expect(r.kept[0]!.text).toBe("First sentence here.");
  });
});

describe("templates", () => {
  it("finds references and renders them as tag names", () => {
    const t = "Synthesize {insights} and {interviews}. Hold it against {H2}. Literal {{braces}}.";
    expect(templateRefs(t)).toEqual(["insights", "interviews", "H2"]);
    const r = renderTemplate(t, (n) => n !== "interviews");
    expect(r.text).toBe("Synthesize <insights> and {interviews}. Hold it against <H2>. Literal {braces}.");
    expect(r.unknown).toEqual(["interviews"]);
  });
});

describe("assemble", () => {
  const base: AssemblyInput = {
    phase: "define",
    charter: "Draft a testable statement.",
    foundations: { philosophy: { rev: 14, principles: [{ n: 1, text: "Show the change, not the transcript.", strength: "strong" }] } },
    rules: [{ id: "R12", text: "For Define, raw quotes beat summaries." }],
    memory: { outputs: [], chain: [{ label: "H1", statement: "Returning users want the full transcript.", status: "retired", result: "failed T0 · 9%" }] },
    hypothesis: { label: "H2", statement: "Returning users want proof of progress.", vars: [{ key: "audience", value: "returning users" }] },
    docs: [
      { alias: "interviews", title: "Interviews", source: "transcript", kind: "transcript", weight: "heavy", pinned: false, why: "The brief we ship against.", units: [{ text: "I forget where we left off.", label: "P07 · 14:22" }] },
      { alias: "pins", title: "Pinterest", source: "pinterest", kind: "pin", weight: "light", pinned: false, units: [{ text: "Soft recap card." }] },
      { alias: "muted", title: "Export requests", source: "request", kind: "request", weight: "mute", pinned: false, units: [{ text: "Export my chats" }] },
    ],
    instruction: "Synthesize {interviews} into one problem statement. Hold it against {H2}. Use {pins} only for tone.",
    budget: 200_000,
  };

  it("lays out stable blocks first with four cache breakpoints, 1h first", () => {
    const p = assemble(base);
    expect(p.system[1]!.cache_control).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(p.system[2]!.cache_control).toEqual({ type: "ephemeral" });
    const content = p.messages[0]!.content as { text: string; cache_control?: unknown }[];
    expect(content.map((c) => !!c.cache_control)).toEqual([true, true, false]);
    expect(content[1]!.text).toContain('<doc alias="interviews"');
    expect(content[1]!.text).toContain('why="The brief we ship against."');
    expect(content[1]!.text).not.toContain("Export my chats");
    expect(content[2]!.text).toContain("Synthesize <interviews>");
    expect(p.unknownRefs).toEqual([]);
  });

  it("keeps the prefix byte-identical when only weights or the instruction change", () => {
    const a = assemble(base);
    const reweighed = assemble({ ...base, docs: base.docs.map((d) => (d.alias === "pins" ? { ...d, weight: "normal" as Weight } : d)) });
    const reworded = assemble({ ...base, instruction: base.instruction.replace("one problem statement", "a hypothesis") });
    const prefix = (p: typeof a, n: number) => JSON.stringify([p.system, (p.messages[0]!.content as unknown[]).slice(0, n)]);
    expect(prefix(reweighed, 1)).toBe(prefix(a, 1));
    expect(prefix(reworded, 2)).toBe(prefix(a, 2));
  });

  it("reports shares by weight and flags a brief that can't fit", () => {
    const p = assemble(base);
    expect(p.report.shares.mute).toBe(0);
    expect(p.report.shares.heavy).toBeGreaterThan(p.report.shares.light);
    const huge = { ...base, budget: 3_000, docs: [{ ...base.docs[0]!, units: [{ text: "x".repeat(40_000) }] }] };
    expect(assemble(huge).report.overBudget).toBe(true);
  });

  it("flags references nothing is wired to", () => {
    expect(assemble({ ...base, instruction: "Use {mobbin}." }).unknownRefs).toEqual(["mobbin"]);
  });
});

describe("images", () => {
  const withImages: AssemblyInput = {
    phase: "define",
    charter: "c",
    foundations: {},
    rules: [],
    memory: { outputs: [], chain: [] },
    docs: [
      { alias: "pins", title: "Pins", source: "pinterest", kind: "pin", weight: "normal", pinned: false, units: [{ text: "Soft recap card" }], images: [{ src: "data:image/jpeg;base64,AAAA", caption: "Recap card, soft" }] },
      { alias: "mood", title: "Mood", source: "arena", kind: "pin", weight: "light", pinned: false, units: [{ text: "x" }], images: [{ src: "https://example.com/a.jpg", caption: "Light one" }] },
    ],
    instruction: "Use {pins} for tone.",
    budget: 200_000,
  };

  it("sends images for normal and heavy documents only, with the cache break on the last image", () => {
    const p = assemble(withImages);
    const content = p.messages[0]!.content as { type: string; cache_control?: unknown; source?: { type: string; media_type?: string } }[];
    const images = content.filter((c) => c.type === "image");
    expect(images).toHaveLength(1);
    expect(images[0]!.source).toMatchObject({ type: "base64", media_type: "image/jpeg" });
    expect(images[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(content[1]!.cache_control).toBeUndefined();
    expect(p.report.images).toEqual({ sent: 1, skipped: 1 });
  });
});
