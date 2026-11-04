import { describe, expect, it } from "vitest";
import { diffGraphs, fromManifest, manifestHash, toManifest } from "./graph";
import { claude, graphOf, source, wire } from "./testing";

describe("manifest", () => {
  it("round-trips a graph through blobs", () => {
    const g = graphOf([source("a"), claude("c")], [wire("a", "c", "context")]);
    const { manifest, blobs } = toManifest(g);
    const store = new Map(blobs.map((b) => [b.hash, b.value]));
    expect(fromManifest(manifest, (h) => store.get(h))).toEqual(g);
  });

  it("shares blobs for unchanged nodes and changes the hash when anything changes", () => {
    const a = source("a");
    const g1 = graphOf([a, claude("c")]);
    const g2 = { ...g1, nodes: { ...g1.nodes, a: { ...a, weight: "heavy" as const } } };
    const m1 = toManifest(g1).manifest;
    const m2 = toManifest(g2).manifest;
    expect(m1.nodes.c).toBe(m2.nodes.c);
    expect(m1.nodes.a).not.toBe(m2.nodes.a);
    expect(manifestHash(m1)).not.toBe(manifestHash(m2));
    expect(manifestHash(m1)).toBe(manifestHash(toManifest(g1).manifest));
  });
});

describe("diffGraphs", () => {
  it("lists added nodes and wires in creation order, then changes", () => {
    const a = source("a");
    const before = graphOf([a]);
    const c = claude("c");
    const e = wire("a", "c", "context");
    const after = { ...graphOf([{ ...a, weight: "heavy" as const }, c], [e]), seq: before.seq };
    const changes = diffGraphs(before, after);
    expect(changes.map((x) => x.type)).toEqual(["node_added", "edge_added", "node_changed"]);
    expect(changes[2]).toMatchObject({ id: "a", fields: ["weight"] });
  });
});
