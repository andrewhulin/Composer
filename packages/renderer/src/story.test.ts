import { describe, expect, it } from "vitest";
import { timeline, type Story } from "./story";
import { formatMetric, layoutProcess, parseMetric, revealFrame } from "./process";

const story: Story = {
  title: "Recap",
  logline: "A recap after every session",
  problem: { quote: "What changed since last time?", who: "P04", context: "" },
  process: { caption: "" },
  ui: { caption: "", beats: [{ part: "who", note: "" }, { part: "behavior", note: "" }] },
  proof: { caption: "", metrics: [{ label: "Opens", value: "+12%", target: "+40%", met: "no" }] },
  voiceover: ["a", "b", "c", "d"],
};

describe("timeline", () => {
  it("lays the six segments end to end", () => {
    const { segments, total } = timeline({ story });
    expect(segments.map((s) => s.id)).toEqual(["title", "problem", "process", "ui", "proof", "end"]);
    segments.slice(1).forEach((s, i) => expect(s.from).toBe(segments[i]!.from + segments[i]!.frames));
    expect(total).toBe(segments.at(-1)!.from + segments.at(-1)!.frames);
  });

  it("stretches a chapter to fit its voiceover, and never shortens one", () => {
    const base = timeline({ story }).segments.find((s) => s.id === "problem")!;
    const long = timeline({ story, voice: [{ src: "v/0.wav", seconds: 11 }, null, null, null] }).segments.find((s) => s.id === "problem")!;
    const short = timeline({ story, voice: [{ src: "v/0.wav", seconds: 1 }, null, null, null] }).segments.find((s) => s.id === "problem")!;
    expect(long.frames).toBe(12 * 30);
    expect(short.frames).toBe(base.frames);
  });

  it("gives the UI chapter time for every beat", () => {
    const many = { ...story, ui: { caption: "", beats: Array.from({ length: 6 }, () => ({ part: "who" as const, note: "" })) } };
    expect(timeline({ story: many }).segments.find((s) => s.id === "ui")!.frames).toBe(Math.round((1.5 + 6 * 2.2) * 30));
  });
});

describe("layoutProcess", () => {
  const graph = {
    nodes: [
      { id: "b", kind: "claude" as const, phase: "define" as const, loop: 1, title: "Draft", x: 600, y: 248, seq: 2 },
      { id: "a", kind: "source" as const, phase: "understand" as const, loop: 1, title: "Transcript", x: 72, y: 96, seq: 1 },
      { id: "c", kind: "source" as const, phase: "understand" as const, loop: 2, title: "Transcript", x: 72, y: 96, seq: 3 },
    ],
    edges: [{ from: "a", to: "b" }, { from: "a", to: "missing" }],
  };

  it("fits every node inside the box and keeps creation order", () => {
    const box = { width: 1600, height: 700 };
    const l = layoutProcess(graph, box);
    expect(l.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
    for (const n of l.nodes) {
      expect(n.px).toBeGreaterThanOrEqual(-0.001);
      expect(n.py).toBeGreaterThanOrEqual(-0.001);
      expect(n.px + n.w).toBeLessThanOrEqual(box.width + 0.001);
      expect(n.py + n.h).toBeLessThanOrEqual(box.height + 0.001);
    }
  });

  it("leaves no empty space for phases nothing was placed in", () => {
    const two = (phase: "define" | "validate") => ({
      nodes: [
        { id: "a", kind: "source" as const, phase: "understand" as const, loop: 1, title: "A", x: 72, y: 96, seq: 1 },
        { id: "b", kind: "claude" as const, phase, loop: 1, title: "B", x: 600, y: 248, seq: 2 },
      ],
      edges: [],
    });
    const near = layoutProcess(two("define"), { width: 1600, height: 700 }).nodes;
    const far = layoutProcess(two("validate"), { width: 1600, height: 700 }).nodes;
    expect(far.map((n) => [n.px, n.py, n.w])).toEqual(near.map((n) => [n.px, n.py, n.w]));
  });

  it("puts later phases to the right and later loops below, and drops dangling edges", () => {
    const l = layoutProcess(graph, { width: 1600, height: 700 });
    const [a, b, c] = l.nodes;
    expect(b!.px).toBeGreaterThan(a!.px);
    expect(c!.py).toBeGreaterThan(a!.py);
    expect(l.edges).toHaveLength(1);
    expect(l.regions.map((r) => r.phase)).toEqual(["understand", "define"]);
  });

  it("reveals nodes in order within the first three quarters", () => {
    const frames = 200;
    const times = [0, 1, 2, 3].map((i) => revealFrame(i, 4, frames));
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(times.at(-1)).toBeLessThanOrEqual(6 + frames * 0.75);
  });
});

describe("parseMetric", () => {
  it("splits a value around its number", () => {
    expect(parseMetric("+12%")).toEqual({ prefix: "", number: 12, decimals: 0, suffix: "%", plus: true });
    expect(parseMetric("-0.9 pts")).toEqual({ prefix: "", number: -0.9, decimals: 1, suffix: " pts", plus: false });
    expect(parseMetric("about 3.25x")).toEqual({ prefix: "about ", number: 3.25, decimals: 2, suffix: "x", plus: false });
    expect(parseMetric("none yet")).toBeNull();
  });

  it("lands on the original value when the count finishes", () => {
    for (const v of ["+12%", "-0.9 pts", "about 3.25x", "44%"]) expect(formatMetric(parseMetric(v)!, 1)).toBe(v);
  });
});
