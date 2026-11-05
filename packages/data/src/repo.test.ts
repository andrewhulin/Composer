import { describe, expect, it } from "vitest";
import { diffGraphs, sequentialIds, type Graph, type Weight } from "@composer/core";
import { claude, graphOf, source, wire } from "@composer/core/testing";
import { migrate } from "./migrations";
import { nodeSqliteDriver } from "./node-sqlite";
import { Repo, type Clock } from "./repo";

function setup() {
  const db = nodeSqliteDriver();
  let t = 0;
  const clock: Clock = { now: () => new Date(Date.UTC(2026, 10, 4, 11, 0, t++)).toISOString() };
  return { db, repo: new Repo(db, sequentialIds("x"), clock) };
}

const g1 = (): Graph => graphOf([source("s"), claude("c")], [wire("s", "c", "context")]);

describe("migrations", () => {
  it("apply once and are idempotent", async () => {
    const { db } = setup();
    expect(await migrate(db)).toEqual([1]);
    expect(await migrate(db)).toEqual([]);
  });
});

describe("Repo", () => {
  it("dedupes blobs by content", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const a = await repo.putBlob({ b: 1, a: 2 }, "test");
    const b = await repo.putBlob({ a: 2, b: 1 }, "test");
    expect(a).toBe(b);
    expect((await db.all("SELECT COUNT(*) AS n FROM blob"))[0]!.n).toBe(1);
    expect(await repo.getBlob(a)).toEqual({ a: 2, b: 1 });
  });

  it("round-trips the working graph", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProject("Recap after a session");
    const g = g1();
    await repo.saveWorking(p.id, g);
    expect(await repo.loadWorking(p.id)).toEqual(g);
  });

  it("records snapshots as a chain and rebuilds any of them", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProject("P");
    const a = g1();
    const b = { ...a, nodes: { ...a.nodes, s: { ...a.nodes.s!, weight: "heavy" as Weight } } };
    const s1 = await repo.snapshot({ projectId: p.id, graph: a, kind: "run", phase: "understand" });
    const s2 = await repo.snapshot({ projectId: p.id, graph: b, kind: "lock", phase: "understand", label: "Interviews synthesized" });
    expect(s2.parentId).toBe(s1.id);
    expect([s1.seq, s2.seq]).toEqual([1, 2]);
    expect((await repo.lineage(s2.id)).map((s) => s.id)).toEqual([s1.id, s2.id]);
    const before = await repo.loadGraph(s1.manifestHash);
    const after = await repo.loadGraph(s2.manifestHash);
    expect(diffGraphs(before, after)).toEqual([{ type: "node_changed", id: "s", fields: ["weight"] }]);
    // Unchanged node blobs are shared between snapshots.
    expect((await db.all("SELECT COUNT(*) AS n FROM blob WHERE kind = 'node'"))[0]!.n).toBe(3);
  });

  it("branches from a snapshot without losing the old branch, and undo deletes nothing", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProject("P");
    const s1 = await repo.snapshot({ projectId: p.id, graph: g1(), kind: "run", phase: "define" });
    const s2 = await repo.snapshot({ projectId: p.id, graph: graphOf([source("s")]), kind: "swap", phase: "define" });
    const b = await repo.branchFrom(p.id, s1.id, "H2");
    const s3 = await repo.snapshot({ projectId: p.id, graph: g1(), kind: "run", phase: "define" });
    expect(s3.parentId).toBe(s1.id);
    expect(s3.branchId).toBe(b.id);
    expect((await repo.listBranches(p.id)).map((x) => x.name)).toEqual(["main", "H2"]);
    const count = async () => (await db.all("SELECT COUNT(*) AS n FROM snapshot"))[0]!.n;
    const n = await count();
    await repo.moveHead(p.id, s1.id);
    expect(await count()).toBe(n);
    expect(await repo.getSnapshot(s2.id)).toBeDefined();
  });

  it("switches back to an earlier branch: its head becomes the working graph", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProject("P");
    const g = g1();
    const s1 = await repo.snapshot({ projectId: p.id, graph: g, kind: "run", phase: "define" });
    const main = p.branchId;
    await repo.branchFrom(p.id, s1.id, "H2");
    await repo.snapshot({ projectId: p.id, graph: graphOf([source("other")]), kind: "swap", phase: "define" });
    await repo.switchBranch(p.id, main);
    expect((await repo.getProject(p.id))!.branchId).toBe(main);
    expect(await repo.loadWorking(p.id)).toEqual(g);
  });

  it("versions locked outputs and logs each lock as a decision", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProject("P");
    const v1 = await repo.lockOutput({ projectId: p.id, familyId: "fam", phase: "define", loop: 1, content: { text: "v1" } });
    const v2 = await repo.lockOutput({ projectId: p.id, familyId: "fam", phase: "define", loop: 1, content: { text: "v2" } });
    expect([v1.version, v2.version]).toEqual([1, 2]);
    expect((await repo.latestVersion("fam"))!.id).toBe(v2.id);
    expect((await repo.listDecisions(p.id)).map((d) => d.kind)).toEqual(["lock", "lock"]);
  });

  it("keeps hypothesis blocks forever: status changes are logged, never deletes", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProject("P");
    const h1 = await repo.createHypothesis({ projectId: p.id, label: "H1", statement: "Show the transcript", vars: [{ key: "audience", value: "all users" }], status: "testing", confidence: 0.4 });
    const h2 = await repo.createHypothesis({ projectId: p.id, label: "H2", statement: "Proof of progress", vars: [{ key: "audience", value: "returning users" }], status: "testing", confidence: 0.62, parentId: h1.id });
    await repo.setHypothesisStatus(h1.id, "retired", "Swapped audience to returning users", "failed T0 · 9%");
    const chain = await repo.listHypotheses(p.id);
    expect(chain.map((h) => [h.label, h.status])).toEqual([["H1", "retired"], ["H2", "testing"]]);
    expect(chain[1]!.parentId).toBe(h1.id);
    expect(chain[0]!.note).toBe("failed T0 · 9%");
    expect(h2.vars[0]!.value).toBe("returning users");
  });

  it("tracks runs and marks orphaned ones interrupted on boot", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProject("P");
    const base = { projectId: p.id, nodeId: "c", recipe: "draft_statement", localKey: "k", envKey: "e", inputManifestHash: null, model: "claude-opus-5-5", effort: "high", templateVersionId: null, ruleIds: [], foundationIds: [], startedSeq: 1 };
    await repo.startRun({ ...base, id: "r1" });
    await repo.startRun({ ...base, id: "r2" });
    await repo.finishRun("r1", { status: "succeeded", outputHash: "out", usage: { input: 10, output: 5 } });
    expect(await repo.interruptOrphanedRuns()).toBe(1);
    const runs = await repo.runsForNode("c");
    expect(runs.map((r) => r.status)).toEqual(["succeeded", "interrupted"]);
    expect(runs[0]!.usage).toEqual({ input: 10, output: 5 });
    await repo.score("r1", 4, "raw quotes landed");
    await expect(repo.score("r1", 7)).rejects.toThrow();
    expect(await repo.scoresForRun("r1")).toEqual([{ value: 4, note: "raw quotes landed" }]);
  });

  it("rolls back a transaction that fails halfway", async () => {
    const { db, repo } = setup();
    await migrate(db);
    await expect(db.tx([{ sql: "INSERT INTO setting (key, value) VALUES ('a', '1')" }, { sql: "INSERT INTO nope VALUES (1)" }])).rejects.toThrow();
    expect(await repo.getSetting("a")).toBeUndefined();
  });
});

