import { describe, expect, it } from "vitest";
import { hashOf, type SourceContent } from "@composer/core";
import { claude, graphOf, source, wire } from "@composer/core/testing";
import { emptyEnv, envKeyFor, localKey } from "./keys";
import { FakeLlm } from "./llm";
import { judgeRequest, parseJudgment, replayRequest } from "./replay";
import {
  ADVISOR_NUDGE,
  DEFAULT_BUDGET,
  HAIKU,
  OPUS,
  SONNET,
  changedTasks,
  costOf,
  defaultTable,
  effectiveRoute,
  estimateRun,
  nextTier,
  overBudget,
  readAdvisor,
  routeFor,
  routeTags,
  spendOf,
  summarizeRouterReplay,
  uncachedCost,
  type RouterTable,
} from "./router";
import { runClaudeNode, type RunDeps } from "./run";

describe("routing", () => {
  it("keeps every call that decides on Opus, and moves drafts and generation down", () => {
    const t = defaultTable();
    for (const task of ["draft_statement", "test_strategy", "verdict", "compile", "review", "reflect", "judge"] as const) expect(routeFor(t, task)).toEqual({ model: OPUS, advisor: false });
    expect(routeFor(t, "prototype")).toEqual({ model: SONNET, advisor: true });
    expect(routeFor(t, "pr_description")).toEqual({ model: HAIKU, advisor: true });
  });

  it("never gives Opus an advisor, even when the table asks", () => {
    const t: RouterTable = { v: 1, routes: { ...defaultTable().routes, verdict: { model: OPUS, advisor: true } } };
    expect(routeFor(t, "verdict").advisor).toBe(false);
  });

  it("lets a pin or an escalation override the table, and old nodes on other models count as pinned", () => {
    const t = defaultTable();
    expect(effectiveRoute(t, { recipe: "prototype", model: OPUS })).toMatchObject({ model: SONNET, advisor: true, source: "router" });
    expect(effectiveRoute(t, { recipe: "prototype", model: OPUS, modelPinned: true })).toMatchObject({ model: OPUS, advisor: false, source: "pinned" });
    expect(effectiveRoute(t, { recipe: "verdict", model: HAIKU })).toMatchObject({ model: HAIKU, advisor: true, source: "pinned" });
    expect(effectiveRoute(t, { recipe: "prototype", model: OPUS, escalation: { model: OPUS } })).toMatchObject({ model: OPUS, source: "escalated" });
  });

  it("moves up one tier at a time and stops at Opus", () => {
    expect([nextTier(HAIKU), nextTier(SONNET), nextTier(OPUS)]).toEqual([SONNET, OPUS, null]);
  });

  it("lists the tasks a table change touches", () => {
    const a = defaultTable();
    const b: RouterTable = { v: 1, routes: { ...a.routes, verdict: { model: SONNET, advisor: true }, prototype: { model: SONNET, advisor: false } } };
    expect(changedTasks(a, b)).toEqual(["prototype", "verdict"]);
    expect(changedTasks(a, defaultTable())).toEqual([]);
  });
});

describe("environment keys", () => {
  const node = (over: Record<string, unknown> = {}) => ({ recipe: "prototype" as const, model: OPUS, ...over });

  it("leaves Opus recipes' keys as they were before routing", () => {
    const env = { ...emptyEnv, routes: routeTags(defaultTable()) };
    expect(envKeyFor(env, "define", { recipe: "draft_statement", model: OPUS })).toBe(envKeyFor(emptyEnv, "define"));
  });

  it("marks a routed recipe's nodes when its route changes, but not pinned or escalated ones", () => {
    const before = { ...emptyEnv, routes: routeTags(defaultTable()) };
    const after = { ...emptyEnv, routes: routeTags({ v: 1, routes: { ...defaultTable().routes, prototype: { model: HAIKU, advisor: true } } }) };
    expect(envKeyFor(before, "build", node())).not.toBe(envKeyFor(after, "build", node()));
    expect(envKeyFor(before, "build", node({ modelPinned: true }))).toBe(envKeyFor(after, "build", node({ modelPinned: true })));
    expect(envKeyFor(before, "build", node({ escalation: { model: OPUS, reason: "low_score" } }))).toBe(envKeyFor(after, "build", node({ escalation: { model: OPUS, reason: "low_score" } })));
  });

  it("makes a node stale when it's escalated", () => {
    const g = graphOf([claude("c", { phase: "build", recipe: "prototype" })]);
    const up = graphOf([claude("c", { phase: "build", recipe: "prototype", escalation: { model: OPUS, reason: "low_score" } })]);
    expect(localKey(g, "c")).not.toBe(localKey(up, "c"));
  });
});

