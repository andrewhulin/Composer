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
