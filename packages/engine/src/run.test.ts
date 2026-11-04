import { describe, expect, it } from "vitest";
import { hashOf, type HypothesisBlock, type SourceContent } from "@composer/core";
import { claude, graphOf, hypothesis, source, wire } from "@composer/core/testing";
import { emptyEnv, localKey } from "./keys";
import { updateNode } from "./graph-ops";
import { AbortError, FakeLlm } from "./llm";
import { runClaudeNode, RunError, type RunDeps } from "./run";

const content: SourceContent = {
  v: 1,
  kind: "context",
  items: [{ id: "i1", kind: "transcript", title: "P07", units: [{ text: "I forget where we left off.", label: "P07 · 14:22" }] }],
};
const contentHash = hashOf(content);
const block: HypothesisBlock = { id: "block-h", projectId: "p", label: "H2", statement: "Returning users want proof of progress.", vars: [], status: "testing", confidence: 0.62 };

const statement = {
  frame: "problem_statement",
  statement: "Returning users can’t see what changed since their last session.",
  parts: { who: "returning users", behavior: "open the recap", because: "it shows what changed", metric: "recap opens within 24h rise 40%" },
  support: [{ label: "Who", text: "people on their third session or later." }],
  checks: { testable: true, specific_user: true, measurable: true, heavy_sources: ["interviews"] },
  alternates: [],
};

function setup(llm: FakeLlm) {
  const g = graphOf(
    [source("interviews", { phase: "define", contentHash, weight: "heavy" }), hypothesis("h"), claude("c", { phase: "define", recipe: "draft_statement", instruction: "Draft one {frame} from {interviews}. Hold it against {H2}.", options: { frame: "problem_statement" } })],
    [wire("interviews", "c", "context"), wire("h", "c", "hypothesis")],
  );
  const deps: RunDeps = {
    llm,
    readBlob: (h) => (h === contentHash ? content : undefined),
    env: emptyEnv,
    foundations: {},
    rules: [],
    memory: { outputs: [], chain: [] },
    block: (id) => (id === "block-h" ? block : undefined),
    version: () => undefined,
  };
  return { g, deps };
}

describe("runClaudeNode", () => {
  it("streams, parses structured output and renders readable text", async () => {
    const json = JSON.stringify(statement);
    const llm = new FakeLlm([{ deltas: [json.slice(0, 20), json.slice(20)] }]);
    const { g, deps } = setup(llm);
    const seen: string[] = [];
    const out = await runClaudeNode(g, "c", "run-1", deps, { signal: new AbortController().signal, onText: (d) => seen.push(d) });
    expect(seen.join("")).toBe(json);
    expect(out.artifact.text).toContain("Problem statement: Returning users can’t see what changed");
    expect(out.output).toMatchObject({ runId: "run-1", localKey: localKey(g, "c") });
    const req = llm.requests[0]!;
    expect(req.schema).toBeDefined();
    expect(JSON.stringify(req.messages)).toContain("Draft one problem statement from <interviews>. Hold it against <H2>.");
  });

  it("refuses to run with an unknown reference", async () => {
    const { g, deps } = setup(new FakeLlm([]));
    const bad = updateNode(g, "c", { instruction: "Use {mobbin}." });
    await expect(runClaudeNode(bad, "c", "r", deps, { signal: new AbortController().signal })).rejects.toMatchObject({ code: "unknown_refs" });
  });

  it("surfaces a refusal with its explanation", async () => {
    const { g, deps } = setup(new FakeLlm([{ stopReason: "refusal", refusal: "Declined." }]));
    await expect(runClaudeNode(g, "c", "r", deps, { signal: new AbortController().signal })).rejects.toEqual(new RunError("Declined.", "refusal"));
  });

  it("stops when cancelled", async () => {
    const { g, deps } = setup(new FakeLlm([{ deltas: ["a", "b", "c"], delayMs: 20 }]));
    const ctrl = new AbortController();
    const p = runClaudeNode(g, "c", "r", deps, { signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 10);
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });
});
