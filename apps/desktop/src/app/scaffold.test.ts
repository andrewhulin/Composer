import { describe, expect, it } from "vitest";
import { emptyGraph, PHASES, previousPhase, type ClaudeNode } from "@composer/core";
import { incoming, templateRefs } from "@composer/engine";
import { evidenceTargets, keySource, newVariant, scaffoldPhase, variantsOf } from "./scaffold";

describe("scaffoldPhase", () => {
  it.each(PHASES.filter((p) => p !== "understand"))("wires every name the %s instructions mention", (phase) => {
    const from = previousPhase(phase)!;
    const g = scaffoldPhase(emptyGraph(), phase, 1, { familyId: "fam", versionId: "ver", phase: from });
    for (const node of Object.values(g.nodes).filter((n): n is ClaudeNode => n.kind === "claude")) {
      const wired = new Set(incoming(g, node.id).map((e) => g.nodes[e.from]?.alias));
      const missing = templateRefs(node.instruction).filter((ref) => !wired.has(ref) && !(ref in node.options) && !["hypothesis", "pins", "rules"].includes(ref));
      expect(missing, `${node.title}: ${node.instruction}`).toEqual([]);
    }
  });

  it("keeps the names instructions rely on when a phase is scaffolded again in the next loop", () => {
    const inlet = { familyId: "fam", versionId: "ver", phase: "build" as const };
    const g = scaffoldPhase(scaffoldPhase(emptyGraph(), "validate", 1, inlet), "validate", 2, inlet);
    const loop2 = Object.values(g.nodes).filter((n) => n.loop === 2);
    expect(loop2.find((n) => n.kind === "claude" && n.recipe === "test_strategy")?.alias).toBe("strategy");
    expect(loop2.find((n) => n.kind === "output" && n.mode === "inlet")?.alias).toBe("prototype");
  });

  it("starts Build as three variants in different directions, all fed by the inlet", () => {
    const g = scaffoldPhase(emptyGraph(), "build", 1, { familyId: "fam", versionId: "ver", phase: "define" });
    const vs = variantsOf(g, 1);
    expect(vs.map((v) => v.options.direction)).toEqual(["direct", "structural", "expressive"]);
    expect(vs.map((v) => v.alias)).toEqual(["variant-a", "variant-b", "variant-c"]);
    const inlet = Object.values(g.nodes).find((n) => n.kind === "output" && n.mode === "inlet")!;
    for (const v of vs) expect(incoming(g, v.id).map((e) => e.from)).toEqual([inlet.id]);
    const out = Object.values(g.nodes).find((n) => n.kind === "output" && n.mode === "output")!;
    expect(keySource(g, out.id)?.id).toBe(vs[0]!.id);
    expect(evidenceTargets(g, "build", 1).map((n) => n.id)).toEqual(vs.map((v) => v.id));
  });

  it("names a forked variant's base in its instruction", () => {
    const g = scaffoldPhase(emptyGraph(), "build", 1, { familyId: "fam", versionId: "ver", phase: "define" });
    const base = variantsOf(g, 1)[1]!;
    const v = newVariant(g, 1, "refine", 2, 0, { x: 0, y: 0 }, base);
    expect(v.alias).toBe("variant-r2-a");
    expect(v.instruction).toContain("{variant-b}");
    expect(v.options).toEqual({ fidelity: "wireframe", direction: "refine", round: "2" });
  });
});
