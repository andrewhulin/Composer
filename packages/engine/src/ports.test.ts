import { describe, expect, it } from "vitest";
import { sequentialIds } from "@composer/core";
import { claude, graphOf, hypothesis, output, source, wire } from "@composer/core/testing";
import { canConnect, connect, topoOrder } from "./graph-ops";

describe("typed ports", () => {
  const g = graphOf([
    source("src"),
    claude("cl"),
    claude("cl2"),
    hypothesis("hyp", { phase: "understand" }),
    output("out"),
    output("inlet", { mode: "inlet", versionId: "v1" }),
  ]);

  it("snaps compatible wires to the matching port", () => {
    expect(canConnect(g, "src", "cl")).toEqual({ ok: true, port: "context" });
    expect(canConnect(g, "hyp", "cl")).toEqual({ ok: true, port: "hypothesis" });
    expect(canConnect(g, "cl", "out")).toEqual({ ok: true, port: "text" });
    expect(canConnect(g, "cl", "cl2")).toEqual({ ok: true, port: "context" });
    expect(canConnect(g, "inlet", "cl")).toEqual({ ok: true, port: "context" });
    expect(canConnect(g, "cl", "hyp")).toEqual({ ok: true, port: "evidence" });
    expect(canConnect(g, "inlet", "hyp")).toEqual({ ok: true, port: "evidence" });
  });

  it("bounces mismatches with the reason from Figma", () => {
    expect(canConnect(g, "src", "hyp")).toEqual({ ok: false, reason: "Context can't feed a hypothesis. Wire it into a Claude node instead." });
    expect(canConnect(g, "src", "out")).toMatchObject({ ok: false, reason: expect.stringContaining("Claude node first") });
    expect(canConnect(g, "hyp", "out")).toMatchObject({ ok: false, reason: expect.stringContaining("can't be a phase output") });
    expect(canConnect(g, "cl", "src")).toMatchObject({ ok: false, reason: expect.stringContaining("Sources don't take inputs") });
    expect(canConnect(g, "cl", "inlet")).toMatchObject({ ok: false, reason: expect.stringContaining("Inlets are locked") });
    expect(canConnect(g, "cl", "cl")).toEqual({ ok: false, reason: "A node can't feed itself." });
  });

  it("keeps wires inside a phase", () => {
    const g2 = graphOf([source("a", { phase: "define" }), claude("b", { phase: "understand" })]);
    expect(canConnect(g2, "a", "b")).toMatchObject({ ok: false, reason: expect.stringContaining("inside a phase") });
  });

  it("allows one input on single ports and refuses duplicates", () => {
    const g2 = graphOf([claude("a"), claude("b"), output("o")], [wire("a", "o", "text")]);
    expect(canConnect(g2, "b", "o")).toMatchObject({ ok: false, reason: expect.stringContaining("takes one input") });
    expect(canConnect(g2, "a", "o")).toEqual({ ok: false, reason: "Already wired." });
  });

  it("refuses wires that would close a loop", () => {
    const g2 = graphOf([claude("a"), claude("b"), claude("c")], [wire("a", "b", "context"), wire("b", "c", "context")]);
    expect(canConnect(g2, "c", "a")).toMatchObject({ ok: false, reason: expect.stringContaining("loop") });
  });

  it("connect stamps a creation sequence and topoOrder respects wires", () => {
    const ids = sequentialIds("e");
    const r = connect(graphOf([source("s"), claude("c")]), "s", "c", ids);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.edge).toMatchObject({ from: "s", to: "c", toPort: "context" });
    expect(r.graph.seq).toBe(r.edge.createdSeq + 1);
    expect(topoOrder(r.graph)).toEqual(["s", "c"]);
  });
});
