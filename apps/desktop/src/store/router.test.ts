// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { ulid, type ClaudeNode } from "@composer/core";
import { FakeLlm, HAIKU, OPUS, SONNET, type FakeTurn, type LlmClient, type LlmRequest } from "@composer/engine";
import { migrate, Repo } from "@composer/data";
import { nodeSqliteDriver } from "@composer/data/node-sqlite";

vi.mock("@tauri-apps/plugin-updater", () => ({ check: vi.fn(async () => null) }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "0.1.0" }));

/**
 * The app over an in-memory database. Calls go to the scripted demo model unless a test queues
 * its own turns first, which is how the failures below are forced.
 */
async function app() {
  vi.resetModules();
  history.replaceState(null, "", "/?fake");
  const script: ((req: LlmRequest) => FakeTurn)[] = [];
  const requests: LlmRequest[] = [];
  const { demoLlm } = (await vi.importActual("../llm/demo")) as { demoLlm: () => LlmClient };
  const real = demoLlm();
  const llm: LlmClient = {
    stream: (req, h) => {
      requests.push(req);
      const turn = script.shift();
      return turn ? new FakeLlm([turn(req)]).stream(req, h) : real.stream(req, h);
    },
    countTokens: (req) => real.countTokens(req),
  };
  vi.doMock("../llm/demo", () => ({ demoLlm: () => llm }));
  const db = nodeSqliteDriver();
  await migrate(db);
  const repo = new Repo(db, () => ulid());
  const p = await repo.createProject("A");
  const project = await import("./project");
  const craft = await import("./craft");
  const router = await import("./router");
  await project.loadProject({ repo, project: p, interrupted: 0 });
  await craft.loadCraft();
  await router.loadRouter();
  const synth = () => Object.values(project.useProject.getState().graph.nodes).find((n): n is ClaudeNode => n.kind === "claude" && n.recipe === "synthesize_insights")!;
  /** Runs a node and waits until it finishes, one way or the other. */
  const run = async (id: string) => {
    const before = project.useProject.getState().lastRuns[id]?.id;
    project.actions.run(id);
    await vi.waitFor(() => {
      const s = project.useProject.getState();
      if (s.budgetWarning) return;
      if (s.lastRuns[id]?.id === before && s.live[id]?.status !== "failed") throw new Error("still running");
    }, { timeout: 5000, interval: 20 });
    return project.useProject.getState().lastRuns[id];
  };
  return { repo, p, script, requests, synth, run, ...project, ...craft, ...router, r: () => router.useRouter.getState(), s: () => project.useProject.getState() };
}

const BAD: FakeTurn = { deltas: ["not json"] };

describe("routing a run", () => {
  it("runs each recipe on its mapped model, with the advisor attached below Opus, and records it", async () => {
    const t = await app();
    const run = await t.run(t.synth().id);
    expect(t.requests[0]).toMatchObject({ model: SONNET, advisor: { model: OPUS } });
    expect(run).toMatchObject({ status: "succeeded", model: SONNET, advisor: [{ kind: "redacted" }], escalatedFrom: null });
    expect(run!.cost).toBeGreaterThan(0);
    expect(t.s().spend).toMatchObject({ runs: 1 });
    expect(t.s().spend!.usd).toBeCloseTo(run!.cost!);
  });

  it("keeps a pinned model, across a reload", async () => {
    const t = await app();
    t.actions.setModel(t.synth().id, HAIKU);
    await t.saveNow();
    const saved = (await t.repo.loadWorking(t.p.id))!.nodes[t.synth().id] as ClaudeNode;
    expect(saved).toMatchObject({ model: HAIKU, modelPinned: true });
    await t.run(t.synth().id);
    expect(t.requests[0]).toMatchObject({ model: HAIKU, advisor: { model: OPUS } });
    t.actions.setModel(t.synth().id, "auto");
    expect(t.synth()).toMatchObject({ model: OPUS, modelPinned: false });
  });
});

