import { describe, expect, it } from "vitest";
import { hashOf, type HypothesisBlock, type SourceContent } from "@composer/core";
import { claude, graphOf, hypothesis, source, wire } from "@composer/core/testing";
import { emptyEnv, localKey } from "./keys";
import { updateNode } from "./graph-ops";
import { AbortError, FakeLlm } from "./llm";
import { buildPrompt, runClaudeNode, RunError, type RunDeps } from "./run";

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

describe("variants, notes and the kit", () => {
  const proto = { title: "Recap", fidelity: "wireframe", html: "<section data-screen=\"Home\">Hi</section>", screens: [{ name: "Home", purpose: "x" }], rationale: "r", tests: "t" };
  const protoArt = { v: 1 as const, kind: "text" as const, artifact: "prototype", text: "Prototype (Wireframe): Recap", data: proto };
  const protoHash = hashOf(protoArt);

  function variants(notes = false) {
    const base = claude("a", { phase: "build", recipe: "prototype", alias: "base" });
    const fork = claude("b", {
      phase: "build",
      recipe: "prototype",
      instruction: "Build a {fidelity} prototype. Direction: {direction}. Start from {base}, the variant the designer forked.",
      options: { fidelity: "wireframe", direction: "refine" },
      ...(notes ? { notes: [{ id: "n1", runId: "run-b", anchor: { kind: "point" as const, x: 40, y: 120, screen: "Home", element: "button “Next”" }, text: "Make this the primary action.", createdAt: "t" }] } : {}),
    });
    const g = graphOf([base, fork], [wire("a", "b", "context")]);
    g.outputs.a = { runId: "run-a", hash: protoHash, localKey: "k", envKey: "e" };
    g.outputs.b = { runId: "run-b", hash: protoHash, localKey: "k", envKey: "e" };
    const deps: RunDeps = { llm: new FakeLlm([]), readBlob: (h) => (h === protoHash ? protoArt : undefined), env: emptyEnv, foundations: {}, rules: [], memory: { outputs: [], chain: [] }, block: () => undefined, version: () => undefined };
    return { g, deps };
  }

  it("fills the direction and hands a forked variant the base prototype's HTML", () => {
    const { g, deps } = variants();
    const p = buildPrompt(g, "b", deps);
    const text = JSON.stringify(p.messages);
    expect(text).toContain("Direction: Refine: keep the base variant's idea");
    expect(text).toContain("HTML: <section data-screen=\\\"Home\\\">Hi</section>");
    expect(p.unknownRefs).toEqual([]);
  });

  it("puts notes on the current output into the next prompt and marks the node stale", () => {
    const plain = variants();
    const noted = variants(true);
    expect(localKey(plain.g, "b")).not.toBe(localKey(noted.g, "b"));
    const text = JSON.stringify(buildPrompt(noted.g, "b", noted.deps).messages);
    expect(text).toContain('alias=\\"notes\\"');
    expect(text).toContain("screen Home at 40,120 on button “Next”: Make this the primary action.");
    // Once the node reruns, the notes were answered and stop riding along.
    noted.g.outputs.b = { ...noted.g.outputs.b!, runId: "run-c" };
    expect(JSON.stringify(buildPrompt(noted.g, "b", noted.deps).messages)).not.toContain('alias=\\"notes\\"');
  });

  it("keeps keys of nodes without notes unchanged", () => {
    const { g } = variants();
    const withEmpty = { ...g, nodes: { ...g.nodes, b: { ...g.nodes.b!, notes: [] } } } as typeof g;
    expect(localKey(withEmpty, "b")).toBe(localKey(g, "b"));
  });
});