describe("craft tier", () => {
  it("versions each foundation slot and serves the latest", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const v1 = await repo.saveFoundation("design_system", "3.2", { name: "Pebble", radius: 12 }, null, null);
    await repo.saveFoundation("philosophy", "rev 1", { rev: 1 }, null, null);
    await repo.saveFoundation("design_system", "3.3", { name: "Pebble", radius: 8 }, { kind: "change", title: "radius/card 12 → 8", text: "7 overrides" }, v1.id);
    const latest = await repo.latestFoundation<{ radius: number }>("design_system");
    expect(latest?.row.version).toBe("3.3");
    expect(latest?.content.radius).toBe(8);
    expect(latest?.row.changelog?.title).toBe("radius/card 12 → 8");
    expect((await repo.listFoundations("design_system")).map((r) => r.version)).toEqual(["3.2", "3.3"]);
    expect((await repo.allDecisions()).filter((d) => d.kind === "foundation")).toHaveLength(3);
  });

  it("keeps proposals pending until resolved, and logs the decision", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProposal({ targetKind: "design_system", baseVersion: "3.2", diff: { token: "radius/card", from: "12px", to: "8px" }, rationale: "7 overrides across 3 builds", evidence: ["b1", "b2", "b3"] });
    expect((await repo.listProposals("pending")).map((x) => x.diff)).toEqual([{ token: "radius/card", from: "12px", to: "8px" }]);
    await repo.resolveProposal(p.id, "rejected", "Wrong idea: corners stay soft");
    expect(await repo.listProposals("pending")).toEqual([]);
    expect((await repo.listProposals())[0]).toMatchObject({ status: "rejected", evidence: ["b1", "b2", "b3"] });
    expect((await repo.allDecisions()).at(-1)).toMatchObject({ kind: "proposal_rejected", statement: "Wrong idea: corners stay soft" });
  });

  it("keeps rules in lineages and retires them without deleting", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const r1 = await repo.addRule("define", "Quote people verbatim.", null);
    const r2 = await repo.addRule("define", "Quote people verbatim, with who said it.", null, r1.lineageId);
    expect(r2.version).toBe(2);
    await repo.retireRule(r1.id, "Superseded");
    expect((await repo.listRules()).map((r) => r.body)).toEqual(["Quote people verbatim, with who said it."]);
    expect((await repo.listRules("retired")).map((r) => r.id)).toEqual([r1.id]);
  });

  it("lists runs with their latest score", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProject("P");
    const base = { projectId: p.id, nodeId: "n", recipe: "draft_statement", localKey: "k", envKey: "e", inputManifestHash: null, model: "m", effort: "high", templateVersionId: null, ruleIds: ["R1"], foundationIds: [], startedSeq: 1 };
    await repo.startRun({ ...base, id: "a" });
    await repo.startRun({ ...base, id: "b", startedSeq: 2 });
    await repo.score("a", 2);
    await repo.score("a", 5, "much better on reread");
    await repo.score("b", 1);
    const scored = await repo.scoredRuns();
    expect(scored.map((s) => [s.run.id, s.score, s.note])).toEqual([["a", 5, "much better on reread"], ["b", 1, null]]);
    expect(scored[0]!.run.ruleIds).toEqual(["R1"]);
    expect(await repo.latestScore("a")).toBe(5);
  });
});
