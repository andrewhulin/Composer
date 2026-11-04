import { describe, expect, it } from "vitest";
import type { HypothesisBlock, SourceContent, Weight } from "@composer/core";
import { claude, graphOf, hypothesis, source, wire } from "@composer/core/testing";
import { evidenceFor, nextLabel, repointHypothesis, swapCandidates, swapVariable } from "./memory";
import { describeChanges, frameDelay, playbackFrames, revealOrder } from "./history";
import { updateNode } from "./graph-ops";

const h1: HypothesisBlock = {
  id: "b1",
  projectId: "p",
  label: "H1",
  statement: "Returning users want the full transcript.",
  vars: [{ key: "audience", value: "all users" }, { key: "signal", value: "transcript opened" }],
  status: "testing",
  confidence: 0.41,
};
const content: SourceContent = {
  v: 1,
  kind: "context",
  items: [
    { id: "i1", kind: "quote", title: "P07", units: [{ text: "As a returning user I forget where we left off." }] },
    { id: "i2", kind: "quote", title: "P04", units: [{ text: "Returning users need a recap." }] },
    { id: "i3", kind: "quote", title: "P11", units: [{ text: "New users got lost on day 1." }] },
  ],
};

describe("swapping a variable", () => {
  it("forks a new block with one variable changed and the statement rewritten", () => {
    const h2 = swapVariable({ ...h1, statement: "We believe all users will open the transcript." }, "audience", "returning users", "H2");
    expect(h2).toMatchObject({ label: "H2", parentId: "b1", status: "testing", statement: "We believe returning users will open the transcript." });
    expect(h2.vars).toEqual([{ key: "audience", value: "returning users" }, { key: "signal", value: "transcript opened" }]);
  });

  it("labels the next block in the chain", () => {
    expect(nextLabel([h1, { ...h1, id: "b2", label: "H2" }])).toBe("H3");
    expect(nextLabel([])).toBe("H1");
  });

  it("ranks candidates by evidence from the project's sources", () => {
    expect(evidenceFor("returning users", [content])).toBe(1);
    const h0 = { ...h1, id: "b0", label: "H0", vars: [{ key: "audience", value: "new users" }] };
    const c = swapCandidates(h1, "audience", [h0, h1], [content], ["returning user", "trial day 5"]);
    expect(c.map((x) => [x.value, x.evidence, x.from])).toEqual([
      ["new users", 1, "chain"],
      ["returning user", 1, "typed"],
      ["trial day 5", 0, "typed"],
    ]);
  });

  it("repoints hypothesis nodes, which puts their downstream in the blast radius", () => {
    const g = graphOf([hypothesis("h", { blockId: "b1" }), claude("c", { phase: "define" })], [wire("h", "c", "hypothesis")]);
    const g2 = repointHypothesis(g, "b1", "b2");
    expect((g2.nodes.h as { blockId: string }).blockId).toBe("b2");
    expect(repointHypothesis(g, "zz", "b2")).toBe(g);
  });
});

describe("history wording", () => {
  it("says when an inlet moved to a newer locked version", async () => {
    const { output } = await import("@composer/core/testing");
    const a = graphOf([output("in", { mode: "inlet", versionId: "v1", title: "Weighted context" })]);
    const b = updateNode(a, "in", { versionId: "v2" });
    expect(describeChanges(a, b, {})).toEqual([{ icon: "run", text: "Weighted context inlet moved to a newer locked version" }]);
  });
});

describe("history", () => {
  const f = (i: number, kind: string, sec: number) => ({ id: `s${i}`, seq: i, kind, createdAt: new Date(Date.UTC(2026, 10, 4, 11, 0, sec)).toISOString() });

  it("steps through runs only when asked, and caps idle gaps", () => {
    const frames = [f(1, "run", 0), f(2, "lock", 2), f(3, "run", 600)];
    expect(playbackFrames(frames, true).map((x) => x.id)).toEqual(["s1", "s3"]);
    expect(frameDelay(frames[0]!, frames[2]!, 1)).toBe(1500);
    expect(frameDelay(frames[0]!, frames[2]!, 2)).toBe(750);
    expect(frameDelay(frames[0]!, frames[1]!, 1)).toBe(1500);
  });

  it("reveals a frame's additions node by node, then wires", () => {
    const a = graphOf([source("s")]);
    const b = graphOf([...Object.values(a.nodes), claude("c")], [wire("s", "c", "context")]);
    expect(revealOrder(a, b)).toEqual({ nodes: ["c"], edges: ["s->c:context"] });
  });

  it("describes what changed in words, swaps first-class", () => {
    const a = graphOf([source("s"), hypothesis("h", { blockId: "b1" }), claude("c", { phase: "define" })], [wire("h", "c", "hypothesis")]);
    const b = updateNode(updateNode(a, "h", { blockId: "b2" }), "s", { weight: "heavy" as Weight });
    const lines = describeChanges(a, b, { b1: h1, b2: { ...h1, id: "b2", label: "H2", vars: [{ key: "audience", value: "returning users" }, h1.vars[1]!] } });
    expect(lines).toEqual([
      { icon: "weight", text: "s weighed normal → heavy" },
      { icon: "swap", text: "H1 swapped for H2 · audience → returning users" },
    ]);
  });
});
