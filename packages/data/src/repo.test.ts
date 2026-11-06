import { describe, expect, it } from "vitest";
import { diffGraphs, sequentialIds, type Graph, type Weight } from "@composer/core";
import { claude, graphOf, hypothesis, output, source, wire } from "@composer/core/testing";
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
    expect(await migrate(db)).toEqual([1, 2, 3, 4, 5]);
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

  it("records what a run cost, which model finished it, its advisor consultations and escalation", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProject("P");
    const base = { projectId: p.id, nodeId: "c", recipe: "prototype", localKey: "k", envKey: "e", inputManifestHash: null, model: "claude-sonnet-5-5", effort: "high", templateVersionId: null, ruleIds: [], foundationIds: [], startedSeq: 1 };
    await repo.startRun({ ...base, id: "r1" });
    await repo.finishRun("r1", { status: "succeeded", model: "claude-opus-5-5", cost: 0.42, advisor: [{ kind: "redacted" }], escalatedFrom: "claude-sonnet-5-5", usage: { input: 10, output: 5 } });
    await repo.startRun({ ...base, id: "r2" });
    await repo.finishRun("r2", { status: "failed", error: "x", cost: 0.08 });
    const [r1, r2] = await repo.runsForNode("c");
    expect(r1).toMatchObject({ model: "claude-opus-5-5", cost: 0.42, advisor: [{ kind: "redacted" }], escalatedFrom: "claude-sonnet-5-5" });
    expect(r2).toMatchObject({ model: "claude-sonnet-5-5", cost: 0.08, advisor: null, escalatedFrom: null });
    expect(await repo.projectSpend(p.id)).toBeCloseTo(0.5);
    const proposal = await repo.createProposal({ targetKind: "router", baseVersion: "r1", diff: {}, rationale: "", evidence: [] });
    const c = await repo.keepReplayCase({ projectId: p.id, phase: "build", recipe: "prototype", runId: "r1", name: "n", promptHash: "ph", outputHash: "oh" });
    await repo.saveReplayResult({ proposalId: proposal.id, caseId: c.id, status: "done", outputHash: "x", usage: { input: 3, output: 4 }, model: "claude-haiku-5-5" });
    expect((await repo.replayResults(proposal.id))[0]).toMatchObject({ usage: { input: 3, output: 4 }, model: "claude-haiku-5-5" });
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

  it("records pairwise picks, keeps replay briefs and judges replays", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProject("P");
    const base = { projectId: p.id, nodeId: "n", recipe: "prototype", localKey: "k", envKey: "e", inputManifestHash: null, model: "m", effort: "high", templateVersionId: null, ruleIds: [], foundationIds: [], startedSeq: 1 };
    await repo.startRun({ ...base, id: "a" });
    await repo.startRun({ ...base, id: "b" });
    await expect(repo.addPick({ projectId: p.id, phase: "build", winnerRunId: "a", loserRunId: "a", source: "variants" })).rejects.toThrow();
    await repo.addPick({ projectId: p.id, phase: "build", winnerRunId: "a", loserRunId: "b", source: "variants", note: "clearer CTA" });
    expect((await repo.listPicks("build")).map((x) => [x.winnerRunId, x.loserRunId, x.note])).toEqual([["a", "b", "clearer CTA"]]);
    expect(await repo.listPicks("define")).toEqual([]);
    expect((await repo.listDecisions(p.id)).some((d) => d.kind === "pick")).toBe(true);

    const c = await repo.keepReplayCase({ projectId: p.id, phase: "build", recipe: "prototype", runId: "a", name: "Recap v1", promptHash: "ph", outputHash: "oh" });
    const again = await repo.keepReplayCase({ projectId: p.id, phase: "build", recipe: "prototype", runId: "a", name: "Recap, first pass", promptHash: "ph", outputHash: "oh" });
    expect(again.id).toBe(c.id);
    expect((await repo.listReplayCases("build")).map((x) => x.name)).toEqual(["Recap, first pass"]);

    const prop = await repo.createProposal({ targetKind: "rule", diff: { phase: "build", text: "Lead with the moment." }, rationale: "r" });
    const r1 = await repo.saveReplayResult({ proposalId: prop.id, caseId: c.id, outputHash: "x1", status: "done" }, [{ hash: "x1", value: { t: 1 }, kind: "artifact" }]);
    await repo.setReplayPick(r1.id, "candidate");
    expect((await repo.replayResults(prop.id)).map((x) => [x.caseId, x.pick])).toEqual([[c.id, "candidate"]]);
    // Replaying the same brief again replaces the earlier result.
    await repo.saveReplayResult({ proposalId: prop.id, caseId: c.id, status: "error", error: "timeout" });
    expect((await repo.replayResults(prop.id)).map((x) => [x.status, x.pick])).toEqual([["error", null]]);

    await repo.retireReplayCase(c.id);
    expect(await repo.listReplayCases()).toEqual([]);
  });
});

