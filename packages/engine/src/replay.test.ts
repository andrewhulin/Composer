import { describe, expect, it } from "vitest";
import { assemble } from "./assembly/prompt";
import { FakeLlm } from "./llm";
import { pairsBlock, pickedPhases, replayOne, replayRequest, tallyReplay, withCandidatePrinciple, withCandidateRule, type PickedPair } from "./replay";

const prompt = (rules: { id: string; text: string }[] = [], philosophy = true) => {
  const p = assemble({
    phase: "build",
    charter: "Build it.",
    foundations: philosophy ? { philosophy: { rev: 3, principles: [{ n: 1, text: "Clarity first.", strength: "strong" }, { n: 2, text: "Show, don't tell.", strength: "steady" }] } } : {},
    rules,
    memory: { outputs: [], chain: [] },
    docs: [],
    instruction: "Build.",
    budget: 200_000,
  });
  return { system: p.system, messages: p.messages };
};

describe("replay", () => {
  it("adds a candidate rule and changes nothing else", () => {
    const base = prompt([{ id: "R1", text: "Use real copy." }]);
    const next = withCandidateRule(base, "build", { id: "R9", text: "Lead with the moment." });
    expect(next.system[2]!.text).toBe("Rules learned from the designer's scored runs in Build. Apply them:\n[R1] Use real copy.\n[R9] Lead with the moment.");
    expect(next.system[0]).toEqual(base.system[0]);
    expect(next.system[1]).toEqual(base.system[1]);
    expect(next.messages).toBe(base.messages);
    expect(withCandidateRule(prompt(), "build", { id: "R9", text: "x" }).system[2]!.text).toContain("[R9] x");
  });

  it("adds, rewords and retires principles", () => {
    const base = prompt();
    expect(withCandidatePrinciple(base, { kind: "principle", change: "added", n: null, text: "Fewer screens." }).system[1]!.text).toContain("03. Fewer screens. (forming)");
    const reworded = withCandidatePrinciple(base, { kind: "principle", change: "reworded", n: 2, text: "Show it." }).system[1]!.text;
    expect(reworded).toContain("02. Show it. (steady)");
    expect(reworded).not.toContain("Show, don't tell.");
    expect(withCandidatePrinciple(base, { kind: "principle", change: "retired", n: 1, text: "" }).system[1]!.text).not.toContain("Clarity first.");
    expect(withCandidatePrinciple(prompt([], false), { kind: "principle", change: "added", n: null, text: "New one." }).system[1]!.text).toContain("01. New one. (forming)");
  });

  it("reruns a stored prompt with the recipe's schema", async () => {
    const p = prompt();
    expect(replayRequest(p, "prototype", "claude-opus-5-5").schema).toBeDefined();
    const json = JSON.stringify({ title: "T", fidelity: "lofi", html: "<p/>", screens: [], rationale: "r", tests: "t" });
    const out = await replayOne(new FakeLlm([{ deltas: [json] }]), p, "prototype", "claude-opus-5-5", new AbortController().signal);
    expect(out.text).toContain("Prototype (Low-fi): T");
  });

  it("tallies the side by side", () => {
    expect(tallyReplay([]).line).toBe("No briefs replayed yet");
    expect(tallyReplay(["candidate", "candidate", "baseline", "same"])).toMatchObject({ line: "Candidate preferred on 2 of 4, 1 the same", favours: true });
    expect(tallyReplay(["candidate", null]).favours).toBe(false);
  });

  it("renders picks as Reflect evidence", () => {
    const pair = (i: number): PickedPair => ({ phase: "build", winner: { runId: `w${i}`, instruction: "i", output: "good" }, loser: { runId: `l${i}`, instruction: "i", output: "bad" } });
    const pairs = [1, 2, 3, 4, 5].map(pair);
    expect(pickedPhases(pairs)).toEqual(["build"]);
    expect(pickedPhases(pairs.slice(0, 4))).toEqual([]);
    expect(pairsBlock(pairs)).toContain('<preferred run="w1">good</preferred>');
  });
});
