import { describe, expect, it } from "vitest";
import { emptyGraph, PHASES, previousPhase, type ClaudeNode } from "@composer/core";
import { incoming, templateRefs } from "@composer/engine";
import { scaffoldPhase } from "./scaffold";

describe("scaffoldPhase", () => {
  it.each(PHASES.filter((p) => p !== "understand" && p !== "share"))("wires every name the %s instructions mention", (phase) => {
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
});