describe("projects on Home", () => {
  const runBase = (projectId: string) => ({ projectId, nodeId: "c", recipe: "synthesize_insights", localKey: "k", envKey: "e", inputManifestHash: null, model: "claude-opus-5-5", effort: "high", templateVersionId: null, ruleIds: [], foundationIds: [], startedSeq: 1 });

  it("archives without counting as an edit, and restores", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const a = await repo.createProject("A");
    const b = await repo.createProject("B");
    await repo.archiveProject(a.id);
    expect((await repo.listProjects()).map((p) => p.name)).toEqual(["B"]);
    const [archived] = await repo.listProjects({ archived: true });
    expect(archived?.name).toBe("A");
    expect(archived?.archivedAt).not.toBeNull();
    expect(archived?.updatedAt).toBe(a.updatedAt);
    await repo.restoreProject(a.id);
    expect((await repo.listProjects()).map((p) => p.name).sort()).toEqual(["A", "B"]);
    expect((await repo.getProject(b.id))?.archivedAt).toBeNull();
  });

  it("duplicates the current state with fresh ids, and leaves history and evidence behind", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProject("Recap");
    const h = await repo.createHypothesis({ projectId: p.id, label: "H1", statement: "Proof of progress", vars: [], status: "testing", confidence: 0.5 });
    await repo.startRun({ ...runBase(p.id), id: "run1" });
    await repo.finishRun("run1", { status: "succeeded", outputHash: "out1" });
    await repo.score("run1", 4);
    const v = await repo.lockOutput({ projectId: p.id, familyId: "fam", phase: "understand", loop: 1, content: { text: "insights" }, runId: "run1" });
    const g = graphOf(
      [source("s"), claude("c"), hypothesis("h", { blockId: h.id }), output("o", { familyId: "fam" }), output("in", { mode: "inlet", familyId: "fam", versionId: v.id, phase: "define" })],
      [wire("s", "c", "context")],
    );
    g.outputs.c = { runId: "run1", hash: "out1", localKey: "lk", envKey: "ek" };
    await repo.saveWorking(p.id, g);
    await repo.snapshot({ projectId: p.id, graph: g, kind: "manual", phase: "understand" });
    await repo.updateProject(p.id, { activePhase: "define" });

    const copy = await repo.duplicateProject(p.id, "Recap copy");
    expect(copy).toMatchObject({ name: "Recap copy", activePhase: "define", loop: 1, archivedAt: null });

    const cg = (await repo.loadWorking(copy.id))!;
    const [cv] = await repo.listVersions(copy.id);
    const [ch] = await repo.listHypotheses(copy.id);
    const [cr] = await repo.runsForProject(copy.id);
    expect(cv!.id).not.toBe(v.id);
    expect(cv!.familyId).not.toBe("fam");
    expect(cv!.contentHash).toBe(v.contentHash);
    expect(cv!.runId).toBe(cr!.id);
    expect(ch!.id).not.toBe(h.id);
    expect(cr!.id).not.toBe("run1");
    expect(cr!.outputHash).toBe("out1");
    // The graph points at the copies, not the originals.
    expect(cg.nodes.h).toMatchObject({ blockId: ch!.id });
    expect(cg.nodes.o).toMatchObject({ familyId: cv!.familyId });
    expect(cg.nodes.in).toMatchObject({ familyId: cv!.familyId, versionId: cv!.id });
    expect(cg.outputs.c?.runId).toBe(cr!.id);
    // History restarts with one snapshot; scores stay with the original run.
    const snaps = await repo.listSnapshots(copy.id);
    expect(snaps.map((s) => [s.kind, s.label])).toEqual([["init", "Duplicated from Recap"]]);
    expect(await repo.scoresForRun(cr!.id)).toEqual([]);
    // The original is untouched.
    expect((await repo.loadWorking(p.id))!.nodes.in).toMatchObject({ versionId: v.id });
    expect(await repo.listSnapshots(p.id)).toHaveLength(1);
  });

  it("lets the caller rekey the copied graph", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const p = await repo.createProject("P");
    await repo.saveWorking(p.id, g1());
    const copy = await repo.duplicateProject(p.id, "P copy", (before, after) => ({ ...after, nodes: { ...after.nodes, c: { ...after.nodes.c!, title: `${before.nodes.c!.title} again` } } }));
    expect((await repo.loadWorking(copy.id))!.nodes.c?.title).toMatch(/ again$/);
  });

  it("covers each project with its newest locked output and newest prototype", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const a = await repo.createProject("A");
    const b = await repo.createProject("B");
    await repo.lockOutput({ projectId: a.id, familyId: "f1", phase: "understand", loop: 1, content: { text: "one" } });
    const later = await repo.lockOutput({ projectId: a.id, familyId: "f2", phase: "define", loop: 1, content: { text: "two" } });
    await repo.startRun({ ...runBase(a.id), id: "p1", recipe: "prototype" });
    await repo.finishRun("p1", { status: "succeeded", outputHash: "proto-old" });
    await repo.startRun({ ...runBase(a.id), id: "p2", recipe: "prototype", startedSeq: 2 });
    await repo.finishRun("p2", { status: "succeeded", outputHash: "proto-new" });
    await repo.startRun({ ...runBase(a.id), id: "p3", recipe: "prototype", startedSeq: 3 });
    await repo.finishRun("p3", { status: "failed" });
    const covers = await repo.projectCovers();
    expect(covers[a.id]).toEqual({ latest: { phase: "define", contentHash: later.contentHash, createdAt: expect.any(String) }, prototypeHash: "proto-new" });
    expect(covers[b.id]).toBeUndefined();
  });
});

