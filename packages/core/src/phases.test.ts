import { describe, expect, it } from "vitest";
import { PHASES, PHASE_INFO, nextPhase, previousPhase } from "./phases";

describe("phases", () => {
  it("lists the five phases in loop order with one output each", () => {
    expect(PHASES).toEqual(["understand", "define", "build", "validate", "share"]);
    expect(PHASES.map((p) => PHASE_INFO[p].output)).toEqual([
      "Weighted context",
      "Testable statement",
      "Prototype",
      "Verdict",
      "Release story",
    ]);
  });

  it("navigates neighbours, with no phase before Understand or after Share", () => {
    expect(previousPhase("understand")).toBeUndefined();
    expect(nextPhase("validate")).toBe("share");
    expect(nextPhase("share")).toBeUndefined();
  });
});