describe("escalation", () => {
  it("moves up a tier when the answer fails validation twice, and logs it", async () => {
    const t = await app();
    t.script.push(() => BAD, () => BAD);
    const run = await t.run(t.synth().id);
    expect(t.requests.map((r) => r.model)).toEqual([SONNET, SONNET, OPUS]);
    expect(run).toMatchObject({ status: "succeeded", model: OPUS, escalatedFrom: SONNET });
    // All three attempts were billed.
    expect(run!.usage!.input).toBeGreaterThan(t.requests.length - 1);
    const logged = (await t.repo.listDecisions(t.p.id)).filter((d) => d.kind === "escalation");
    expect(logged).toHaveLength(1);
    expect(logged[0]!.payload).toMatchObject({ from: SONNET, to: OPUS, reason: "invalid_output" });
  });

  it("reruns on Opus when the advisor is unavailable", async () => {
    const t = await app();
    t.script.push((req) => ({ ...BAD, deltas: [JSON.stringify({ summary: "s", insights: [], tensions: [], open_questions: [] })], advisor: req.advisor ? [{ kind: "error", errorCode: "overloaded" }] : [] }));
    const run = await t.run(t.synth().id);
    expect(t.requests.map((r) => [r.model, !!r.advisor])).toEqual([
      [SONNET, true],
      [OPUS, false],
    ]);
    expect(run).toMatchObject({ model: OPUS, escalatedFrom: SONNET, advisor: [{ kind: "error", errorCode: "overloaded" }] });
    expect((await t.repo.listDecisions(t.p.id)).find((d) => d.kind === "escalation")?.payload).toMatchObject({ reason: "advisor_unavailable" });
  });

  it("moves a node up for its next runs after a low score or a wrong mark", async () => {
    const t = await app();
    const first = await t.run(t.synth().id);
    await t.score(first!.id, 2);
    expect(t.synth().escalation).toEqual({ model: OPUS, reason: "low_score" });
    expect(t.statusesOf(t.s().graph, t.s().env)[t.synth().id]).toBe("stale");
    await t.run(t.synth().id);
    expect(t.requests.at(-1)).toMatchObject({ model: OPUS });
    expect(t.requests.at(-1)!.advisor).toBeUndefined();
    // Already on Opus: a wrong mark has nowhere to go, and says so.
    await t.markWrong(t.s().lastRuns[t.synth().id]!.id);
    expect(t.s().toasts.at(-1)?.text).toMatch(/already runs on Opus 5.5/);
  });
});

describe("budgets", () => {
  it("warns before a run that would go over, and runs only on a yes", async () => {
    const t = await app();
    await t.setBudget({ perRunUsd: 0.000001, perRunTokens: null, perProjectUsd: null, perProjectTokens: null });
    t.actions.run(t.synth().id);
    await vi.waitFor(() => expect(t.s().budgetWarning?.message).toMatch(/per-run budget/));
    t.actions.answerBudget(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(t.requests).toHaveLength(0);
    const run = t.run(t.synth().id);
    await vi.waitFor(() => expect(t.s().budgetWarning).not.toBeNull());
    t.actions.answerBudget(true);
    await run;
    await vi.waitFor(() => expect(t.s().lastRuns[t.synth().id]).toBeDefined());
    expect(t.requests).toHaveLength(1);
  });

  it("keeps the budget across a reload", async () => {
    const t = await app();
    await t.setBudget({ perRunUsd: 1, perRunTokens: 50_000, perProjectUsd: 20, perProjectTokens: null });
    await t.loadRouter();
    expect(t.r().budget).toEqual({ perRunUsd: 1, perRunTokens: 50_000, perProjectUsd: 20, perProjectTokens: null });
  });
});

describe("changing the router", () => {
  it("can't go live without a golden-set replay, then does once the replay holds the score", async () => {
    const t = await app();
    t.setDraftRoute("synthesize_insights", { model: HAIKU, advisor: true });
    let p = await t.proposeRouter();
    expect(p?.diff.tasks).toEqual(["synthesize_insights"]);
    expect(t.r().replay?.summary.briefs).toBe(0);
    expect(t.canKeep(t.r().proposal, t.r().replay)).toBe(false);

    // A scored run gives the golden set a brief to replay.
    const run = await t.run(t.synth().id);
    await t.score(run!.id, 4);
    t.setDraftRoute("synthesize_insights", { model: HAIKU, advisor: true });
    p = await t.proposeRouter();
    const replay = t.r().replay!;
    expect(replay.cases).toHaveLength(1);
    expect(replay.cases[0]).toMatchObject({ status: "done", from: SONNET, to: { model: HAIKU, advisor: true }, baselineScore: 4, candidateScore: 4, consulted: 1 });
    expect(replay.cases[0]!.candidateCost!).toBeLessThan(replay.cases[0]!.baselineCost!);
    expect(replay.summary.line).toMatch(/^Score 4\.0 → 4\.0 \(\+0\.0\) · cost per run \$[\d.<]+ → [<$\d.]+ \(−\d+%\)$/);
    expect((await t.repo.replayResults(p!.id))[0]).toMatchObject({ model: HAIKU, usage: { output: expect.any(Number) } });
    const judge = t.requests.at(-1)!;
    expect(judge.model).toBe(OPUS);

    const status = () => t.statusesOf(t.s().graph, t.s().env)[t.synth().id];
    expect(status()).toBe("fresh");
    await t.keepRouter();
    expect(t.r().table.routes.synthesize_insights).toEqual({ model: HAIKU, advisor: true });
    expect(t.r().row?.version).toBe("v1");
    expect(status()).toBe("stale_env");
    // The kept table is what loads next time.
    await t.loadRouter();
    expect(t.r().table.routes.synthesize_insights).toEqual({ model: HAIKU, advisor: true });
  });

  it("goes live straight away when it only moves a craft job, which has no briefs to replay", async () => {
    const t = await app();
    t.setDraftRoute("review", { model: SONNET, advisor: true });
    await t.proposeRouter();
    expect(t.canKeep(t.r().proposal, t.r().replay)).toBe(true);
    await t.keepRouter();
    expect(t.routedRequest("review", { model: OPUS, maxTokens: 1, effort: "low", system: [], messages: [] })).toMatchObject({ model: SONNET, advisor: { model: OPUS } });
  });
});