describe("design skills", () => {
  const input = { name: "Tight spacing", description: "Dense layouts", source: "folder:/skills/tight", kind: "craft" as const, mode: "always" as const, body: "Use an 8px grid.", files: [{ path: "references/grid.md", content: "8, 16, 24" }], tokens: 6 };

  it("imports a skill with its files and reads its body back", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const { skill, changed } = await repo.saveSkill(input);
    expect(changed).toBe(true);
    expect(skill).toMatchObject({ id: "tight-spacing", version: 1, enabled: true, phases: [], kind: "craft", mode: "always" });
    expect(skill.files.map((f) => f.path)).toEqual(["references/grid.md"]);
    expect(await repo.skillBody(skill.id)).toBe("Use an 8px grid.");
  });

  it("bumps the version only when an update brings new content, and keeps the switches", async () => {
    const { db, repo } = setup();
    await migrate(db);
    const { skill } = await repo.saveSkill(input);
    await repo.updateSkill(skill.id, { enabled: false, phases: ["build"], mode: "on_demand" });
    expect((await repo.saveSkill(input)).changed).toBe(false);
    const { skill: next } = await repo.saveSkill({ ...input, body: "Use a 4px grid." });
    expect(next).toMatchObject({ version: 2, enabled: false, phases: ["build"], mode: "on_demand" });
    expect(await repo.skillBody(skill.id, 1)).toBe("Use an 8px grid.");
    expect(await repo.skillBody(skill.id)).toBe("Use a 4px grid.");
  });

  it("gives skills with the same name from different sources their own ids, and removes one", async () => {
    const { db, repo } = setup();
    await migrate(db);
    await repo.saveSkill(input);
    const { skill: other } = await repo.saveSkill({ ...input, source: "git:someone/skills/tight" });
    expect(other.id).toBe("tight-spacing-2");
    await repo.removeSkill(other.id);
    expect((await repo.listSkills()).map((s) => s.id)).toEqual(["tight-spacing"]);
  });
});
