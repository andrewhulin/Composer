import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Graph, Weight } from "@composer/core";
import { claude, graphOf, hypothesis, output, source, wire } from "@composer/core/testing";
import { allStatuses, blastRadius, carryFreshness, claudeStatus, emptyEnv, envKeyFor, localKey, outputLockState, type KeyEnv } from "./keys";
import { updateNode } from "./graph-ops";

/** Marks every Claude node as freshly run against the current graph. */
function runAll(g: Graph, env: KeyEnv = emptyEnv): Graph {
  let out = g;
  const order = Object.values(g.nodes).filter((n) => n.kind === "claude").sort((a, b) => a.createdSeq - b.createdSeq);
  for (const n of order) {
    out = { ...out, outputs: { ...out.outputs, [n.id]: { runId: `r-${n.id}`, hash: `h-${n.id}-${localKey(out, n.id)}`, localKey: localKey(out, n.id), envKey: envKeyFor(env, n.phase) } } };
  }
  return out;
}

describe("staleness", () => {
  const base = graphOf([source("s"), claude("a"), claude("b"), output("o")], [wire("s", "a", "context"), wire("a", "b", "context"), wire("b", "o", "text")]);

  it("is never_run before the first run and fresh after", () => {
    expect(claudeStatus(base, "a", emptyEnv)).toBe("never_run");
    expect(allStatuses(runAll(base), emptyEnv)).toEqual({ a: "fresh", b: "fresh" });
  });

  it("goes stale when a weight changes, and downstream follows", () => {
    const g = updateNode(runAll(base), "s", { weight: "heavy" as Weight });
    expect(allStatuses(g, emptyEnv)).toEqual({ a: "stale", b: "stale" });
  });

  it("only goes stale_env when foundations or rules change", () => {
    const g = runAll(base);
    const env: KeyEnv = { foundations: ["ds-3.3"], rules: {} };
    expect(allStatuses(g, env)).toEqual({ a: "stale_env", b: "stale_env" });
  });

  it("ignores inputs switched off with the chip toggle", () => {
    const g = runAll(updateNode(base, "a", { disabledInputs: ["s"] }));
    expect(claudeStatus(updateNode(g, "s", { weight: "light" as Weight }), "a", emptyEnv)).toBe("fresh");
  });

  it("reports when a newer draft supersedes a locked output", () => {
    const g = runAll(base);
    const lockedHash = g.outputs.b!.hash;
    expect(outputLockState(g, "o", undefined)).toBe("draft");
    expect(outputLockState(g, "o", lockedHash)).toBe("locked");
    expect(outputLockState(g, "o", "older")).toBe("newer_available");
  });
});

describe("blast radius", () => {
  it("paints a hypothesis swap's downstream amber before anything runs", () => {
    const g = runAll(
      graphOf(
        [source("s", { phase: "define" }), hypothesis("h"), claude("c", { phase: "define" }), claude("other", { phase: "define" }), output("o", { phase: "define" })],
        [wire("s", "c", "context"), wire("h", "c", "hypothesis"), wire("c", "o", "text"), wire("s", "other", "context")],
      ),
    );
    const swapped = updateNode(g, "h", { blockId: "block-h2" });
    expect(blastRadius(g, swapped)).toEqual({ stale: ["c"], relock: ["o"] });
  });

  it("equals the set of nodes that are actually stale after any mutation (property)", () => {
    const weights: Weight[] = ["mute", "light", "normal", "heavy"];
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 7 }),
        fc.array(fc.tuple(fc.nat(), fc.nat()), { maxLength: 14 }),
        fc.nat(),
        fc.constantFrom(...weights),
        (n, pairs, pick, weight) => {
          const srcs = [source("s0"), source("s1")];
          const cls = Array.from({ length: n }, (_, i) => claude(`c${i}`));
          const edges = [];
          const seen = new Set<string>();
          for (const [x, y] of pairs) {
            const to = y % n;
            const fromIdx = x % (to + 2);
            const from = fromIdx < 2 ? `s${fromIdx}` : `c${fromIdx - 2}`;
            if (from === `c${to}`) continue;
            const key = `${from}>${to}`;
            if (seen.has(key)) continue;
            seen.add(key);
            edges.push(wire(from, `c${to}`, "context"));
          }
          const g = runAll(graphOf([...srcs, ...cls], edges));
          const target = `s${pick % 2}`;
          const after = updateNode(g, target, { weight, why: "changed" });
          const actual = Object.entries(allStatuses(after, emptyEnv)).filter(([, s]) => s === "stale").map(([id]) => id).sort();
          expect(blastRadius(g, after).stale).toEqual(actual);
        },
      ),
      { numRuns: 150 },
    );
  });
});

describe("carryFreshness", () => {
  const inlet = (versionId: string) => output("in", { mode: "inlet", familyId: "fam", versionId, phase: "define" });
  const before = runAll(graphOf([inlet("v1"), hypothesis("h", { blockId: "b1" }), claude("a"), claude("b")], [wire("in", "a", "context"), wire("h", "a", "hypothesis"), wire("a", "b", "context")]));
  const swap = (g: Graph): Graph => ({ ...g, nodes: { ...g.nodes, in: inlet("v2"), h: hypothesis("h", { blockId: "b2" }) } });

  it("keeps fresh nodes fresh when the ids they depend on are swapped", () => {
    expect(claudeStatus(swap(before), "a", emptyEnv)).toBe("stale");
    const after = carryFreshness(before, swap(before));
    expect(claudeStatus(after, "a", emptyEnv)).toBe("fresh");
    expect(claudeStatus(after, "b", emptyEnv)).toBe("fresh");
  });

  it("leaves stale nodes stale", () => {
    const edited = updateNode(before, "a", { instruction: "Say it differently" });
    expect(claudeStatus(edited, "a", emptyEnv)).toBe("stale");
    const after = carryFreshness(edited, swap(edited));
    expect(claudeStatus(after, "a", emptyEnv)).toBe("stale");
  });
});