describe("cost", () => {
  it("prices a call at its model's rates, cache writes at the 1-hour rate", () => {
    expect(costOf(OPUS, { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(4);
    expect(costOf(SONNET, { input: 0, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 0 })).toBeCloseTo(10.1);
    expect(costOf(OPUS, { input: 0, output: 0, cacheRead: 0, cacheWrite: 1_000_000 })).toBeCloseTo(8);
    expect(costOf(HAIKU, { input: 100_000, output: 0, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(0.01);
    // Over 100K prompt tokens, Haiku bills at its long-prompt rates.
    expect(costOf(HAIKU, { input: 200_000, output: 0, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(0.1);
  });

  it("compares like for like with cache taken out", () => {
    expect(uncachedCost(OPUS, { input: 0, output: 0, cacheRead: 1_000_000, cacheWrite: 0 })).toBeCloseTo(4);
  });

  it("totals spend per model and the cache hit rate, pricing old runs from their usage", () => {
    const s = spendOf([
      { model: OPUS, usage: { input: 100, output: 50, cacheRead: 300, cacheWrite: 100 }, cost: null },
      { model: SONNET, usage: { input: 100, output: 50, cacheRead: 300, cacheWrite: 100 }, cost: 0.5 },
      { model: OPUS, usage: null, cost: null },
    ]);
    expect(s.runs).toBe(2);
    expect(s.tokens).toBe(1100);
    expect(s.cacheHitRate).toBeCloseTo(0.6);
    expect(s.byModel[SONNET]).toEqual({ usd: 0.5, tokens: 550, runs: 1 });
    expect(s.usd).toBeCloseTo(0.5 + costOf(OPUS, { input: 100, output: 50, cacheRead: 300, cacheWrite: 100 }));
  });
});

describe("budgets", () => {
  it("passes a run that fits", () => {
    expect(overBudget(DEFAULT_BUDGET, estimateRun(SONNET, 20_000, "prototype"), { usd: 1, tokens: 0 })).toBeNull();
  });

  it("warns per run, in dollars and in tokens", () => {
    expect(overBudget({ ...DEFAULT_BUDGET, perRunUsd: 0.1 }, estimateRun(OPUS, 50_000, "prototype"), { usd: 0, tokens: 0 })).toMatch(/per-run budget/);
    expect(overBudget({ ...DEFAULT_BUDGET, perRunTokens: 10_000 }, estimateRun(HAIKU, 50_000, "pr_description"), { usd: 0, tokens: 0 })).toMatch(/50k tokens, over the 10k-token per-run budget/);
  });

  it("warns when the run would take the project over", () => {
    expect(overBudget({ ...DEFAULT_BUDGET, perProjectUsd: 5 }, estimateRun(OPUS, 50_000, "verdict"), { usd: 4.9, tokens: 0 })).toMatch(/spent \$4.90 of its \$5.00 budget/);
    expect(overBudget({ ...DEFAULT_BUDGET, perProjectTokens: 100_000 }, estimateRun(OPUS, 50_000, "verdict"), { usd: 0, tokens: 60_000 })).toMatch(/token budget/);
  });
});

describe("the advisor", () => {
  it("reads readable, encrypted and failed consultations", () => {
    expect(
      readAdvisor([
        { type: "text", text: "plan" },
        { type: "server_tool_use", name: "advisor" },
        { type: "advisor_tool_result", content: { type: "advisor_result", text: "Check the empty state.", stop_reason: "end_turn" } },
        { type: "advisor_tool_result", content: { type: "advisor_redacted_result", encrypted_content: "x" } },
        { type: "advisor_tool_result", content: { type: "advisor_tool_result_error", error_code: "overloaded" } },
      ]),
    ).toEqual([{ kind: "text", text: "Check the empty state.", stopReason: "end_turn" }, { kind: "redacted", stopReason: null }, { kind: "error", errorCode: "overloaded" }]);
  });

  const content: SourceContent = { v: 1, kind: "context", items: [{ id: "i", kind: "note", title: "Notes", units: [{ text: "People lose their place." }] }] };
  const deps = (llm: FakeLlm, route?: RunDeps["route"]): RunDeps => ({
    llm,
    readBlob: () => content,
    env: emptyEnv,
    foundations: { designSystem: { version: "1", digest: "tokens" } },
    rules: [{ id: "R1", text: "Quote people." }],
    memory: { outputs: [], chain: [] },
    block: () => undefined,
    version: () => undefined,
    ...(route ? { route } : {}),
  });
  const g = graphOf([source("notes", { phase: "share", contentHash: hashOf(content) }), claude("c", { phase: "share", recipe: "pr_description", instruction: "Describe the PR from {notes}." })], [wire("notes", "c", "context")]);

  const PR = '{"title":"t","summary":"s","before":"b","after":"a","why":"w","metric":"m","testing":[]}';

  it("attaches Opus to a Sonnet run, after the cached blocks, so the cached prefix doesn't move", async () => {
    const plain = new FakeLlm(() => ({ deltas: [PR] }));
    const routed = new FakeLlm(() => ({ deltas: [PR], advisor: [{ kind: "redacted" }] }));
    await runClaudeNode(g, "c", "r1", deps(plain), { signal: new AbortController().signal });
    const out = await runClaudeNode(g, "c", "r2", deps(routed, { model: SONNET, advisor: true }), { signal: new AbortController().signal });
    const [a] = plain.requests;
    const [b] = routed.requests;
    expect(b!.model).toBe(SONNET);
    expect(b!.advisor).toEqual({ model: OPUS, maxUses: 3 });
    expect(b!.system.slice(0, a!.system.length)).toEqual(a!.system);
    expect(b!.system.at(-1)).toEqual({ type: "text", text: ADVISOR_NUDGE });
    expect(b!.messages).toEqual(a!.messages);
    expect(out).toMatchObject({ result: { advisor: [{ kind: "redacted" }] } });
  });

  it("sends no advisor when Opus runs", async () => {
    const llm = new FakeLlm(() => ({ deltas: [PR] }));
    await runClaudeNode(g, "c", "r", deps(llm, { model: OPUS, advisor: true }), { signal: new AbortController().signal });
    expect(llm.requests[0]!.advisor).toBeUndefined();
    expect(llm.requests[0]!.system.some((b) => b.text === ADVISOR_NUDGE)).toBe(false);
  });

  it("replays with the same advisor setup a live run uses", () => {
    const p = { system: [{ type: "text" as const, text: "charter" }], messages: [{ role: "user" as const, content: "brief" }] };
    expect(replayRequest(p, "prototype", SONNET, "high", true)).toMatchObject({ model: SONNET, advisor: { model: OPUS }, system: [{ text: "charter" }, { text: ADVISOR_NUDGE }] });
    expect(replayRequest(p, "prototype", OPUS, "high", true).advisor).toBeUndefined();
  });
});

describe("golden-set replay for a router change", () => {
  it("judges blind and unflips the answer", () => {
    const p = { system: [], messages: [{ role: "user" as const, content: [{ type: "text" as const, text: "Write the PR description." }] }] };
    const req = judgeRequest(p, "share", "BASE", "CAND", OPUS, true);
    const user = req.messages[0]!.content as string;
    expect(user.indexOf("CAND")).toBeLessThan(user.indexOf("BASE"));
    expect(user).toContain("Write the PR description.");
    expect(parseJudgment('{"a":{"score":4,"reason":"x"},"b":{"score":2,"reason":"y"}}', true)).toEqual({ baseline: { score: 2, reason: "y" }, candidate: { score: 4, reason: "x" } });
  });

  it("passes when every brief replays and the score holds, and shows the cost delta", () => {
    const s = summarizeRouterReplay([
      { status: "done", baselineScore: 4, candidateScore: 4, baselineCost: 0.4, candidateCost: 0.1 },
      { status: "done", baselineScore: 4, candidateScore: 3.75, baselineCost: 0.4, candidateCost: 0.1 },
    ]);
    expect(s.passes).toBe(true);
    expect(s.line).toBe("Score 4.0 → 3.9 (−0.1) · cost per run $0.40 → $0.10 (−75%)");
  });

  it("refuses a change that drops the score, leaves a brief unjudged, or has nothing to replay", () => {
    expect(summarizeRouterReplay([{ status: "done", baselineScore: 4, candidateScore: 3, baselineCost: 0.4, candidateCost: 0.1 }]).passes).toBe(false);
    expect(summarizeRouterReplay([{ status: "error", baselineScore: null, candidateScore: null, baselineCost: 0.4, candidateCost: null }]).passes).toBe(false);
    expect(summarizeRouterReplay([]).passes).toBe(false);
  });
});
